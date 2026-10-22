import { apps } from './appRegistry.js';
import { ICONS } from './icons.js';

const desktop = document.getElementById('desktop');
const windows = new Map();
const listeners = new Set();

const GEO_KEY = 'yuva_win_geo';
const MIN_W = 280;
const MIN_H = 180;
const SNAP_EDGE = 14;
const ANIM_MS = 180;
const DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

let z = 1;
let activeId = null;
let opened = 0;
let preview = null;

/* ---------- helpers ---------- */
const isMobile = () => window.innerWidth < 700;
const num = (v) => parseFloat(v) || 0;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const area = () => ({ w: desktop.clientWidth, h: desktop.clientHeight });

const loadGeo = () => { try { return JSON.parse(localStorage.getItem(GEO_KEY) || '{}'); } catch { return {}; } };
const saveGeo = (id, r) => {
  try { const g = loadGeo(); g[id] = r; localStorage.setItem(GEO_KEY, JSON.stringify(g)); } catch {}
};

const getRect = (win) => ({
  left: num(win.style.left),
  top: num(win.style.top),
  width: num(win.style.width) || win.offsetWidth,
  height: num(win.style.height) || win.offsetHeight,
});
const setRect = (win, r) => Object.assign(win.style, {
  left: Math.round(r.left) + 'px',
  top: Math.round(r.top) + 'px',
  width: Math.round(r.width) + 'px',
  height: Math.round(r.height) + 'px',
});

function fitRect(r) {
  const { w, h } = area();
  if (!w || !h) return r;
  const width = Math.min(r.width, w);
  const height = Math.min(r.height, h);
  return {
    width,
    height,
    left: clamp(r.left, 0, w - width),
    top: clamp(r.top, 0, h - height),
  };
}

function modeRect(mode) {
  const { w, h } = area();
  const half = Math.floor(w / 2);
  if (mode === 'left') return { left: 0, top: 0, width: half, height: h };
  if (mode === 'right') return { left: half, top: 0, width: w - half, height: h };
  return { left: 0, top: 0, width: w, height: h };
}

function pickNext() {
  let best = null;
  let highest = -1;
  for (const [id, it] of windows) {
    if (it.minimized) continue;
    const level = Number(it.win.style.zIndex) || 0;
    if (level > highest) { highest = level; best = id; }
  }
  return best;
}

const snapshot = () => [...windows.entries()].map(([id, it]) => ({
  id,
  title: it.title.textContent,
  minimized: it.minimized,
  active: id === activeId,
}));

function emitChange() {
  for (const [id, it] of windows) it.win.classList.toggle('inactive', id !== activeId);
  const snap = snapshot();
  listeners.forEach((fn) => fn(snap));
}

function flash(win, cls) {
  win.classList.remove(cls);
  void win.offsetWidth;
  win.classList.add(cls);
  setTimeout(() => win.classList.remove(cls), ANIM_MS + 40);
}

function getPreview() {
  if (!preview) {
    preview = document.createElement('div');
    preview.id = 'snap-preview';
    document.body.appendChild(preview);
  }
  return preview;
}
function showPreview(mode) {
  const p = getPreview();
  const dr = desktop.getBoundingClientRect();
  const r = modeRect(mode);
  Object.assign(p.style, {
    left: dr.left + r.left + 'px',
    top: dr.top + r.top + 'px',
    width: r.width + 'px',
    height: r.height + 'px',
  });
  p.classList.add('show');
}
const hidePreview = () => preview && preview.classList.remove('show');

/* ---------- public API ---------- */
export function subscribeWindows(fn) {
  listeners.add(fn);
  fn(snapshot());
  return () => listeners.delete(fn);
}

export const getOpenWindows = snapshot;

export function focusWindow(id) {
  const item = windows.get(id);
  if (!item) return;
  const wasMin = item.minimized;
  if (!wasMin && activeId === id && Number(item.win.style.zIndex) === z) return;

  if (wasMin) {
    item.minimized = false;
    item.win.style.display = 'flex';
    item.win.classList.remove('win-min');
    flash(item.win, 'win-open');
  }
  item.win.style.zIndex = ++z;
  activeId = id;
  emitChange();
}

export function minimizeWindow(id) {
  const item = windows.get(id);
  if (!item || item.minimized) return;
  item.minimized = true;
  item.win.classList.add('win-min');
  setTimeout(() => {
    if (item.minimized && windows.get(id) === item) {
      item.win.style.display = 'none';
      item.win.classList.remove('win-min');
    }
  }, ANIM_MS);
  if (activeId === id) activeId = pickNext();
  emitChange();
}

function applyMode(item, mode, override) {
  const { win } = item;
  if (item.mode === 'normal' && mode !== 'normal') item.previousRect = getRect(win);

  let rect;
  if (mode === 'normal') {
    rect = override || fitRect(item.previousRect || getRect(win));
    item.previousRect = null;
  } else {
    rect = modeRect(mode);
  }
  setRect(win, rect);

  item.mode = mode;
  item.maximized = mode === 'max';
  win.classList.toggle('is-max', mode === 'max');
  win.classList.toggle('is-snapped', mode === 'left' || mode === 'right');
  item.maxButton.textContent = mode === 'max' ? '❐' : '□';
  item.maxButton.title = mode === 'max' ? 'Restore' : 'Maximize';
}

function setMode(id, mode) {
  const item = windows.get(id);
  if (!item) return;
  win_anim(item.win);
  applyMode(item, mode);
  if (mode === 'normal') saveGeo(id, getRect(item.win));
  focusWindow(id);
}

function win_anim(win) {
  win.classList.add('win-anim');
  clearTimeout(win._animT);
  win._animT = setTimeout(() => win.classList.remove('win-anim'), 260);
}

export function toggleMaximize(id) {
  const item = windows.get(id);
  if (!item) return;
  setMode(id, item.mode === 'max' ? 'normal' : 'max');
}

export function snapWindow(id, side) {
  const item = windows.get(id);
  if (!item) return;
  setMode(id, item.mode === side ? 'normal' : side);
}

export function closeWindow(id) {
  const item = windows.get(id);
  if (!item) return;
  windows.delete(id);

  try {
    item.app.unmount?.();
  } finally {
    item.win.classList.add('win-closing');
    setTimeout(() => item.win.remove(), ANIM_MS);
    if (activeId === id) activeId = pickNext();
    emitChange();
  }
}

export function launch(id, config) {
  const app = apps.get(id);
  if (!app) return;

  if (windows.has(id)) { focusWindow(id); return; }

  const ds = app.defaultSize || { w: 600, h: 420 };
  const { w: cw, h: ch } = area();
  const saved = loadGeo()[id];

  let rect;
  if (saved && saved.width && saved.height) {
    rect = fitRect(saved);
  } else {
    const w = Math.min(ds.w, Math.max(320, cw - 20));
    const h = Math.min(ds.h, Math.max(220, ch - 20));
    const off = (opened++ % 6) * 26 - 65;     // cascade so windows never stack exactly
    rect = fitRect({ width: w, height: h, left: (cw - w) / 2 + off, top: (ch - h) / 2 + off * 0.6 });
  }

  const win = document.createElement('section');
  win.className = 'win win-open';
  win.dataset.appId = id;
  win.style.zIndex = ++z;
  setRect(win, rect);
  setTimeout(() => win.classList.remove('win-open'), ANIM_MS + 40);

  /* title bar */
  const bar = document.createElement('div');
  bar.className = 'bar';

  const head = document.createElement('div');
  head.className = 'window-head';
  const icon = document.createElement('span');
  icon.className = 'window-icon';
  icon.textContent = ICONS[id] || app.icon || '◈';
  const title = document.createElement('b');
  title.className = 'window-title';
  title.textContent = app.title;
  head.append(icon, title);

  const controls = document.createElement('div');
  controls.className = 'window-controls';
  const mk = (text, label, cls) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.title = label;
    b.setAttribute('aria-label', label + ' window');
    if (cls) b.className = cls;
    return b;
  };
  const minButton = mk('—', 'Minimize');
  const maxButton = mk('□', 'Maximize');
  const closeButton = mk('×', 'Close', 'window-close');
  controls.append(minButton, maxButton, closeButton);
  bar.append(head, controls);

  const body = document.createElement('div');
  body.className = 'body';
  win.append(bar, body);

  for (const d of DIRS) {
    const h = document.createElement('div');
    h.className = 'rz rz-' + d;
    h.dataset.dir = d;
    win.appendChild(h);
  }
  desktop.appendChild(win);

  const item = {
    app, win, bar, body, title, minButton, maxButton,
    minimized: false, maximized: false, mode: 'normal', previousRect: null,
  };
  windows.set(id, item);

  if (isMobile()) applyMode(item, 'max');   // phones: apps open full-screen

  const ctx = {
    config,
    setTitle: (value) => { title.textContent = value; emitChange(); },
    close: () => closeWindow(id),
  };

  minButton.addEventListener('click', () => minimizeWindow(id));
  maxButton.addEventListener('click', () => toggleMaximize(id));
  closeButton.addEventListener('click', () => closeWindow(id));
  win.addEventListener('pointerdown', () => focusWindow(id), true);
  bar.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) toggleMaximize(id); });

  /* drag by title bar (+ snap to edges, drag out of maximized) */
  let drag = null;

  bar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const r = getRect(win);
    drag = { sx: e.clientX, sy: e.clientY, left0: r.left, top0: r.top, moved: false, snap: null };
    try { bar.setPointerCapture(e.pointerId); } catch {}
    focusWindow(id);
  });

  bar.addEventListener('pointermove', (e) => {
    if (!drag) return;

    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
      if (item.mode !== 'normal' && isMobile()) { drag = null; return; }
      drag.moved = true;

      if (item.mode !== 'normal') {            // pull the window out of max / snapped
        const dr = desktop.getBoundingClientRect();
        const cur = getRect(win);
        const prev = item.previousRect || { width: ds.w, height: ds.h };
        const { w, h } = area();
        const width = Math.min(prev.width, w);
        const height = Math.min(prev.height, h);
        const ratio = cur.width ? clamp((e.clientX - dr.left - cur.left) / cur.width, 0, 1) : 0.5;
        const left = e.clientX - dr.left - ratio * width;
        const top = Math.max(0, e.clientY - dr.top - 20);
        applyMode(item, 'normal', { left, top, width, height });
        Object.assign(drag, { sx: e.clientX, sy: e.clientY, left0: left, top0: top });
      }
    }

    const { w, h } = area();
    const r = getRect(win);
    win.style.left = clamp(drag.left0 + e.clientX - drag.sx, 0, Math.max(0, w - r.width)) + 'px';
    win.style.top = clamp(drag.top0 + e.clientY - drag.sy, 0, Math.max(0, h - 44)) + 'px';

    const dr = desktop.getBoundingClientRect();
    const px = e.clientX - dr.left;
    const py = e.clientY - dr.top;
    drag.snap = isMobile() ? null
      : py <= SNAP_EDGE ? 'max'
      : px <= SNAP_EDGE ? 'left'
      : px >= dr.width - SNAP_EDGE ? 'right' : null;
    if (drag.snap) showPreview(drag.snap); else hidePreview();
  });

  const endDrag = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    hidePreview();
    if (!d.moved) return;
    if (d.snap) setMode(id, d.snap);
    else saveGeo(id, getRect(win));
  };
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);

  /* resize from any edge or corner (works with touch too) */
  win.querySelectorAll('.rz').forEach((handle) => {
    const dir = handle.dataset.dir;
    let rs = null;

    handle.addEventListener('pointerdown', (e) => {
      if (item.mode !== 'normal') return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      rs = { sx: e.clientX, sy: e.clientY, start: getRect(win) };
      try { handle.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
    });

    handle.addEventListener('pointermove', (e) => {
      if (!rs) return;
      const dx = e.clientX - rs.sx;
      const dy = e.clientY - rs.sy;
      const s = rs.start;
      const { w, h } = area();
      let { left, top, width, height } = s;

      if (dir.includes('e')) width = Math.max(MIN_W, s.width + dx);
      if (dir.includes('s')) height = Math.max(MIN_H, s.height + dy);
      if (dir.includes('w')) { const nw = Math.max(MIN_W, s.width - dx); left = s.left + (s.width - nw); width = nw; }
      if (dir.includes('n')) { const nh = Math.max(MIN_H, s.height - dy); top = s.top + (s.height - nh); height = nh; }

      if (left < 0) { width += left; left = 0; }
      if (top < 0) { height += top; top = 0; }
      if (w && left + width > w) width = w - left;
      if (h && top + height > h) height = h - top;
      setRect(win, { left, top, width, height });
    });

    const end = () => { if (rs) { rs = null; saveGeo(id, getRect(win)); } };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  });

  try {
    app.mount(body, ctx);
    focusWindow(id);
  } catch (error) {
    console.error(`Failed to launch ${app.title}:`, error);
    closeWindow(id);
    throw error;
  }
}

/* ---------- global behaviour ---------- */
addEventListener('resize', () => {
  for (const it of windows.values()) {
    setRect(it.win, it.mode === 'normal' ? fitRect(getRect(it.win)) : modeRect(it.mode));
  }
});

// Alt+W close · Alt+↑ maximize/restore · Alt+↓ minimize · Alt+←/→ snap
document.addEventListener('keydown', (e) => {
  if (!e.altKey || e.ctrlKey || e.metaKey || !activeId) return;
  const act = {
    w: () => closeWindow(activeId),
    W: () => closeWindow(activeId),
    ArrowUp: () => toggleMaximize(activeId),
    ArrowDown: () => minimizeWindow(activeId),
    ArrowLeft: () => snapWindow(activeId, 'left'),
    ArrowRight: () => snapWindow(activeId, 'right'),
  }[e.key];
  if (act) { e.preventDefault(); act(); }
});
