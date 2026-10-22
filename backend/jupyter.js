const crypto = require('crypto');
const httpProxy = require('http-proxy');

const NETWORK = process.env.YUVA_DOCKER_NETWORK || 'yuva_default';
const IMAGE = process.env.JUPYTER_IMAGE ||
  'quay.io/jupyter/minimal-notebook:latest';
const PREFIX = '/api/jupyter';

const proxy = httpProxy.createProxyServer({
  changeOrigin: true,
  xfwd: true,
  ws: true,
  timeout: 120000,
  proxyTimeout: 120000,
});

proxy.on('error', (error, req, response) => {
  console.error('Jupyter proxy error:', error.message);

  if (response && typeof response.writeHead === 'function') {
    if (!response.headersSent) {
      response.writeHead(502, { 'Content-Type': 'text/plain' });
    }
    if (!response.writableEnded) response.end('Notebook service unavailable');
  } else if (response && typeof response.destroy === 'function') {
    response.destroy();
  }
});

function sendHttpError(socket, status, message) {
  if (socket.destroyed) return;
  socket.end(
    `HTTP/1.1 ${status}\r\n` +
    'Connection: close\r\n' +
    'Content-Type: text/plain\r\n' +
    `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n` +
    message
  );
}

async function getJupyter(uid, docker) {
  const isLocal = uid === 'local-desktop';
  if (!isLocal && !/^[0-9a-f-]{36}$/i.test(uid)) {
    throw new Error('Invalid authenticated user ID');
  }

  const name = isLocal ? 'yuva-jupyter-local' : `yuva-jupyter-${uid}`;
  const homeVolume = isLocal
    ? 'yuva-home-db789f4e-a926-412c-9ad9-c1ade9199980'
    : `yuva-home-${uid}`;
  const workspaceVolume = isLocal
    ? 'yuva-workspace'
    : `yuva-workspace-${uid}`;
  let container = docker.getContainer(name);
  let info;

  try {
    info = await container.inspect();
  } catch (error) {
    if (error.statusCode !== 404) throw error;

    const token = crypto.randomBytes(32).toString('hex');

    container = await docker.createContainer({
      name,
      Image: IMAGE,
      Env: [`JUPYTER_TOKEN=${token}`],
      Cmd: [
        'start-notebook.py',
        '--ServerApp.base_url=/api/jupyter/',
        '--ServerApp.ip=0.0.0.0',
        '--ServerApp.port=8888',
        '--ServerApp.allow_remote_access=True',
        `--IdentityProvider.token=${token}`,
        '--ServerApp.tornado_settings={"headers":{"Content-Security-Policy":"frame-ancestors \'self\'"}}',
      ],
      HostConfig: {
        NetworkMode: NETWORK,
        Binds: [
          `${homeVolume}:/home/jovyan/yuva-home`,
          `${workspaceVolume}:/home/jovyan/work`,
        ],
        Memory: 2 * 1024 * 1024 * 1024,
        NanoCpus: 2 * 1e9,
        PidsLimit: 256,
        RestartPolicy: { Name: 'unless-stopped' },
      },
      Labels: {
        'yuva.managed': 'true',
        'yuva.user-id': uid,
      },
    });

    await container.start();
    info = await container.inspect();
  }

  // Never trust a container merely because its name matches this user.
  const labels = info.Config.Labels || {};
  const mounts = info.Mounts || [];
  const networks = info.NetworkSettings?.Networks || {};
  const commands = info.Config.Cmd || [];
  const publishedPorts = Object.values(
    info.HostConfig?.PortBindings || {}
  ).some((bindings) => Array.isArray(bindings) && bindings.length > 0);

  const hasMount = (volume, destination) =>
    mounts.some((mount) =>
      mount.Type === 'volume' &&
      mount.Name === volume &&
      mount.Destination === destination
    );

  const validContainer =
    labels['yuva.managed'] === 'true' &&
    labels['yuva.user-id'] === uid &&
    info.HostConfig?.NetworkMode === NETWORK &&
    Boolean(networks[NETWORK]) &&
    hasMount(homeVolume, '/home/jovyan/yuva-home') &&
    hasMount(workspaceVolume, '/home/jovyan/work') &&
    mounts.length === 2 &&
    !publishedPorts &&
    commands.includes('--ServerApp.base_url=/api/jupyter/') &&
    commands.includes('--ServerApp.port=8888');

  if (!validContainer) {
    throw new Error('Notebook container failed its security checks');
  }

  const tokenEntry = (info.Config.Env || []).find(
    (entry) => entry.startsWith('JUPYTER_TOKEN=')
  );
  const token = tokenEntry?.slice('JUPYTER_TOKEN='.length);

  if (
    !token ||
    !info.Config.Image ||
    !commands.includes(`--IdentityProvider.token=${token}`)
  ) {
    throw new Error('Notebook container configuration is incomplete');
  }

  if (!info.State.Running) {
    await container.start();
  }

  // Wait for Jupyter to become responsive before proxying the request.
  const target = `http://${name}:8888`;
  let lastError;

  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(`${target}${PREFIX}/api`, {
        headers: { Authorization: `token ${token}` },
        signal: AbortSignal.timeout(1500),
      });

      if (response.ok) return { name, target, token };
      lastError = new Error(`Jupyter returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(
    `Notebook did not become ready: ${lastError?.message || 'timeout'}`
  );
}

function proxyOptions(notebook) {
  return {
    target: notebook.target,
    changeOrigin: true,
    headers: { Authorization: `token ${notebook.token}` },
  };
}

function registerJupyterRoutes(app, docker) {
  // Do not mount at PREFIX: the proxy must retain the full base URL.
  app.use(async (req, res, next) => {
    if (
      req.path !== PREFIX &&
      !req.path.startsWith(`${PREFIX}/`)
    ) {
      return next();
    }

    const uid = req.session?.user?.id;
    if (!uid) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const notebook = await getJupyter(uid, docker);
      proxy.web(req, res, proxyOptions(notebook), (error) => {
        console.error('Jupyter HTTP proxy failed:', error.message);
        if (!res.headersSent) {
          res.status(502).json({ error: 'Notebook service unavailable' });
        } else if (!res.writableEnded) {
          res.end();
        }
      });
    } catch (error) {
      console.error('Jupyter request failed:', error.message);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Notebook service unavailable' });
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  });
}

async function handleJupyterUpgrade(req, socket, head, uid, docker) {
  try {
    const notebook = await getJupyter(uid, docker);
    proxy.ws(req, socket, head, proxyOptions(notebook), (error) => {
      console.error('Jupyter WebSocket proxy failed:', error.message);
      sendHttpError(socket, 502, 'Notebook service unavailable');
    });
  } catch (error) {
    console.error('Jupyter WebSocket request failed:', error.message);
    sendHttpError(socket, 502, 'Notebook service unavailable');
  }
}

module.exports = {
  registerJupyterRoutes,
  handleJupyterUpgrade,
  PREFIX,
};
