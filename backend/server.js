const express = require('express');
const http = require('http');
const path = require('path');
const { StringDecoder } = require('string_decoder');
const { WebSocketServer } = require('ws');
const Docker = require('dockerode');
const { registerFileRoutes } = require('./fileManager');
const {
  initializeAuth,
  createSessionMiddleware,
  registerAuthRoutes,
  sessionStore,
} = require('./auth');
const cookie = require('cookie');
const cookieSignature = require('cookie-signature');
const {
  registerJupyterRoutes,
  handleJupyterUpgrade,
  PREFIX: JUPYTER_PREFIX,
} = require('./jupyter');

const IDLE_MS = 60 * 1000;
const LOCAL_DESKTOP_UID = 'local-desktop';
const LOCAL_HOME_VOLUME = 'yuva-home-db789f4e-a926-412c-9ad9-c1ade9199980';
const LOCAL_WORKSPACE_VOLUME = 'yuva-workspace';

function isLocalDesktopRequest(req) {
  if (process.env.YUVA_LOCAL_DESKTOP !== 'true') return false;
  const host = String(req.headers.host || '').toLowerCase();
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
}
const MARK = '\x1b]777;yuva;';
// After every command, bash prints a hidden marker: exit code, last command, directory.
const PROMPT_CMD = String.raw`__y=$?; printf '\033]777;yuva;%s;%s;%s\007' "$__y" "$(history 1 | base64 -w0)" "$(printf %s "$PWD" | base64 -w0)"`;
const DANGEROUS = /\brm\s+-\w*\s+(\/|~|\*)(\s|$)|\bmkfs\b|\bdd\b.*\bof=\/dev\/|:\(\)\s*\{|>\s*\/dev\/sd/;
const SYSTEM = `You are a patient mentor for beginners learning Linux. The learner uses Ubuntu 24.04 in a container with sudo available.
Explain why the command failed in plain, friendly language, in under 60 words, with no jargon.
Suggest at most ONE safe fix command. Never suggest destructive commands (rm -rf, mkfs, dd to devices).
If you cannot suggest a safe fix, use an empty string.
Reply with ONLY JSON, no markdown: {"explanation":"...","fix":"..."}`;

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');


async function askGemini({ cmd, code, cwd, out }) {
  const prompt = `Command: ${cmd}
Exit code: ${code}
Directory: ${cwd}
OS: Ubuntu 24.04
Terminal output:
${out.slice(-1500)}`;

  const models = [
    process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    process.env.GEMINI_FALLBACK_MODEL,
  ].filter(Boolean);

  let lastErr;

  for (const model of models) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': process.env.GEMINI_API_KEY,
          },
          signal: controller.signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              maxOutputTokens: 200,
              temperature: 0.2,
            },
          }),
        }
      );

      const j = await r.json();

      if (!r.ok) {
        throw new Error(
          (j.error && j.error.message) || `HTTP ${r.status}`
        );
      }

      const text = (
        (j.candidates?.[0]?.content?.parts) || []
      ).map((p) => p.text || '').join('');

      const clean = text.replace(/```json|```/g, '').trim();
      const result = JSON.parse(clean);

      return {
        explanation: String(result.explanation || ''),
        fix: String(result.fix || ''),
      };
    } catch (e) {
      lastErr = e;
      console.error(
        'gemini',
        model,
        e.name === 'AbortError'
          ? 'Request timed out after 30 seconds'
          : e.message
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastErr || new Error('All Gemini models failed');
}


const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const app = express();

// Share one session middleware between HTTP routes and WebSocket upgrades.
const sessionMiddleware = createSessionMiddleware();
app.use(sessionMiddleware);
registerAuthRoutes(app);

// Keep authentication available for later reattachment. The desktop bypass
// applies only to requests addressed to loopback.
app.use((req, res, next) => {
  if (isLocalDesktopRequest(req)) {
    req.session.user = { id: LOCAL_DESKTOP_UID };
  }
  next();
});

registerJupyterRoutes(app, docker);

app.use(express.static(path.join(__dirname, '../frontend')));
app.get('/config', (req, res) => res.json({ jupyterBasePath: '/api/jupyter/' }));
registerFileRoutes(app, getContainer);

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const users = new Map();

// Verify the signed session cookie against the PostgreSQL session store.
server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const isJupyterUpgrade =
    pathname === JUPYTER_PREFIX ||
    pathname.startsWith(`${JUPYTER_PREFIX}/`);

  if (pathname !== '/term' && !isJupyterUpgrade) {
    socket.destroy();
    return;
  }

  const reject = (status) => {
    socket.end(
      `HTTP/1.1 ${status}\r\n` +
      'Connection: close\r\n' +
      'Content-Length: 0\r\n\r\n'
    );
  };

  if (isLocalDesktopRequest(req)) {
    req.session = { user: { id: LOCAL_DESKTOP_UID } };
    if (isJupyterUpgrade) {
      handleJupyterUpgrade(req, socket, head, LOCAL_DESKTOP_UID, docker)
        .catch((error) => {
          console.error('Local Jupyter upgrade failed:', error.message);
          if (!socket.destroyed) socket.destroy();
        });
    } else {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
    return;
  }

  try {
    const cookies = cookie.parse(req.headers.cookie || '');
    const signedSid = cookies['yuva.sid'];

    if (!signedSid || !signedSid.startsWith('s:')) {
      reject('401 Unauthorized');
      return;
    }

    const sid = cookieSignature.unsign(
      signedSid.slice(2),
      process.env.SESSION_SECRET
    );

    if (!sid) {
      reject('401 Unauthorized');
      return;
    }

    sessionStore.get(sid, (error, storedSession) => {
      if (error) {
        console.error('WebSocket session lookup failed:', error.message);
        reject('500 Internal Server Error');
        return;
      }

      if (!storedSession?.user?.id) {
        reject('401 Unauthorized');
        return;
      }

      req.session = storedSession;

      if (isJupyterUpgrade) {
        handleJupyterUpgrade(
          req, socket, head, storedSession.user.id, docker
        ).catch((error) => {
          console.error('Jupyter upgrade failed:', error.message);
          if (!socket.destroyed) socket.destroy();
        });
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    });
  } catch (error) {
    console.error('WebSocket authentication failed:', error.message);
    reject('400 Bad Request');
  }
});

async function getContainer(uid) {
  const isLocal = uid === LOCAL_DESKTOP_UID;
  const name = isLocal ? 'yuva-local-desktop' : `yuva-${uid}`;
  const homeVolume = isLocal ? LOCAL_HOME_VOLUME : `yuva-home-${uid}`;
  const workspaceVolume = isLocal
    ? LOCAL_WORKSPACE_VOLUME
    : `yuva-workspace-${uid}`;
  const c = docker.getContainer(name);
  try {
    const info = await c.inspect();
    if (info.State.Paused) await c.unpause();
    else if (!info.State.Running) await c.start();
    return c;
  } catch (e) { if (e.statusCode !== 404) throw e; }
  
const nc = await docker.createContainer({
  name,
  Image: 'yuva-ubuntu',
  Cmd: ['sleep', 'infinity'],
  User: 'ubuntu',
  WorkingDir: '/home/ubuntu',
  HostConfig: {
    Binds: [
      `${homeVolume}:/home/ubuntu`,
      `${workspaceVolume}:/workspace`,
    ],
    Memory: 512 * 1024 * 1024,
    NanoCpus: 1e9,
    PidsLimit: 256,
  },
});

  await nc.start();

  // Initialize standard home folders without overwriting user data.
  const init = await nc.exec({
    Cmd: [
      'sh', '-lc',
      'mkdir -p /home/ubuntu/Documents /home/ubuntu/Downloads /home/ubuntu/Desktop /home/ubuntu/Pictures /home/ubuntu/Videos /home/ubuntu/Music && chown ubuntu:ubuntu /home/ubuntu/Documents /home/ubuntu/Downloads /home/ubuntu/Desktop /home/ubuntu/Pictures /home/ubuntu/Videos /home/ubuntu/Music'
    ],
    AttachStdout: true,
    AttachStderr: true,
    User: 'root',
  });
  const initStream = await init.start({ hijack: true, stdin: false });
  await new Promise((resolve, reject) => {
    initStream.on('end', resolve);
    initStream.on('error', reject);
  });
  const initInfo = await init.inspect();
  if (initInfo.ExitCode !== 0) {
    throw new Error('Could not initialize standard home folders');
  }

  return nc;
}

wss.on('connection', async (ws, req) => {
  const uid = req.session?.user?.id;
  if (!uid) { ws.close(); return; }

  const u = users.get(uid) || { count: 0, timer: null, calls: [] };
  users.set(uid, u);
  u.count++;
  clearTimeout(u.timer);

  const send = (o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
  let stream, exec, pending = '', recentOut = '', lastHist = '';
  let size = { cols: 80, rows: 24 };

  async function mentor(cmd, code, cwd, out) {
    const now = Date.now();
    u.calls = u.calls.filter((t) => now - t < 60000);
    if (!process.env.GEMINI_API_KEY) return send({ type: 'mentor_error', message: 'Mentor is off: add GEMINI_API_KEY to .env' });
    if (u.calls.length >= 10) return send({ type: 'mentor_error', message: 'Mentor rate limit reached. Try again in a minute.' });
    u.calls.push(now);
    send({ type: 'mentor_start', cmd });
    try {
      const r = await askGemini({ cmd, code, cwd, out });
      let fix = r.fix.trim(), warn = '';
      if (fix && DANGEROUS.test(fix)) { warn = 'A suggested fix was blocked because it looks destructive.'; fix = ''; }
      send({ type: 'mentor', cmd, explanation: r.explanation, fix, warn });
    } catch (e) { send({ type: 'mentor_error', message: 'Mentor could not reach Gemini: ' + e.message }); }
  }

  function handleMarker(payload) {
    const [code, h, p] = payload.split(';');
    const hist = Buffer.from(h || '', 'base64').toString('utf8').trim();
    const cwd = Buffer.from(p || '', 'base64').toString('utf8');
    const out = recentOut; recentOut = '';
    const m = hist.match(/^(\d+)\s+([\s\S]*)$/);
    if (!m || hist === lastHist) return;
    lastHist = hist;
    if (code === '0' || code === '130') return;
    mentor(m[2], code, cwd, out);
  }

  function filter(text) {
    pending += text;
    let out = '';
    for (;;) {
      const i = pending.indexOf(MARK);
      if (i === -1) {
        let keep = 0;
        for (let k = Math.min(MARK.length - 1, pending.length); k > 0; k--) {
          if (MARK.startsWith(pending.slice(-k))) { keep = k; break; }
        }
        out += pending.slice(0, pending.length - keep);
        pending = pending.slice(pending.length - keep);
        break;
      }
      const end = pending.indexOf('\x07', i);
      out += pending.slice(0, i);
      if (end === -1) { pending = pending.slice(i); break; }
      handleMarker(pending.slice(i + MARK.length, end));
      pending = pending.slice(end + 1);
    }
    return out;
  }

  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === 'input' && stream) stream.write(msg.data);
    if (msg.type === 'resize') {
      size = { cols: msg.cols, rows: msg.rows };
      if (exec) exec.resize({ w: size.cols, h: size.rows }).catch(() => {});
    }
  });

  ws.on('close', () => {
    try { stream && stream.end(); } catch {}
    u.count--;
    if (u.count <= 0) {
      u.timer = setTimeout(() => {
        docker.getContainer(`yuva-${uid}`).pause().catch(() => {});
        console.log('paused', uid);
      }, IDLE_MS);
    }
  });

  try {
    send({ type: 'out', data: 'Starting your Linux container...\r\n' });
    const container = await getContainer(uid);
    exec = await container.exec({
      Cmd: ['/bin/bash', '-l'], AttachStdin: true, AttachStdout: true, AttachStderr: true,
      Tty: true, Env: ['TERM=xterm-256color', 'PROMPT_COMMAND=' + PROMPT_CMD],
    });
    stream = await exec.start({ hijack: true, stdin: true, Tty: true });
    await exec.resize({ w: size.cols, h: size.rows }).catch(() => {});
    const dec = new StringDecoder('utf8');
    stream.on('data', (d) => {
      const out = filter(dec.write(d));
      if (out) { recentOut = (recentOut + stripAnsi(out)).slice(-4000); send({ type: 'out', data: out }); }
    });
    stream.on('end', () => ws.close());
  } catch (e) {
    send({ type: 'out', data: '\r\nError: ' + e.message + '\r\n(did you run: make image ?)\r\n' });
    ws.close();
  }
});

initializeAuth()
  .then(() => {
    server.listen(process.env.PORT || 8080, () => {
      console.log('YuVA running');
    });
  })
  .catch((error) => {
    console.error('YuVA startup failed:', error.message);
    process.exit(1);
  });
