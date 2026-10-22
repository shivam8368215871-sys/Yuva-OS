let menu = null;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function closeMenu() {
  if (menu) { menu.remove(); menu = null; }
}

/** items: { icon, label, action, danger, disabled } or the string '-' for a separator */
export function showMenu(x, y, items) {
  closeMenu();
  menu = document.createElement('div');
  menu.id = 'ctx-menu';
  menu.setAttribute('role', 'menu');

  for (const item of items) {
    if (item === '-') {
      const sep = document.createElement('div');
      sep.className = 'ctx-sep';
      menu.appendChild(sep);
      continue;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.disabled = !!item.disabled;
    if (item.danger) b.classList.add('danger');
    const icon = document.createElement('span');
    icon.className = 'ctx-i';
    icon.textContent = item.icon || '';
    const label = document.createElement('span');
    label.textContent = item.label;
    b.append(icon, label);
    b.addEventListener('click', () => { closeMenu(); item.action?.(); });
    menu.appendChild(b);
  }

  document.body.appendChild(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = clamp(x, 8, Math.max(8, innerWidth - r.width - 8)) + 'px';
  menu.style.top = clamp(y, 8, Math.max(8, innerHeight - r.height - 8)) + 'px';
}

document.addEventListener('pointerdown', (e) => { if (menu && !menu.contains(e.target)) closeMenu(); }, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
addEventListener('resize', closeMenu);
addEventListener('blur', closeMenu);
