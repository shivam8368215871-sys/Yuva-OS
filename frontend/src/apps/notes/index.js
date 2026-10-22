import { registerApp } from '../../core/appRegistry.js';
import { el, btn, C, load, save, page, field } from '../../core/ui.js';

registerApp({
  id: 'notes', title: 'Notes', icon: '📝', defaultSize: { w: 640, h: 480 }, singleton: true,
  mount(container) {
    container.style.cssText = page;
    let notes = load('yuva_notes', []);
    if (!notes.length) notes = [{ id: Date.now(), text: '' }];
    let cur = notes[0].id;
    const bar = el('div', `display:flex;gap:6px;padding:8px;background:${C.panel};flex-wrap:wrap`);
    const sel = el('select', field + ';flex:1;min-width:120px');
    const ta = el('textarea', `flex:1;min-height:0;resize:none;border:0;outline:0;padding:12px;background:${C.bg};color:${C.text};font:14px/1.5 sans-serif`);
    ta.placeholder = 'Start typing... notes save automatically.';
    const title = (n) => (n.text.trim().split('\n')[0] || 'Untitled').slice(0, 40);
    function render() {
      sel.replaceChildren(...notes.map((n) => {
        const o = el('option'); o.value = n.id; o.textContent = title(n); o.selected = n.id === cur; return o;
      }));
      const n = notes.find((x) => x.id === cur);
      ta.value = n ? n.text : '';
    }
    sel.onchange = () => { cur = Number(sel.value); render(); };
    ta.oninput = () => {
      const n = notes.find((x) => x.id === cur);
      n.text = ta.value; save('yuva_notes', notes);
      if (sel.selectedOptions[0]) sel.selectedOptions[0].textContent = title(n);
    };
    bar.append(
      sel,
      btn('New', () => { const n = { id: Date.now(), text: '' }; notes.unshift(n); cur = n.id; save('yuva_notes', notes); render(); ta.focus(); }),
      btn('Delete', () => {
        if (!confirm('Delete this note?')) return;
        notes = notes.filter((n) => n.id !== cur);
        if (!notes.length) notes = [{ id: Date.now(), text: '' }];
        cur = notes[0].id; save('yuva_notes', notes); render();
      }, '#a3454a'),
    );
    container.append(bar, ta);
    render();
  },
});
