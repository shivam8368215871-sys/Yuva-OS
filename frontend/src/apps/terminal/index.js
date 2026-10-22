import { registerApp } from '../../core/appRegistry.js';

function el(tag, css, text) {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text !== undefined) e.textContent = text;
  return e;
}

registerApp({
  id: 'terminal', title: 'Terminal', defaultSize: { w: 700, h: 500 }, singleton: true,
  mount(container) {
    container.style.cssText = 'display:flex;flex-direction:column;height:100%';
    const termEl = el('div', 'flex:1;min-height:0');
    const card = el('div', 'display:none;background:#101419;color:#b6beca;padding:10px;font:13px sans-serif;border-top:2px solid #78dba9;max-height:45%;overflow:auto');
    container.append(termEl, card);

    const term = new Terminal({ allowTransparency: true, cursorBlink: true, fontSize: 14, fontFamily: '"JetBrains Mono","Fira Code",ui-monospace,monospace', theme: { background: '#00000000', foreground: '#b6beca', cursor: '#78dba9', selectionBackground: '#30373d', black: '#1c252c', red: '#e05f65', green: '#78dba9', yellow: '#f1cf8a', blue: '#70a5eb', magenta: '#c68aee', cyan: '#74bee9', white: '#dee1e6', brightBlack: '#384148', brightRed: '#e5646a', brightGreen: '#94f7c5', brightYellow: '#f6d48f', brightBlue: '#75aaf0', brightMagenta: '#cb8ff3', brightCyan: '#79c3ee', brightWhite: '#e3e6eb' } });
    const fit = new FitAddon.FitAddon();
    term.loadAddon(fit);
    term.open(termEl);

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/term`);
    const sendInput = (d) => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'input', data: d }));
    const sendResize = () => {
      try { fit.fit(); } catch {}
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    };

    function btn(label, onclick, bg) {
      const b = el('button', `background:${bg || '#1c252c'};color:#fff;border:0;padding:6px 12px;border-radius:6px;margin-right:6px;cursor:pointer`, label);
      b.onclick = onclick;
      return b;
    }
    const hide = () => { card.style.display = 'none'; card.replaceChildren(); term.focus(); };

    function showCard(m) {
      card.replaceChildren();
      card.style.display = 'block';
      card.appendChild(el('div', 'font-weight:bold;margin-bottom:6px', '🎓 Mentor'));
      if (m.type === 'mentor_start') { card.appendChild(el('div', '', `Looking at "${m.cmd}"...`)); return; }
      if (m.type === 'mentor_error') {
        card.appendChild(el('div', 'margin-bottom:8px', m.message));
        card.appendChild(btn('Dismiss', hide));
        return;
      }
      card.appendChild(el('div', 'margin-bottom:8px;line-height:1.4', m.explanation));
      if (m.warn) card.appendChild(el('div', 'color:#f1cf8a;margin-bottom:8px', m.warn));
      if (m.fix) {
        card.appendChild(el('div', 'margin-bottom:4px;color:#8c929c', 'Suggested fix (nothing runs until you click Run):'));
        const input = el('input', 'width:100%;box-sizing:border-box;background:#0a0c0f;color:#78dba9;border:1px solid #30373d;border-radius:6px;padding:6px;font:13px monospace;margin-bottom:8px');
        input.value = m.fix; input.readOnly = true;
        card.appendChild(input);
        card.appendChild(btn('Run', () => { sendInput(input.value.replace(/\n/g, ' ') + '\r'); hide(); }, '#579e79'));
        card.appendChild(btn('Edit', () => { input.readOnly = false; input.focus(); }));
      }
      card.appendChild(btn('Dismiss', hide));
    }

    ws.onopen = sendResize;
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === 'out') term.write(m.data);
      else if (m.type.startsWith('mentor')) showCard(m);
    };
    ws.onclose = () => term.write('\r\n[disconnected]\r\n');
    term.onData(sendInput);

    const ro = new ResizeObserver(sendResize);
    ro.observe(termEl);
    this._cleanup = () => { ro.disconnect(); ws.close(); term.dispose(); };
  },
  unmount() { this._cleanup && this._cleanup(); },
});
