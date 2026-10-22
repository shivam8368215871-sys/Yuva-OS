
const iconFiles = {
  terminal: 'terminal.svg',
  files: 'folder.svg',
  jupyter: 'notebook.svg',
  calculator: 'calculator.svg',
  calendar: 'calendar-days.svg',
  editor: 'file-pen.svg',
  settings: 'settings.svg',
  notes: 'notebook-pen.svg',
  tasks: 'list-checks.svg',
  clock: 'clock.svg',
  paint: 'palette.svg',
  browser: 'globe.svg',
  mentor: 'sparkles.svg',
};

export const ICONS = Object.fromEntries(
  Object.entries(iconFiles).map(([id, filename]) => [
    id,
    `/assets/icons/${filename}`,
  ]),
);

export function createIcon(id, className = '') {
  const img = document.createElement('img');
  img.className = className;
  img.src = ICONS[id] || '/assets/icons/file.svg';
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  draggableFalse(img);
  return img;
}

function draggableFalse(img) {
  img.draggable = false;
}

