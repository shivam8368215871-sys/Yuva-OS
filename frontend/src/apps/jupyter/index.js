import { registerApp } from '../../core/appRegistry.js';

registerApp({
  id: 'jupyter', title: 'JupyterLab', defaultSize: { w: 900, h: 600 }, singleton: true,
  mount(container, ctx) {
    const f = document.createElement('iframe');
    const base = new URL(ctx.config.jupyterBasePath || '/api/jupyter/', location.origin).toString().replace(/\/$/, '');
    const notebookUrl = (path) =>
      `${base}/lab/tree/${String(path).split('/').map(encodeURIComponent).join('/')}`;

    f.src = `${base}/lab`;
    f.style.cssText = 'width:100%;height:100%;border:0';
    container.appendChild(f);

    // Also works when the singleton Jupyter window is already open.
    const openNotebook = (event) => {
      const path = event.detail?.path;
      if (path) f.src = notebookUrl(path);
    };
    window.addEventListener('yuva:open-notebook', openNotebook);

    // Handle a notebook request made just before this app mounted.
    const pending = window.__yuvaPendingNotebook;
    if (pending) {
      delete window.__yuvaPendingNotebook;
      f.src = notebookUrl(pending);
    }
  },
});
