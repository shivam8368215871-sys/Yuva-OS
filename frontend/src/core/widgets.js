import { el, load } from './ui.js';

export function initWidgets(launch, config) {
  document.getElementById('widgets')?.remove();
  const wrap = el('div'); wrap.id = 'widgets'; document.body.appendChild(wrap);
  const card = (cls, app) => {
    const c = el('div'); c.className = 'widget ' + cls;
    c.onclick = () => launch(app, config);
    wrap.appendChild(c); return c;
  };

  // analog clock
  const c1 = card('', 'clock');
  let ticks = '';
  for (let i = 0; i < 12; i++) ticks += `<line x1="50" y1="6" x2="50" y2="${i % 3 ? 10 : 13}" transform="rotate(${i * 30} 50 50)" stroke="currentColor" stroke-width="${i % 3 ? 1 : 2}" opacity=".7"/>`;
  c1.innerHTML = `<svg viewBox="0 0 100 100" style="width:100%;display:block">${ticks}
    <line class="wh" x1="50" y1="50" x2="50" y2="28" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
    <line class="wm" x1="50" y1="50" x2="50" y2="17" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <line class="ws" x1="50" y1="54" x2="50" y2="12" stroke="var(--accent)" stroke-width="1.2" stroke-linecap="round"/></svg>`;
  const hh = c1.querySelector('.wh'), hm = c1.querySelector('.wm'), hs = c1.querySelector('.ws');

  // day card
  const c2 = card('', 'calendar');
  const dayNum = el('div', 'font-size:44px;font-weight:700;line-height:1');
  const dayTxt = el('div', 'color:var(--dim);font-size:12px;margin-top:6px');
  const todoTxt = el('div', 'color:var(--dim);font-size:11px;margin-top:16px');
  c2.append(dayNum, dayTxt, todoTxt);

  // calendar
  const c3 = card('wide', 'calendar');
  let calKey = '';
  function renderCal(now) {
    const key = now.toDateString(); if (key === calKey) return; calKey = key;
    c3.replaceChildren();
    c3.appendChild(el('b', 'display:block;margin-bottom:8px', now.toLocaleDateString([], { month: 'long', year: 'numeric' })));
    const g = el('div'); g.className = 'cal';
    'SMTWTFS'.split('').forEach((d) => g.appendChild(el('span', 'opacity:.5', d)));
    const first = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    for (let i = 0; i < first; i++) g.appendChild(el('span'));
    for (let d = 1; d <= days; d++) {
      const s = el('span', '', String(d)); if (d === now.getDate()) s.className = 'today'; g.appendChild(s);
    }
    c3.appendChild(g);
  }

  // tasks (live from the Tasks app)
  const c4 = card('wide', 'tasks');
  let tKey = '';
  function renderTasks() {
    const open = load('yuva_tasks', []).filter((t) => !t.done);
    const key = JSON.stringify(open); if (key === tKey) return; tKey = key;
    todoTxt.textContent = `${open.length} to do`;
    c4.replaceChildren();
    const h = el('div', 'display:flex;justify-content:space-between;margin-bottom:6px');
    h.append(el('b', '', 'Tasks'), el('span', 'color:var(--dim);font-size:12px', `${open.length} to do`));
    c4.appendChild(h);
    if (!open.length) c4.appendChild(el('div', 'color:var(--dim);font-size:12px;padding:6px 0', 'All clear'));
    open.slice(0, 4).forEach((t) => {
      const r = el('div', 'display:flex;gap:8px;align-items:center;padding:4px 0;font-size:13px');
      r.append(
        el('span', 'width:12px;height:12px;border-radius:50%;border:1.5px solid var(--dim);flex:none'),
        el('span', 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap', t.text),
      );
      c4.appendChild(r);
    });
  }

  const tick = () => {
    const now = new Date();
    const sec = now.getSeconds(), min = now.getMinutes() + sec / 60, hr = (now.getHours() % 12) + min / 60;
    hh.setAttribute('transform', `rotate(${hr * 30} 50 50)`);
    hm.setAttribute('transform', `rotate(${min * 6} 50 50)`);
    hs.setAttribute('transform', `rotate(${sec * 6} 50 50)`);
    dayNum.textContent = String(now.getDate());
    dayTxt.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long' });
    renderCal(now); renderTasks();
  };
  tick(); setInterval(tick, 1000);
}
