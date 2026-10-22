const KEY = 'yuva_settings';
export const WALLPAPERS = [
  'radial-gradient(ellipse at 18% 85%,#7a2a3a 0,transparent 52%),radial-gradient(ellipse at 82% 18%,#f39c5a 0,transparent 46%),radial-gradient(ellipse at 62% 72%,#c04a8a 0,transparent 55%),linear-gradient(160deg,#2b1b4d 0%,#8a3a7a 42%,#f0825a 76%,#f7c08a 100%)',
  'radial-gradient(ellipse at 72% 28%,#ffd9a8 0,transparent 40%),radial-gradient(ellipse at 28% 82%,#1b2a6b 0,transparent 56%),linear-gradient(180deg,#1a2350 0%,#4a4fa0 46%,#d98aa0 80%,#f6b88a 100%)',
  'radial-gradient(ellipse at 20% 28%,#f7a8c8 0,transparent 42%),radial-gradient(ellipse at 82% 82%,#b04a8a 0,transparent 52%),linear-gradient(160deg,#2a1840,#7a3a7a 52%,#e87a9a)',
  'radial-gradient(ellipse at 30% 20%,#2f8f8a 0,transparent 46%),linear-gradient(160deg,#0b1a2b,#16384a 56%,#1f6a6a)',
  'linear-gradient(135deg,#1e1e2e,#313244)',
  'linear-gradient(135deg,#0f2027,#2c5364)',
  '#11111b',
];
const DEFAULTS = { wallpaper: WALLPAPERS[0], accent: '#7aa2ff', light: false, brightness: 100, hour12: false, material: 'glass', blur: 22, widgets: true, dnd: false };
let state = { ...DEFAULTS };
try { Object.assign(state, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
if (state.wallpaper === 'linear-gradient(135deg,#1e1e2e,#313244)') state.wallpaper = DEFAULTS.wallpaper; // old default -> new look
if (state.accent === '#89b4fa') state.accent = DEFAULTS.accent;
const subs = new Set();

export const getSettings = () => ({ ...state });
export const subscribeSettings = (fn) => { subs.add(fn); return () => subs.delete(fn); };
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };

export function applySettings() {
  document.body.style.background = state.wallpaper;
  const d = document.getElementById('desktop');
  if (d) d.style.background = 'transparent';
  const r = document.documentElement;
  r.style.filter = '';
  r.style.setProperty('--accent', state.accent);
  r.style.setProperty('--blur', state.blur + 'px');
  r.classList.toggle('yuva-light', !!state.light);
  r.classList.toggle('no-widgets', !state.widgets);
  for (const m of ['classic', 'glass', 'liquid']) r.classList.toggle('mat-' + m, state.material === m);
  let dim = document.getElementById('yuva-dim');
  if (!dim) {
    dim = document.createElement('div'); dim.id = 'yuva-dim';
    dim.style.cssText = 'position:fixed;inset:0;background:#000;pointer-events:none;z-index:2147483000';
    document.body.appendChild(dim);
  }
  dim.style.opacity = String(((100 - state.brightness) / 100) * 0.7);
}
export function setSetting(k, v) { state[k] = v; persist(); applySettings(); subs.forEach((f) => f(getSettings())); }
export function resetSettings() { state = { ...DEFAULTS }; persist(); applySettings(); subs.forEach((f) => f(getSettings())); }
