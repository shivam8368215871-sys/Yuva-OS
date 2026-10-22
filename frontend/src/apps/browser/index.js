import { registerApp } from '../../core/appRegistry.js';

registerApp({
  id: 'browser',
  title: 'Browser',
  icon: '🌐',
  defaultSize: { w: 1000, h: 680 },
  singleton: true,

  mount(container) {
    container.style.cssText =
      'display:flex;flex-direction:column;width:100%;height:100%;min-height:0;background:#171a20;color:#e8eaf0';

    const bar = document.createElement('div');
    bar.style.cssText =
      'display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:9px;background:#222731;border-bottom:1px solid #343b48';

    const makeButton = (label, title, action) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.title = title;
      b.style.cssText =
        'padding:7px 10px;border:1px solid #414957;border-radius:8px;background:#303744;color:#f2f4f8;cursor:pointer';
      b.addEventListener('click', action);
      return b;
    };

    const address = document.createElement('input');
    address.type = 'text';
    address.placeholder = 'Search the web or enter a URL';
    address.setAttribute('aria-label', 'Web address or search');
    address.style.cssText =
      'flex:1;min-width:180px;padding:9px 12px;border:1px solid #414957;border-radius:9px;background:#14171d;color:#fff';

    const view = document.createElement('div');
    view.style.cssText = 'position:relative;flex:1;min-height:0;background:#fff';

    const frame = document.createElement('iframe');
    frame.title = 'Web page';
    frame.style.cssText = 'width:100%;height:100%;border:0;background:#fff';
    frame.referrerPolicy = 'no-referrer';
    frame.src = 'https://duckduckgo.com/';
    view.appendChild(frame);

    const status = document.createElement('div');
    status.textContent =
      'Some sites block embedded viewing. Use Open externally if a page will not load.';
    status.style.cssText =
      'padding:6px 10px;font-size:12px;color:#aeb8c8;background:#222731';

    const navigate = () => {
      let value = address.value.trim();
      if (!value) return;

      if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) {
        value = /\s/.test(value) || !value.includes('.')
          ? `https://duckduckgo.com/?q=${encodeURIComponent(value)}`
          : `https://${value}`;
      }

      let parsed;
      try {
        parsed = new URL(value);
      } catch {
        status.textContent = 'Enter a valid web address or search phrase.';
        return;
      }

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        status.textContent = 'Only HTTP and HTTPS addresses are supported.';
        return;
      }

      address.value = parsed.href;
      frame.src = parsed.href;
      status.textContent = 'Loading page… If blocked, choose Open externally.';
    };

    bar.append(
      makeButton('←', 'Back', () => {
        try { frame.contentWindow.history.back(); }
        catch { status.textContent = 'Use the website’s own Back control or open it externally.'; }
      }),
      makeButton('→', 'Forward', () => {
        try { frame.contentWindow.history.forward(); }
        catch { status.textContent = 'Use the website’s own Forward control or open it externally.'; }
      }),
      makeButton('↻', 'Reload', () => {
        try { frame.contentWindow.location.reload(); }
        catch { frame.src = frame.src; }
      }),
      address,
      makeButton('Go', 'Visit address or search', navigate),
      makeButton('Open externally', 'Open this address in a new browser tab', () => {
        const value = address.value.trim();
        if (!value) {
          window.open('https://duckduckgo.com/', '_blank', 'noopener,noreferrer');
          return;
        }
        let target = value;
        if (!/^[a-z][a-z0-9+.-]*:/i.test(target)) {
          target = /\s/.test(target) || !target.includes('.')
            ? `https://duckduckgo.com/?q=${encodeURIComponent(target)}`
            : `https://${target}`;
        }
        try {
          const parsed = new URL(target);
          if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
          window.open(parsed.href, '_blank', 'noopener,noreferrer');
        } catch {
          status.textContent = 'Enter a valid HTTP or HTTPS address first.';
        }
      })
    );

    address.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') navigate();
    });

    frame.addEventListener('load', () => {
      status.textContent =
        'Page loaded if permitted by the website. Some sites block embedding or downloads.';
      try {
        if (frame.contentWindow.location.href !== 'about:blank') {
          address.value = frame.contentWindow.location.href;
        }
      } catch {
        // Cross-origin pages cannot expose their current URL to YuVA.
      }
    });

    container.append(bar, view, status);
  },
});
