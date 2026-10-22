import { registerApp } from '../../core/appRegistry.js';
import { el, btn, C, page } from '../../core/ui.js';

let ro;
registerApp({
  id: 'paint', title: 'Paint', icon: '🎨', defaultSize: { w: 700, h: 520 }, singleton: true,
  mount(container) {
    container.style.cssText = page;
    const bar = el('div', `display:flex;gap:8px;align-items:center;padding:8px;background:${C.panel};flex-wrap:wrap`);
    const color = el('input'); color.type = 'color'; color.value = '#000000';
    const size = el('input'); size.type = 'range'; size.min = 1; size.max = 40; size.value = 4;
    let eraser = false;
    const eBtn = btn('Eraser: off', () => { eraser = !eraser; eBtn.textContent = 'Eraser: ' + (eraser ? 'on' : 'off'); });
    const wrap = el('div', 'flex:1;min-height:0;position:relative');
    const cv = el('canvas', 'position:absolute;inset:0;touch-action:none;background:#fff;cursor:crosshair');
    wrap.appendChild(cv);
    const ctx = cv.getContext('2d');

    function fit() {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (!w || !h) return;
      const tmp = document.createElement('canvas');
      tmp.width = cv.width; tmp.height = cv.height;
      tmp.getContext('2d').drawImage(cv, 0, 0);
      cv.width = w; cv.height = h;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(tmp, 0, 0);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    }
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    let drawing = false, last = null;
    const stroke = (a, b) => {
      ctx.strokeStyle = eraser ? '#fff' : color.value;
      ctx.lineWidth = Number(size.value);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    };
    cv.onpointerdown = (e) => { drawing = true; cv.setPointerCapture(e.pointerId); last = pos(e); stroke(last, last); };
    cv.onpointermove = (e) => { if (!drawing) return; const p = pos(e); stroke(last, p); last = p; };
    cv.onpointerup = cv.onpointercancel = () => { drawing = false; };

    bar.append(
      el('span', '', 'Color'), color, el('span', '', 'Size'), size, eBtn,
      btn('Clear', () => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); }),
      btn('Save PNG', () => { const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = 'drawing.png'; a.click(); }, '#579e79'),
    );
    container.append(bar, wrap);
    ro = new ResizeObserver(fit); ro.observe(wrap);
    fit();
  },
  unmount() { ro && ro.disconnect(); },
});
