import { registerApp } from '../../core/appRegistry.js';
import { el, btn, C, page, field } from '../../core/ui.js';
import { getSettings, setSetting, resetSettings, subscribeSettings, WALLPAPERS } from '../../core/settings.js';

let unsub;
registerApp({
  id: 'settings', title: 'Settings', icon: '⚙', defaultSize: { w: 560, h: 560 }, singleton: true,
  mount(container) {
    container.style.cssText = page + ';overflow:auto;padding:14px;gap:14px';
    const sec = (t) => {
      const s = el('div', `background:${C.panel};border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:10px`);
      s.appendChild(el('div', 'font-weight:bold', t));
      return s;
    };
    const row = (label, ctrl) => {
      const r = el('div', 'display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap');
      r.append(el('span', '', label), ctrl);
      return r;
    };

    const wall = sec('Wallpaper');
    const swatches = el('div', 'display:flex;gap:8px;flex-wrap:wrap');
    WALLPAPERS.forEach((w) => {
      const b = el('button', `width:56px;height:40px;border-radius:8px;border:2px solid #30373d;cursor:pointer;background:${w}`);
      b.onclick = () => setSetting('wallpaper', w);
      swatches.appendChild(b);
    });
    const url = el('input', field + ';flex:1;min-width:150px'); url.placeholder = 'Image URL (https://...)';
    const urlRow = el('div', 'display:flex;gap:6px');
    urlRow.append(url, btn('Set', () => {
      const v = url.value.trim();
      if (!/^https?:\/\//i.test(v)) return alert('Enter a full http(s) image URL.');
      setSetting('wallpaper', `center / cover no-repeat url("${encodeURI(v).replace(/"/g, '%22')}")`);
    }));
    wall.append(swatches, urlRow);

    const localImage = el('input', field + ';flex:1;min-width:150px');
    localImage.type = 'file';
    localImage.accept = 'image/png,image/jpeg,image/webp,image/gif';
    const localRow = el('div', 'display:flex;gap:6px;align-items:center;flex-wrap:wrap');
    localRow.append(localImage, btn('Use image', async () => {
      const file = localImage.files?.[0];
      if (!file) return alert('Choose an image first.');
      if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
        return alert('Choose a PNG, JPEG, WebP, or GIF image.');
      }
      if (file.size > 3 * 1024 * 1024) {
        return alert('Please choose an image smaller than 3 MB.');
      }
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Could not read that image.'));
          reader.readAsDataURL(file);
        });
        const wallpaper = `center / cover no-repeat url("${dataUrl}")`;
        try {
          setSetting('wallpaper', wallpaper);
        } catch (error) {
          alert('Could not save this wallpaper. Try a smaller image.');
          return;
        }
      } catch (error) {
        alert(error.message || 'Could not read that image.');
      }
    }));
    wall.appendChild(localRow);


    const look = sec('Appearance');
    const accent = el('input'); accent.type = 'color'; accent.oninput = () => setSetting('accent', accent.value);
    const light = el('input'); light.type = 'checkbox'; light.onchange = () => setSetting('light', light.checked);
    const bright = el('input'); bright.type = 'range'; bright.min = 40; bright.max = 100;
    bright.oninput = () => setSetting('brightness', Number(bright.value));
    look.append(row('Accent color', accent), row('Light mode', light), row('Brightness', bright));

    const time = sec('Clock');
    const fmt = el('select', field);
    [['24', '24-hour'], ['12', '12-hour']].forEach(([v, t]) => { const o = el('option'); o.value = v; o.textContent = t; fmt.appendChild(o); });
    fmt.onchange = () => setSetting('hour12', fmt.value === '12');
    time.append(row('Time format', fmt));

    const sys = sec('Desktop');
    sys.append(btn('Reset desktop settings', () => {
      if (confirm('Reset wallpaper, colors and clock settings?')) resetSettings();
    }, '#a3454a'));

    const sync = () => {
      const s = getSettings();
      accent.value = s.accent; light.checked = s.light; bright.value = s.brightness; fmt.value = s.hour12 ? '12' : '24';
    };
    sync(); unsub = subscribeSettings(sync);
    container.append(wall, look, time, sys);
  },
  unmount() { unsub && unsub(); },
});
