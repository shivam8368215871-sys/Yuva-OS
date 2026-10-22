import { registerApp } from '../../core/appRegistry.js';
import { el, btn, C, load, save, page, field } from '../../core/ui.js';

registerApp({
  id: 'tasks', title: 'Tasks', icon: '✅', defaultSize: { w: 420, h: 520 }, singleton: true,
  mount(container) {
    container.style.cssText = page;
    let tasks = load('yuva_tasks', []);
    const row = el('div', `display:flex;gap:6px;padding:8px;background:${C.panel}`);
    const input = el('input', field + ';flex:1;min-width:0');
    input.placeholder = 'Add a task...';
    const list = el('div', 'flex:1;min-height:0;overflow:auto;padding:8px');
    const foot = el('div', `padding:8px;color:${C.dim};display:flex;justify-content:space-between;align-items:center;background:${C.panel}`);
    const persist = () => save('yuva_tasks', tasks);
    function render() {
      list.replaceChildren(...tasks.map((t) => {
        const r = el('div', 'display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid #1c252c');
        const cb = el('input'); cb.type = 'checkbox'; cb.checked = t.done;
        cb.onchange = () => { t.done = cb.checked; persist(); render(); };
        const s = el('span', `flex:1;word-break:break-word;${t.done ? 'text-decoration:line-through;opacity:.5' : ''}`, t.text);
        const x = el('span', 'cursor:pointer;color:#e05f65;padding:0 6px', '✕');
        x.onclick = () => { tasks = tasks.filter((z) => z !== t); persist(); render(); };
        r.append(cb, s, x);
        return r;
      }));
      foot.replaceChildren(
        el('span', '', `${tasks.filter((t) => !t.done).length} left`),
        btn('Clear done', () => { tasks = tasks.filter((t) => !t.done); persist(); render(); }),
      );
    }
    const add = () => {
      const v = input.value.trim(); if (!v) return;
      tasks.unshift({ text: v, done: false }); input.value = ''; persist(); render();
    };
    input.onkeydown = (e) => { if (e.key === 'Enter') add(); };
    row.append(input, btn('Add', add, '#579e79'));
    container.append(row, list, foot);
    render();
  },
});
