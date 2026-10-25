import { el } from './ui.js';
import { apps } from './appRegistry.js';
import { getSettings, setSetting } from './settings.js';

const notes = [];
let unread = 0;

export function initTray(_taskbar, launch, config) {
  document.getElementById('tray')?.remove();

  const island = el('div'); island.id = 'island';
  const appLbl = el('span', '', 'YuVA'); appLbl.className = 'isl-app';
  const clk = el('button'); clk.className = 'isl-btn'; clk.title = 'Open calendar';
  const timeEl = el('b'); const dateEl = el('span'); dateEl.className = 'isl-date';
  clk.append(timeEl, dateEl);
  const stat = el('button'); stat.className = 'isl-btn'; stat.title = 'Control center';
  const net = el('span', '', '●'); const bat = el('span'); bat.hidden = true;
  const badge = el('span'); badge.className = 'isl-badge'; badge.hidden = true;
  stat.append(net, bat, badge, el('span', '', '⌄'));
  island.append(appLbl, clk, stat);
  document.body.appendChild(island);

  const panel = el('div'); panel.id = 'quick-panel'; panel.hidden = true;
  document.body.appendChild(panel);
  const close = () => { panel.hidden = true; };

  // clock
  const tick = () => {
    const now = new Date();
    timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: getSettings().hour12 });
    dateEl.textContent = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  };
  tick(); setInterval(tick, 1000);
  clk.onclick = () => launch('calendar', config);

  // active app name
  setInterval(() => {
    let top = null, z = -1;
    document.querySelectorAll('.win[data-app-id]').forEach((w) => {
      if (w.offsetParent === null) return;
      const zi = Number(w.style.zIndex) || 0;
      if (zi > z) { z = zi; top = w; }
    });
    const a = top && apps.get(top.dataset.appId);
    appLbl.textContent = a ? a.title : 'YuVA';
  }, 400);

  // network + battery
  const updNet = () => { net.style.color = navigator.onLine ? '#78dba9' : '#e05f65'; };
  updNet(); addEventListener('online', updNet); addEventListener('offline', updNet);
  if (navigator.getBattery) {
    navigator.getBattery().then((b) => {
      const upd = () => { bat.hidden = false; bat.textContent = `${b.charging ? '⚡' : '🔋'}${Math.round(b.level * 100)}%`; };
      upd(); b.addEventListener('levelchange', upd); b.addEventListener('chargingchange', upd);
    }).catch(() => {});
  }

  // notifications: window.dispatchEvent(new CustomEvent('yuva:notify', { detail: { title, body } }))
  window.addEventListener('yuva:notify', (e) => {
    const d = e.detail || {};
    notes.unshift({ title: String(d.title || 'Notice'), body: String(d.body || '') });
    notes.length = Math.min(notes.length, 20);
    if (!getSettings().dnd) { unread++; badge.hidden = false; }
    if (!panel.hidden) build();
  });

  function build() {
    const s = getSettings();
    panel.replaceChildren();
    const tile = (icon, label, sub, on, fn) => {
      const b = el('button'); b.className = 'cc-tile' + (on ? ' on' : '');
      const t = el('span'); t.append(el('b', '', label), el('small', '', sub));
      b.append(el('i', '', icon), t); b.onclick = fn; return b;
    };
    const tiles = el('div'); tiles.className = 'cc-tiles';
    tiles.append(
      tile('📶', 'Network', navigator.onLine ? 'Online' : 'Offline', navigator.onLine, () => {}),
      tile(s.light ? '☀' : '☾', 'Focus', s.light ? 'Light' : 'Dark', s.light, () => { setSetting('light', !s.light); document.documentElement.setAttribute('data-theme', !s.light ? 'light' : 'dark'); document.body.classList.toggle('light-theme', !s.light); build(); }),
      tile('⛶', 'Fullscreen', document.fullscreenElement ? 'On' : 'Off', !!document.fullscreenElement, () => {
        if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.();
      }),
      tile('▦', 'Widgets', s.widgets ? 'Shown' : 'Hidden', s.widgets, () => { setSetting('widgets', !s.widgets); build(); }),
      tile('⚙', 'Settings', 'Open app', false, () => { close(); launch('settings', config); }),
    );
    const slider = (icon, val, min, max, fn, fmt) => {
      const r = el('div'); r.className = 'cc-slider';
      const inp = el('input', 'flex:1'); inp.type = 'range'; inp.min = min; inp.max = max; inp.value = val;
      const out = el('span', 'min-width:40px;text-align:right', fmt(val));
      inp.oninput = () => { out.textContent = fmt(inp.value); fn(Number(inp.value)); };
      r.append(el('span', '', icon), inp, out); return r;
    };
    const seg = el('div'); seg.className = 'cc-seg';
    [['classic', 'Classic'], ['glass', 'Glass'], ['liquid', 'Liquid']].forEach(([m, l]) => {
      const b = el('button', '', l); if (s.material === m) b.className = 'on';
      b.onclick = () => { setSetting('material', m); build(); }; seg.appendChild(b);
    });
    const nb = el('div'); nb.className = 'cc-notes';
    const head = el('div', 'display:flex;justify-content:space-between;margin-bottom:6px');
    head.append(el('b', '', 'Notifications'));
    if (notes.length) { const c = el('button', '', 'Clear'); c.className = 'cc-link'; c.onclick = () => { notes.length = 0; build(); }; head.appendChild(c); }
    nb.appendChild(head);
    if (!notes.length) nb.appendChild(el('div', 'text-align:center;color:var(--dim);padding:14px 0', 'Nothing new'));
    notes.slice(0, 5).forEach((n) => {
      const row = el('div', 'padding:6px 0;border-top:1px solid var(--border)');
      row.append(el('b', '', n.title), el('div', 'color:var(--dim);font-size:12px', n.body)); nb.appendChild(row);
    });
    panel.append(
      tiles,
      slider('☀', s.brightness, 40, 100, (v) => setSetting('brightness', v), (v) => v + '%'),
      slider('◍', s.blur, 0, 40, (v) => setSetting('blur', v), (v) => v + 'px'),
      el('div', 'color:var(--dim);font-size:11px;padding:0 4px', 'Material'), seg, nb,
    );
  }

  stat.onclick = () => {
    if (!panel.hidden) return close();
    unread = 0; badge.hidden = true; build(); panel.hidden = false;
  };
  document.addEventListener('pointerdown', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !stat.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.addEventListener('fullscreenchange', () => { if (!panel.hidden) build(); });
}
