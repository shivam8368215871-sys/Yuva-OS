export const C = { bg: '#101419', panel: '#1c252c', text: '#b6beca', dim: '#8c929c', accent: '#78dba9' };
export function el(tag, css, text) {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text !== undefined) e.textContent = text;
  return e;
}
export function btn(label, onclick, bg) {
  const b = el('button', `background:${bg || C.panel};color:#fff;border:0;padding:8px 12px;border-radius:6px;cursor:pointer;font:13px sans-serif`, label);
  b.onclick = onclick;
  return b;
}
export function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
export function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
export const page = `display:flex;flex-direction:column;height:100%;min-height:0;background:${C.bg};color:${C.text};font:14px sans-serif`;
export const field = `background:${C.bg};color:${C.text};border:1px solid #30373d;border-radius:6px;padding:8px;font:14px sans-serif`;
