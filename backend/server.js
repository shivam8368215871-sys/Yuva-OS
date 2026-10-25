const express = require('express');
const { registerCompanionRoutes } = require('./companion');
const http = require('http');
const path = require('path');
const { StringDecoder } = require('string_decoder');
const { WebSocketServer } = require('ws');
const Docker = require('dockerode');
const { registerFileRoutes } = require('./fileManager');
const {
  initializeSharedFiles,
  registerSharedFileRoutes,
} = require('./sharedFiles');
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
app.use(express.json({ limit: '10mb' }));

// Share one session middleware between HTTP routes and WebSocket upgrades.
const sessionMiddleware = createSessionMiddleware();
app.use(sessionMiddleware);
registerAuthRoutes(app);
registerCompanionRoutes(app);

registerJupyterRoutes(app, docker);

app.use(express.static(path.join(__dirname, '../frontend')));
app.get('/config', (req, res) => res.json({ jupyterBasePath: '/api/jupyter/' }));
registerFileRoutes(app, getContainer);
registerSharedFileRoutes(app);

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
  if (!/^[0-9a-f-]{36}$/i.test(uid)) {
    throw new Error('Invalid authenticated user ID');
  }

  const name = `yuva-${uid}`;
  const homeVolume = `yuva-home-${uid}`;
  const workspaceVolume = `yuva-workspace-${uid}`;

  const expectedMounts = new Map([
    [homeVolume, '/home/ubuntu'],
    [workspaceVolume, '/workspace'],
  ]);

  const container = docker.getContainer(name);

  try {
    const info = await container.inspect();

    // Fail closed: never use a container with unexpected mounts.
    const mounts = info.Mounts || [];

    const validMounts =
      mounts.length === expectedMounts.size &&
      mounts.every((mount) =>
        mount.Type === 'volume' &&
        expectedMounts.get(mount.Name) === mount.Destination
      );

    if (!validMounts) {
      throw new Error(
        `Filesystem isolation check failed for ${name}. ` +
        'Container mounts do not match this student. ' +
        'Container was not changed.'
      );
    }

    if (info.Config?.Image !== 'yuva-ubuntu') {
      throw new Error(
        `Unexpected image for ${name}. Container was not changed.`
      );
    }

    if (info.Config?.User !== 'ubuntu') {
      throw new Error(
        `Unexpected container user for ${name}. Container was not changed.`
      );
    }

    if (info.State.Paused) {
      await container.unpause();
    } else if (!info.State.Running) {
      await container.start();
    }

    return container;

  } catch (error) {
    if (error.statusCode !== 404) {
      throw error;
    }
  }

  // Create only the authenticated student's own container.
  const newContainer = await docker.createContainer({
    name,
    Image: 'yuva-ubuntu',
    Cmd: ['sleep', 'infinity'],
    User: 'ubuntu',
    WorkingDir: '/home/ubuntu',

    Labels: {
      'yuva.managed': 'true',
      'yuva.user-id': uid,
    },

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

  await newContainer.start();

  // Initialize standard directories without touching existing volumes.
  const init = await newContainer.exec({
    Cmd: [
      '/bin/bash',
      '-lc',
      'mkdir -p /home/ubuntu /workspace && ' +
      'chown -R ubuntu:ubuntu /home/ubuntu /workspace'
    ],
    User: 'root',
    AttachStdout: true,
    AttachStderr: true,
  });

  const stream = await init.start({ hijack: false, stdin: false });

  await new Promise((resolve, reject) => {
    newContainer.modem.demuxStream(
      stream,
      process.stdout,
      process.stderr
    );

    stream.on('end', resolve);
    stream.on('error', reject);
  });

  const initResult = await init.inspect();

  if (initResult.ExitCode !== 0) {
    throw new Error(
      `Filesystem initialization failed for ${name}`
    );
  }

  return newContainer;
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
  .then(() => initializeSharedFiles())
  .then(() => {
    server.listen(process.env.PORT || 8080, () => {
      console.log('YuVA running');
    });
  })
  .catch((error) => {
    console.error('YuVA startup failed:', error.message);
    process.exit(1);
  });
