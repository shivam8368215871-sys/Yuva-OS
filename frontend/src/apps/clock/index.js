import { registerApp } from '../../core/appRegistry.js';
import { getSettings } from '../../core/settings.js';
import { el, btn, C, page, field } from '../../core/ui.js';

let tickId;
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
function beep() {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)();
    const o = a.createOscillator(); o.connect(a.destination); o.frequency.value = 880; o.start();
    setTimeout(() => { o.stop(); a.close(); }, 700);
  } catch {}
}
const section = (t) => {
  const s = el('div', `background:${C.panel};border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px`);
  s.appendChild(el('div', `color:${C.dim}`, t));
  return s;
};

registerApp({
  id: 'clock', title: 'Clock', icon: '⏰', defaultSize: { w: 380, h: 540 }, singleton: true,
  mount(container) {
    container.style.cssText = page + ';overflow:auto;padding:12px;gap:12px';
    const big = el('div', 'font-size:42px;text-align:center;font-weight:bold');
    const date = el('div', `text-align:center;color:${C.dim}`);

    // stopwatch
    const sw = section('Stopwatch');
    const swOut = el('div', 'font-size:32px;text-align:center;font-family:monospace', '00:00.0');
    let swRun = false, swStart = 0, swEl = 0;
    const swBar = el('div', 'display:flex;gap:6px;justify-content:center');
    swBar.append(
      btn('Start', () => { if (!swRun) { swRun = true; swStart = Date.now(); } }, '#579e79'),
      btn('Stop', () => { if (swRun) { swEl += Date.now() - swStart; swRun = false; } }),
      btn('Reset', () => { swRun = false; swEl = 0; }),
    );
    sw.append(swOut, swBar);

    // timer
    const tm = section('Timer (minutes)');
    const mins = el('input', field + ';width:80px;text-align:center'); mins.type = 'number'; mins.min = 1; mins.value = 5;
    const tmOut = el('div', 'font-size:32px;text-align:center;font-family:monospace', '00:00');
    let tRun = false, tEnd = 0, tLeft = 0;
    const tmBar = el('div', 'display:flex;gap:6px;justify-content:center;align-items:center');
    tmBar.append(
      mins,
      btn('Start', () => {
        if (tRun) return;
        if (tLeft <= 0) tLeft = Math.max(1, Number(mins.value) || 1) * 60000;
        tEnd = Date.now() + tLeft; tRun = true;
      }, '#579e79'),
      btn('Pause', () => { if (tRun) { tLeft = tEnd - Date.now(); tRun = false; } }),
      btn('Reset', () => { tRun = false; tLeft = 0; }),
    );
    tm.append(tmOut, tmBar);

    container.append(big, date, sw, tm);

    clearInterval(tickId);
    tickId = setInterval(() => {
      const now = new Date();
      big.textContent = now.toLocaleTimeString([], { hour12: getSettings().hour12 });
      date.textContent = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const e = swRun ? swEl + (Date.now() - swStart) : swEl;
      swOut.textContent = String(Math.floor(e / 60000)).padStart(2, '0') + ':' + String(Math.floor(e / 1000) % 60).padStart(2, '0') + '.' + Math.floor((e % 1000) / 100);
      if (tRun) {
        const left = tEnd - Date.now();
        if (left <= 0) { tRun = false; tLeft = 0; tmOut.textContent = '00:00'; beep(); window.dispatchEvent(new CustomEvent('yuva:notify', { detail: { title: 'Timer finished', body: 'Your timer reached 00:00' } })); }
        else tmOut.textContent = mmss(left);
      } else tmOut.textContent = mmss(tLeft);
    }, 200);
  },
  unmount() { clearInterval(tickId); },
});
