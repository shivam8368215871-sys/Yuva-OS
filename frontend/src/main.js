import { apps } from './core/appRegistry.js';
import {
  launch, subscribeWindows, focusWindow, minimizeWindow, closeWindow, toggleMaximize, snapWindow,
} from './core/windowManager.js';
import { createIcon } from './core/icons.js';
import { showMenu } from './core/contextMenu.js';
import { applySettings, getSettings, setSetting, WALLPAPERS } from './core/settings.js';
import { initTray } from './core/tray.js';
import { initWidgets } from './core/widgets.js';
import { initAuthGate } from './auth.js';

import './apps/jupyter/index.js';
import './apps/browser/index.js';
import './apps/terminal/index.js';
import './apps/files/index.js';
import './apps/calendar/index.js';
import './apps/calculator/index.js';
import './apps/editor/index.js';
import './apps/notes/index.js';
import './apps/tasks/index.js';
import './apps/clock/index.js';
import './apps/paint/index.js';
import './apps/settings/index.js';
import './apps/companion/index.js';

const taskbar = document.getElementById('taskbar');
const desktop = document.getElementById('desktop');
await initAuthGate({ desktop, taskbar });

const config = await (await fetch('/config')).json();

const launcherButton = document.createElement('button');
launcherButton.className = 'launcher-button';
launcherButton.type = 'button';
launcherButton.textContent = '⊞  Apps';
launcherButton.setAttribute('aria-label', 'Open app launcher');

const dock = document.createElement('nav');
dock.id = 'app-dock';
dock.setAttribute('aria-label', 'Applications');

const launcher = document.createElement('section');
launcher.id = 'app-launcher';
launcher.hidden = true;
launcher.setAttribute('aria-label', 'App launcher');

const search = document.createElement('input');
search.type = 'search';
search.placeholder = 'Search apps…  (Enter to open)';
search.setAttribute('aria-label', 'Search apps');

const appGrid = document.createElement('div');
appGrid.className = 'app-grid';

launcher.append(search, appGrid);
taskbar.append(launcherButton, dock);
document.body.appendChild(launcher);

const matchApps = (filter = '') => {
  const q = filter.trim().toLowerCase();
  return [...apps.values()].filter((a) => a.title.toLowerCase().includes(q) || a.id.toLowerCase().includes(q));
};

function launchApp(id) {
  launcher.hidden = true;
  search.value = '';
  renderApps('');
  launch(id, config);
}

function renderApps(filter = '') {
  appGrid.replaceChildren();
  const matches = matchApps(filter);

  if (!matches.length) {
    const empty = document.createElement('p');
    empty.className = 'no-apps';
    empty.textContent = 'No apps found';
    appGrid.appendChild(empty);
    return;
  }

  for (const app of matches) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'app-tile';

    const icon = createIcon(app.id, 'app-icon');

    const title = document.createElement('span');
    title.className = 'app-title';
    title.textContent = app.title;

    button.append(icon, title);
    button.addEventListener('click', () => launchApp(app.id));
    appGrid.appendChild(button);
  }
}

function renderDock(openWindows = []) {
  dock.replaceChildren();

  for (const app of apps.values()) {
    const info = openWindows.find((item) => item.id === app.id);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dock-app';
    button.title = app.title;
    button.setAttribute('aria-label', app.title);

    if (info?.active) button.classList.add('active');
    if (info) button.classList.add('is-open');

    const icon = createIcon(app.id, 'dock-icon');
    const indicator = document.createElement('span');
    indicator.className = 'dock-indicator';
    button.append(icon, indicator);

    // click: open · focus · or minimize if it is already the front window
    button.addEventListener('click', () => {
      launcher.hidden = true;
      if (!info) launchApp(app.id);
      else if (info.active && !info.minimized) minimizeWindow(app.id);
      else focusWindow(app.id);
    });

    // right-click / long-press (Android): window actions
    button.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showMenu(e.clientX, e.clientY, info ? [
        { icon: '–', label: info.minimized ? 'Restore' : 'Minimize', action: () => (info.minimized ? focusWindow(app.id) : minimizeWindow(app.id)) },
        { icon: '□', label: 'Maximize / Restore', action: () => toggleMaximize(app.id) },
        { icon: '◧', label: 'Snap left', action: () => snapWindow(app.id, 'left') },
        { icon: '◨', label: 'Snap right', action: () => snapWindow(app.id, 'right') },
        '-',
        { icon: '✕', label: 'Close', danger: true, action: () => closeWindow(app.id) },
      ] : [
        { icon: '▶', label: `Open ${app.title}`, action: () => launchApp(app.id) },
      ]);
    });

    dock.appendChild(button);
  }
}

launcherButton.addEventListener('click', () => {
  launcher.hidden = !launcher.hidden;
  if (!launcher.hidden) {
    renderApps(search.value);
    search.focus();
  }
});

search.addEventListener('input', () => renderApps(search.value));
search.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const first = matchApps(search.value)[0];
    if (first) launchApp(first.id);
  }
});

document.addEventListener('pointerdown', (event) => {
  if (!launcher.hidden && !launcher.contains(event.target) && !launcherButton.contains(event.target)) {
    launcher.hidden = true;
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') launcher.hidden = true;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    launcher.hidden = false;
    renderApps(search.value);
    search.focus();
  }
});

/* desktop right-click / long-press menu */
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('.win, #taskbar, #island, #quick-panel, #app-launcher, .widget, #ctx-menu')) return;
  e.preventDefault();
  const s = getSettings();
  const nextWallpaper = () => {
    const i = WALLPAPERS.indexOf(getSettings().wallpaper);
    setSetting('wallpaper', WALLPAPERS[(i + 1) % WALLPAPERS.length]);
  };
  showMenu(e.clientX, e.clientY, [
    { icon: '⌨️', label: 'Open Terminal', action: () => launchApp('terminal') },
    { icon: '📁', label: 'Open Files', action: () => launchApp('files') },
    { icon: '⚙️', label: 'Settings', action: () => launchApp('settings') },
    '-',
    { icon: '🖼', label: 'Next wallpaper', action: nextWallpaper },
    { icon: s.light ? '☾' : '☀', label: s.light ? 'Dark mode' : 'Light mode', action: () => setSetting('light', !s.light) },
    { icon: '▦', label: s.widgets ? 'Hide widgets' : 'Show widgets', action: () => setSetting('widgets', !s.widgets) },
    { icon: '⛶', label: document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen',
      action: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()) },
  ]);
});

subscribeWindows(renderDock);
renderApps();

// File Manager -> JupyterLab for notebooks; Text Editor for other files.
window.addEventListener('yuva:open-file', (e) => {
  const detail = e.detail || {};
  const filePath = String(detail.path || '');

  if (filePath.toLowerCase().endsWith('.ipynb')) {
    const root = detail.location === 'workspace' ? 'work' : 'yuva-home';
    window.__yuvaPendingNotebook =
      `${root}/${filePath.replace(/^\/+/, '')}`;

    launch('jupyter', config);

    // If Jupyter was already open, update its existing iframe.
    const frame = document.querySelector('.win[data-app-id="jupyter"] iframe');
    if (frame) {
      const base = new URL(config.jupyterBasePath || '/api/jupyter/', location.origin).toString().replace(/\/$/, '');
      frame.src = `${base}/lab/tree/${window.__yuvaPendingNotebook
        .split('/').map(encodeURIComponent).join('/')}`;
      delete window.__yuvaPendingNotebook;
    }
    return;
  }

  if (!document.querySelector('.win[data-app-id="editor"]')) {
    window.__yuvaPendingOpen = detail;
  }
  launch('editor', config);
});

/* one-time Decay theme migration (later changes in Settings are respected) */
const DECAY_WALLPAPER = 'radial-gradient(ellipse at 50% -10%,#1c252c 0,transparent 62%),#101419';
if (localStorage.getItem('yuva_theme') !== 'decay') {
  setSetting('wallpaper', DECAY_WALLPAPER);
  setSetting('accent', '#78dba9');
  setSetting('material', 'classic');
  try { localStorage.setItem('yuva_theme', 'decay'); } catch {}
}

applySettings();
initTray(taskbar, launch, config);
initWidgets(launch, config);
