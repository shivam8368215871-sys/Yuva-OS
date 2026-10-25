import { registerApp } from '../../core/appRegistry.js';

const STYLE_ID = 'yuva-file-manager-v2-styles';

function addStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .yuva-fm {
      --fm-bg:#11131b; --fm-panel:#171a24; --fm-line:#292d3b;
      --fm-text:#e4e8f4; --fm-muted:#919bb2; --fm-accent:#8b9cff;
      display:flex; height:100%; min-height:0; width:100%;
      overflow:hidden; background:var(--fm-bg); color:var(--fm-text);
      font:13px/1.45 Inter,ui-sans-serif,system-ui,sans-serif;
      border-radius:inherit; position:relative;
    }
    .yuva-fm * { box-sizing:border-box; }
    /* Keep hidden folders and controls hidden even when component CSS sets display. */
    .yuva-fm [hidden] { display: none !important; }
    .yuva-fm button,.yuva-fm input,.yuva-fm select { font:inherit; }
    .yuva-fm button { color:inherit; cursor:pointer; }
    .yuva-fm button:focus-visible,.yuva-fm input:focus-visible,
    .yuva-fm select:focus-visible { outline:2px solid var(--fm-accent); outline-offset:2px; }
    .fm-sidebar {
      width:174px; flex:0 0 174px; padding:17px 10px;
      background:#151722; border-right:1px solid var(--fm-line);
      overflow:auto;
    }
    .fm-brand { display:flex;align-items:center;gap:10px;padding:2px 8px 19px;font-size:14px;font-weight:750; }
    .fm-brand-mark {
      width:30px;height:30px;border-radius:10px;display:grid;place-items:center;
      background:linear-gradient(135deg,#8796ff,#c19cff);color:#141627;font-size:17px;
    }
    .fm-side-label {
      color:#727d96;font-size:10px;font-weight:800;letter-spacing:1.3px;
      padding:10px 9px 6px;text-transform:uppercase;
    }
    .fm-side-btn {
      width:100%;display:flex;align-items:center;gap:10px;text-align:left;
      border:1px solid transparent;border-radius:9px;padding:9px 10px;
      margin:2px 0;background:transparent;color:#aab3c9!important;
      transition:background .15s,border-color .15s;
    }
    .fm-side-btn:hover { background:#202433; }
    .fm-side-btn.active {
      background:#292e47;border-color:#39415e;color:#e0e5ff!important;
    }
    .fm-side-icon { width:19px;text-align:center;font-size:16px; }
    .fm-side-note { margin:22px 8px 0;padding-top:13px;border-top:1px solid var(--fm-line);font-size:11px;color:#737e96;line-height:1.7; }
    .fm-main { flex:1;min-width:0;min-height:0;display:flex;flex-direction:column; }
    .fm-toolbar {
      display:flex;align-items:center;gap:7px;padding:12px 15px 10px;
      flex-wrap:wrap;border-bottom:1px solid var(--fm-line);
    }
    .fm-nav-group { display:flex;gap:4px; }
    .fm-btn {
      display:inline-flex;align-items:center;justify-content:center;gap:6px;
      border:1px solid #000;border-radius:8px;padding:7px 10px;
      background:#222634;color:#dbe1f3!important;white-space:nowrap;
      transition:background .15s,border-color .15s;
    }
    .fm-btn:hover { background:#30364a;border-color:#49516b; }
    .fm-btn:disabled { opacity:.35;cursor:default; }
    .fm-btn.primary { background:#7889ed;border-color:#7889ed;color:#111526!important;font-weight:700; }
    .fm-btn.primary:hover { background:#94a1ff; }
    .fm-btn.icon { width:34px;padding:7px 0;font-size:15px; }
    .fm-toolbar-spacer { flex:1; }
    .fm-search {
      min-width:110px;width:min(205px,100%);height:34px;padding:0 10px;
      color:var(--fm-text);background:#10121a;border:1px solid #33384a;
      border-radius:9px;outline:none;
    }
    .fm-search::placeholder { color:#747f98; }
    .fm-search:focus { border-color:#7889ed; }
    .fm-crumbs {
      min-height:42px;display:flex;align-items:center;gap:5px;flex-wrap:wrap;
      padding:7px 17px;border-bottom:1px solid var(--fm-line);
      color:var(--fm-muted);font-size:12px;
    }
    .fm-crumb {
      border:0;background:transparent;color:#aeb8d1!important;padding:4px 5px;border-radius:5px;
      overflow-wrap:anywhere;
    }
    .fm-crumb:hover { background:#252a3a;color:#fff!important; }
    .fm-crumb.current { color:#edf0ff!important;font-weight:700; }
    .fm-location-heading { display:flex;align-items:center;justify-content:space-between;gap:10px;padding:15px 18px 11px; }
    .fm-location-title { font-size:18px;font-weight:750;letter-spacing:-.4px; }
    .fm-location-sub { color:var(--fm-muted);font-size:11px;margin-top:3px; }
    .fm-view-switch { display:flex;gap:3px;padding:3px;border:1px solid #303548;border-radius:9px;background:#171a25; }
    .fm-view-btn { width:30px;height:28px;border:0;border-radius:6px;background:transparent;color:#929db5!important; }
    .fm-view-btn.active { background:#303750;color:#e5e9ff!important; }
    .fm-list-head {
      display:grid;grid-template-columns:minmax(150px,1fr) 100px 140px;
      gap:10px;align-items:center;padding:8px 18px;border-bottom:1px solid var(--fm-line);
      color:#8994ac;font-size:11px;
    }
    .fm-sort-btn { text-align:left;border:0;background:transparent;color:inherit!important;padding:0; }
    .fm-sort-btn:hover { color:#e1e6ff!important; }
    .fm-items { flex:1;min-height:0;overflow:auto;padding:6px 10px 14px; }
    .fm-items.grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(116px,1fr));align-content:start;gap:8px;padding:12px; }
    .fm-item {
      min-width:0;display:grid;grid-template-columns:minmax(0,1fr) 100px 140px;
      gap:10px;align-items:center;padding:8px;border:1px solid transparent;
      border-radius:8px;cursor:default;transition:background .12s,border-color .12s;
    }
    .fm-item:hover { background:#1d2130; }
    .fm-item.selected { background:#282f4b;border-color:#495783; }
    .fm-item:focus-visible { outline:2px solid var(--fm-accent); }
    .fm-file-name { display:flex;align-items:center;gap:10px;min-width:0; }
    .fm-file-icon {
  flex: 0 0 32px;
  width: 32px;
  height: 34px;
  display: block;
  object-fit: contain;
  opacity: 0.9;
}
    .fm-file-label { min-width:0;overflow-wrap:anywhere;color:#e0e5f3; }
    .fm-item.folder .fm-file-label { font-weight:650; }
    .fm-file-sub { display:none;color:#8792ab;font-size:10px;margin-top:2px; }
    .fm-cell { color:#9ba5bb;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
    .fm-items.grid .fm-item {
      display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;
      min-height:114px;padding:13px 9px;text-align:center;gap:6px;
      border-color:#292e3c;background:#181b26;
    }
    .fm-items.grid .fm-item:hover { background:#222737;border-color:#424b65; }
    .fm-items.grid .fm-item.selected { background:#282f4b;border-color:#6577c4; }
    .fm-items.grid .fm-file-name { flex-direction:column;gap:5px; }
    .fm-items.grid .fm-file-icon { width:44px;height:45px;
     }
    .fm-items.grid .fm-file-label { width:100%;font-size:12px; }
    .fm-items.grid .fm-file-sub { display:block; }
    .fm-items.grid .fm-cell { display:none; }
    .fm-empty { display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;min-height:200px;color:#909bb2;padding:25px; }
    .fm-empty-icon { font-size:40px;margin-bottom:12px; }
    .fm-empty-title { color:#dce2f2;font-size:14px;font-weight:700; }
    .fm-empty-desc { font-size:12px;margin-top:5px; }
    .fm-status {
      min-height:32px;display:flex;align-items:center;gap:12px;padding:6px 15px;
      background:#151722;border-top:1px solid var(--fm-line);color:#8792aa;font-size:11px;
    }
    .fm-status-dot { width:6px;height:6px;border-radius:50%;background:#77d5a4; }
    .fm-status-spacer { flex:1; }
    .fm-context {
      position:absolute;z-index:50;min-width:165px;padding:5px;
      background:#202432;border:1px solid #000;border-radius:10px;
      box-shadow:0 12px 36px #0008;display:flex;flex-direction:column;
    }
    .fm-context button {
      display:flex;gap:10px;align-items:center;text-align:left;width:100%;
      padding:8px 10px;border:0;border-radius:6px;background:transparent;
    }
    .fm-context button:hover { background:#343b52; }
    .fm-context button.danger { color:#ff9ba6; }
    .fm-context hr { border:0;border-top:1px solid #3a4051;width:100%;margin:4px 0; }
    .fm-toast { color:#ffb6bd!important; }
    .fm-busy { opacity:.65;pointer-events:none; }
    @media(max-width:580px) {
      .fm-sidebar { width:55px;flex-basis:55px;padding:12px 5px; }
      .fm-brand { padding:4px 5px 17px; }
      .fm-brand-text,.fm-side-label,.fm-side-text,.fm-side-note { display:none; }
      .fm-side-btn { justify-content:center;padding:10px 0; }
      .fm-side-icon { font-size:18px; }
      .fm-toolbar { padding:9px;gap:5px; }
      .fm-toolbar .fm-btn { padding:7px; }
      .fm-toolbar .fm-btn.primary { padding:7px 8px; }
      .fm-search { width:100%;order:5;flex-basis:100%; }
      .fm-list-head { display:none; }
      .fm-item { grid-template-columns:minmax(0,1fr) 65px;gap:6px;padding:8px 5px; }
      .fm-item .fm-cell:last-child { display:none; }
      .fm-items { padding:5px; }
      .fm-location-heading { padding:11px; }
    }
  `;
  document.head.appendChild(style);
}

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function getUid() {
  let id = localStorage.getItem('yuva_uid');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('yuva_uid', id);
  }
  return id;
}


function fileIcon(item) {
  if (item.type === 'folder') return '/assets/icons/folder.svg';

  if (item.type !== 'file') return '/assets/icons/file.svg';

  if (item.name.startsWith('.')) return '/assets/icons/settings.svg';

  const ext = item.name.includes('.')
    ? item.name.split('.').pop().toLowerCase()
    : '';

  const icons = {
    txt: 'file-text.svg',
    md: 'file-pen.svg',
    log: 'file-text.svg',
    pdf: 'file-text.svg',
    doc: 'file-text.svg',
    docx: 'file-text.svg',
    odt: 'file-text.svg',
    rtf: 'file-text.svg',

    jpg: 'file-image.svg',
    jpeg: 'file-image.svg',
    png: 'file-image.svg',
    gif: 'file-image.svg',
    svg: 'file-code.svg',
    webp: 'file-image.svg',

    mp3: 'eighth-notes.svg',
    wav: 'eighth-notes.svg',
    ogg: 'eighth-notes.svg',
    flac: 'eighth-notes.svg',
    mp4: 'file-play.svg',
    mkv: 'file-play.svg',
    mov: 'file-play.svg',
    webm: 'file-play.svg',

    zip: 'file-archive.svg',
    rar: 'file-archive.svg',
    '7z': 'file-archive.svg',
    tar: 'file-archive.svg',
    gz: 'file-archive.svg',

    java: 'file-code.svg',
    js: 'file-code.svg',
    mjs: 'file-code.svg',
    cjs: 'file-code.svg',
    ts: 'file-code.svg',
    jsx: 'file-code.svg',
    tsx: 'file-code.svg',
    py: 'file-code.svg',
    rb: 'file-code.svg',
    go: 'file-code.svg',
    rs: 'file-code.svg',
    c: 'file-code.svg',
    h: 'file-code.svg',
    cpp: 'file-code.svg',
    hpp: 'file-code.svg',
    html: 'file-code.svg',
    htm: 'file-code.svg',
    css: 'file-code.svg',
    scss: 'file-code.svg',
    json: 'file-code.svg',
    xml: 'file-code.svg',
    yaml: 'file-code.svg',
    yml: 'file-code.svg',
    toml: 'file-code.svg',
    sh: 'terminal.svg',
    bash: 'terminal.svg',
    zsh: 'terminal.svg',
    sql: 'file-code.svg',

    csv: 'file-spreadsheet.svg',
    xls: 'file-spreadsheet.svg',
    xlsx: 'file-spreadsheet.svg',
    ods: 'file-spreadsheet.svg',
    ppt: 'file-text.svg',
    pptx: 'file-text.svg',
    lock: 'settings.svg',
    env: 'settings.svg',
  };

  return `/assets/icons/${icons[ext] || 'file.svg'}`;
}


function formatSize(bytes, type) {
  if (type === 'folder') return '—';
  if (type !== 'file') return 'Other';
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1048576) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1073741824) return `${(size / 1048576).toFixed(1)} MB`;
  return `${(size / 1073741824).toFixed(2)} GB`;
}

function formatDate(seconds) {
  if (!seconds) return '—';
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric'
  }).format(date);
}

registerApp({
  id: 'files',
  title: 'File Manager',
  defaultSize: { w: 900, h: 600 },
  singleton: true,

  mount(container) {
    addStyles();

    container.style.cssText = 'height:100%;min-height:0;overflow:hidden;padding:0;';
    container.replaceChildren();

    const root = el('div', undefined, 'yuva-fm');
    const sidebar = el('aside', undefined, 'fm-sidebar');
    const main = el('section', undefined, 'fm-main');
    const toolbar = el('div', undefined, 'fm-toolbar');
    const crumbs = el('nav', undefined, 'fm-crumbs');
    const heading = el('div', undefined, 'fm-location-heading');
    const listHead = el('div', undefined, 'fm-list-head');
    const itemsEl = el('div', undefined, 'fm-items');
    const status = el('footer', undefined, 'fm-status');
    const context = el('div', undefined, 'fm-context');

    context.hidden = true;
    context.setAttribute('role', 'menu');

    const brand = el('div', undefined, 'fm-brand');
    brand.append(el('span', '✦', 'fm-brand-mark'), el('span', 'YuVA Files', 'fm-brand-text'));
    sidebar.appendChild(brand);

    const sideLabel = el('div', 'LOCATIONS', 'fm-side-label');
    sidebar.appendChild(sideLabel);

    const sideButtons = {};
    const locations = [
      ['home', '⌂', 'Home'],
      ['workspace', '▣', 'Workspace'],
      ['group:students', '♧', 'Students'],
      ['group:admin', '◆', 'Admin']
    ];

    for (const [id, icon, label] of locations) {
      const button = el('button', undefined, 'fm-side-btn');
      button.type = 'button';
      button.dataset.location = id;
      if (id.startsWith('group:')) button.hidden = true;
      button.append(el('span', icon, 'fm-side-icon'), el('span', label, 'fm-side-text'));
      button.onclick = () => {
        if (locationName === id && currentPath === '') return;
        locationName = id;
        currentPath = '';
        selected.clear();
        search.value = '';
        navigate('');
      };
      sideButtons[id] = button;
      sidebar.appendChild(button);
    }

    const futureLabel = el('div', 'QUICK ACCESS', 'fm-side-label');
    futureLabel.style.marginTop = '18px';
    sidebar.appendChild(futureLabel);

    const quickFolders = [
      ['⇩', 'Downloads', 'Downloads'],
      ['▤', 'Documents', 'Documents'],
      ['▧', 'Pictures', 'Pictures'],
      ['♫', 'Music', 'Music'],
      ['▣', 'Videos', 'Videos'],
      ['▰', 'Desktop', 'Desktop'],
      ['▧', 'Templates', 'Templates']
    ];

    for (const [icon, label, folder] of quickFolders) {
      const button = el('button', undefined, 'fm-side-btn');
      button.type = 'button';
      button.title = `Open ${label}`;
      button.append(el('span', icon, 'fm-side-icon'), el('span', label, 'fm-side-text'));
      button.onclick = () => {
        locationName = 'home';
        currentPath = folder;
        selected.clear();
        search.value = '';
        navigate(folder);
      };
      sidebar.appendChild(button);
    }

    const trashButton = el('button', undefined, 'fm-side-btn');
    trashButton.type = 'button';
    trashButton.title = 'Trash support is not configured yet';
    trashButton.disabled = true;
    trashButton.style.opacity = '.38';
    trashButton.append(
      el('span', '♲', 'fm-side-icon'),
      el('span', 'Trash', 'fm-side-text')
    );
    sidebar.appendChild(trashButton);

    const sideNote = el('div',
      'Your personal files, organized in one place.',
      'fm-side-note');
    sidebar.appendChild(sideNote);

    const backBtn = el('button', '←', 'fm-btn icon');
    const upBtn = el('button', '↑', 'fm-btn icon');
    const refreshBtn = el('button', '↻', 'fm-btn icon');
    backBtn.title = 'Back';
    upBtn.title = 'Go to parent folder';
    refreshBtn.title = 'Refresh';
    backBtn.setAttribute('aria-label', 'Back');
    upBtn.setAttribute('aria-label', 'Go to parent folder');
    refreshBtn.setAttribute('aria-label', 'Refresh');

    const navGroup = el('div', undefined, 'fm-nav-group');
    navGroup.append(backBtn, upBtn, refreshBtn);

    const newFolderBtn = el('button', '+ Folder', 'fm-btn');
    const newFileBtn = el('button', '+ File', 'fm-btn primary');

    const uploadInput = el('input');
    uploadInput.type = 'file';
    uploadInput.hidden = true;
    uploadInput.multiple = false;

    const search = el('input', undefined, 'fm-search');
    search.type = 'search';
    search.placeholder = '⌕  Search this folder';
    search.setAttribute('aria-label', 'Search current folder');

    const toolbarSpacer = el('div', undefined, 'fm-toolbar-spacer');
    toolbar.append(navGroup, newFolderBtn, newFileBtn, toolbarSpacer, search);

    const headingText = el('div');
    const locationTitle = el('div', 'Home', 'fm-location-title');
    const locationSub = el('div', 'Your files and folders', 'fm-location-sub');
    headingText.append(locationTitle, locationSub);

    const viewSwitch = el('div', undefined, 'fm-view-switch');
    const listViewBtn = el('button', '☷', 'fm-view-btn active');
    const gridViewBtn = el('button', '▦', 'fm-view-btn');
    listViewBtn.title = 'List view';
    gridViewBtn.title = 'Grid view';
    listViewBtn.setAttribute('aria-label', 'List view');
    gridViewBtn.setAttribute('aria-label', 'Grid view');
    listViewBtn.type = gridViewBtn.type = 'button';
    viewSwitch.append(listViewBtn, gridViewBtn);
    heading.append(headingText, viewSwitch);

    const sortName = el('button', 'Name', 'fm-sort-btn');
    const sortSize = el('button', 'Size', 'fm-sort-btn');
    const sortModified = el('button', 'Modified', 'fm-sort-btn');
    sortName.dataset.sort = 'name';
    sortSize.dataset.sort = 'size';
    sortModified.dataset.sort = 'modified';
    listHead.append(sortName, sortSize, sortModified);

    const statusDot = el('span', undefined, 'fm-status-dot');
    const statusText = el('span', 'Ready');
    const statusSpacer = el('span', undefined, 'fm-status-spacer');
    const selectedText = el('span', '0 selected');
    status.append(statusDot, statusText, statusSpacer, selectedText);

    main.append(toolbar, crumbs, heading, listHead, itemsEl, status);
    root.append(sidebar, main, context);
    container.appendChild(root);

    let locationName = 'home';
    let currentPath = '';
    let disposed = false;
    let requestNumber = 0;
    let allItems = [];
    let selected = new Set();
    let lastSelected = null;
    let view = 'list';
    let sortKey = 'name';
    let sortDirection = 1;
    let history = [];
    let historyIndex = -1;
    let busy = false;
    const uid = getUid();
    let groupRole = null;

    function isGroupLocation() {
      return locationName.startsWith('group:');
    }

    function groupName() {
      return isGroupLocation() ? locationName.slice(6) : '';
    }

    function groupEndpoint() {
      return `/api/group-folders/${groupName()}`;
    }

    function updateGroupToolbar() {
      const group = isGroupLocation();
      const admin = groupRole === 'admin';
      newFolderBtn.hidden = group && !admin;
      newFileBtn.hidden = group && !admin;
      if (group && admin) {
        newFileBtn.textContent = '+ Upload';
        newFileBtn.title = 'Upload a file to this shared folder';
      } else {
        newFileBtn.textContent = '+ File';
        newFileBtn.title = 'Create a new empty file';
      }
    }

    function setStatus(message, isError = false) {
      statusText.textContent = message;
      statusText.classList.toggle('fm-toast', isError);
      statusDot.style.background = isError ? '#ff7e8a' : '#77d5a4';
    }

    function setBusy(value) {
      busy = value;
      toolbar.classList.toggle('fm-busy', value);
    }

    function pathFor(name) {
      return currentPath ? `${currentPath}/${name}` : name;
    }

    function rememberPath() {
      const entry = { location: locationName, path: currentPath };
      const previous = history[historyIndex];
      if (previous && previous.location === entry.location && previous.path === entry.path) return;
      history = history.slice(0, historyIndex + 1);
      history.push(entry);
      if (history.length > 80) history.shift();
      historyIndex = history.length - 1;
    }

    function updateNavigationButtons() {
      backBtn.disabled = historyIndex <= 0;
      upBtn.disabled = !currentPath;
      for (const [id, button] of Object.entries(sideButtons)) {
        button.classList.toggle('active', locationName === id);
        button.setAttribute('aria-current', locationName === id ? 'page' : 'false');
      }
    }

    function renderBreadcrumb() {
      crumbs.replaceChildren();
      const parts = currentPath.split('/').filter(Boolean);
      const rootLabel = isGroupLocation()
        ? (groupName() === 'students' ? '♧  Students' : '◆  Admin')
        : (locationName === 'home' ? '⌂  Home' : '▣  Workspace');
      const rootCrumb = el('button', rootLabel, 'fm-crumb');
      rootCrumb.type = 'button';
      rootCrumb.onclick = () => navigate('', { remember: true });
      crumbs.appendChild(rootCrumb);

      let accumulated = '';
      for (let i = 0; i < parts.length; i++) {
        crumbs.appendChild(el('span', '›'));
        accumulated = accumulated ? `${accumulated}/${parts[i]}` : parts[i];
        const target = accumulated;
        const button = el('button', parts[i], `fm-crumb${i === parts.length - 1 ? ' current' : ''}`);
        button.type = 'button';
        button.onclick = () => navigate(target, { remember: true });
        crumbs.appendChild(button);
      }
    }

    function renderHeading() {
      const group = isGroupLocation();
      const rootLabel = group
        ? (groupName() === 'students' ? 'Students' : 'Admin')
        : (locationName === 'home' ? 'Home' : 'Workspace');

      locationTitle.textContent =
        currentPath.split('/').filter(Boolean).pop() || rootLabel;

      locationSub.textContent = currentPath
        ? `/${currentPath} · ${rootLabel}`
        : group
          ? (groupRole === 'admin' ? 'Shared group files · Upload enabled' : 'Shared files · Read only')
          : locationName === 'home'
            ? 'Your personal home directory'
            : 'Shared workspace files';

      updateGroupToolbar();
    }

    function getVisibleItems() {
      const query = search.value.trim().toLocaleLowerCase();
      const filtered = allItems.filter(item => !query || item.name.toLocaleLowerCase().includes(query));

      filtered.sort((a, b) => {
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (b.type === 'folder' && a.type !== 'folder') return 1;

        let comparison = 0;
        if (sortKey === 'size') comparison = (Number(a.size) || 0) - (Number(b.size) || 0);
        else if (sortKey === 'modified') comparison = (Number(a.modified) || 0) - (Number(b.modified) || 0);
        else if (sortKey === 'type') comparison = (a.name.split('.').pop() || '').localeCompare(b.name.split('.').pop() || '');
        else comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

        return comparison * sortDirection;
      });

      return filtered;
    }

    function updateSortLabels() {
      for (const button of listHead.querySelectorAll('[data-sort]')) {
        const key = button.dataset.sort;
        const label = key[0].toUpperCase() + key.slice(1);
        button.textContent = key === sortKey ? `${label} ${sortDirection === 1 ? '↑' : '↓'}` : label;
      }
    }

    function renderItems() {
      const visible = getVisibleItems();
      itemsEl.replaceChildren();
      itemsEl.classList.toggle('grid', view === 'grid');
      listViewBtn.classList.toggle('active', view === 'list');
      gridViewBtn.classList.toggle('active', view === 'grid');
      listHead.hidden = view === 'grid';

      if (!visible.length) {
        const empty = el('div', undefined, 'fm-empty');
        empty.appendChild(el('div', search.value ? '⌕' : '📂', 'fm-empty-icon'));
        empty.appendChild(el('div', search.value ? 'No matching files' : 'This folder is empty', 'fm-empty-title'));
        empty.appendChild(el('div',
          search.value ? 'Try another search term.' : 'Create a file or folder to get started.',
          'fm-empty-desc'));
        itemsEl.appendChild(empty);
      }

      for (const item of visible) {
        const row = el('div', undefined, `fm-item${item.type === 'folder' ? ' folder' : ''}${selected.has(item.name) ? ' selected' : ''}`);
        row.dataset.name = item.name;
        row.tabIndex = 0;
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', selected.has(item.name) ? 'true' : 'false');
        row.title = `${item.name}${item.type === 'folder' ? ' · Folder' : ` · ${formatSize(item.size, item.type)}`}`;

        const nameCell = el('div', undefined, 'fm-file-name');
        nameCell.append(
          (() => {
            const icon = el('img', null, 'fm-file-icon');
            icon.src = fileIcon(item);
            icon.alt = '';
            icon.draggable = false;
            return icon;
          })(),
          (() => {
            const wrap = el('div');
            wrap.style.minWidth = '0';
            wrap.style.flex = '1';
            wrap.append(el('div', item.name, 'fm-file-label'));
            wrap.append(el('div', item.type === 'folder' ? 'Folder' : (item.name.includes('.') ? item.name.split('.').pop().toUpperCase() + ' file' : 'File'), 'fm-file-sub'));
            return wrap;
          })()
        );

        const sizeCell = el('div', formatSize(item.size, item.type), 'fm-cell');
        const modifiedCell = el('div', formatDate(item.modified), 'fm-cell');
        row.append(nameCell, sizeCell, modifiedCell);

        row.addEventListener('click', event => {
          closeContext();
          if (event.ctrlKey || event.metaKey) {
            selected.has(item.name) ? selected.delete(item.name) : selected.add(item.name);
            lastSelected = item.name;
          } else if (event.shiftKey && lastSelected) {
            const names = visible.map(x => x.name);
            const a = names.indexOf(lastSelected);
            const b = names.indexOf(item.name);
            if (a >= 0 && b >= 0) {
              selected.clear();
              names.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(name => selected.add(name));
            }
          } else {
            selected.clear();
            selected.add(item.name);
            lastSelected = item.name;
          }
          // Update selection in place. Re-rendering here replaces the clicked
          // row and can prevent the browser from delivering the double-click.
          itemsEl.querySelectorAll('.fm-item').forEach(fileRow => {
            const isSelected = selected.has(fileRow.dataset.name);
            fileRow.classList.toggle('selected', isSelected);
            fileRow.setAttribute('aria-selected', isSelected ? 'true' : 'false');
          });
          updateSelectedStatus();
        });

        row.addEventListener('dblclick', () => openItem(item));
        row.addEventListener('contextmenu', event => {
          event.preventDefault();
          event.stopPropagation();
          if (!selected.has(item.name)) {
            selected.clear();
            selected.add(item.name);
            lastSelected = item.name;
            renderItems();
            updateSelectedStatus();
          }
          showContext(event.clientX, event.clientY, item);
        });
        row.addEventListener('keydown', event => {
          if (event.key === 'Enter') openItem(item);
          if (event.key === 'F2') {
            event.preventDefault();
            renameItem(item);
          }
          if (event.key === 'Delete') {
            event.preventDefault();
            deleteItem(item);
          }
        });

        itemsEl.appendChild(row);
      }

      updateSortLabels();
      selectedText.textContent = `${selected.size} selected`;
      if (search.value.trim()) {
        setStatus(`${visible.length} of ${allItems.length} item(s)`);
      } else {
        setStatus(`${allItems.length} item(s)`);
      }
    }

    function updateSelectedStatus() {
      selectedText.textContent = `${selected.size} selected`;
    }

    async function openItem(item) {
      if (item.type === 'folder') {
        selected.clear();
        navigate(pathFor(item.name), { remember: true });
        return;
      }

      if (item.type !== 'file') {
        setStatus('This item type cannot be opened yet.', true);
        return;
      }

      if (isGroupLocation()) {
        try {
          const response = await fetch(
            `${groupEndpoint()}/${encodeURIComponent(item.id)}/download`
          );
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'Download failed.');
          }
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = item.name;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
          setStatus(error.message, true);
          window.alert(error.message);
        }
        return;
      }

      window.dispatchEvent(new CustomEvent('yuva:open-file', {
        detail: { uid, location: locationName, path: pathFor(item.name) }
      }));
    }

    function closeContext() {
      context.hidden = true;
      context.replaceChildren();
    }

    function showContext(x, y, item) {
      context.replaceChildren();
      context.hidden = false;

      const addAction = (icon, label, callback, danger = false) => {
        const button = el('button', undefined, danger ? 'danger' : '');
        button.type = 'button';
        button.setAttribute('role', 'menuitem');
        button.append(el('span', icon), el('span', label));
        button.onclick = () => {
          closeContext();
          callback();
        };
        context.appendChild(button);
      };

      if (selected.size > 1) {
        addAction('✓', `Selected: ${selected.size} items`, () => { });
        context.appendChild(document.createElement('hr'));
      } else {
        addAction(
          isGroupLocation() && item.type === 'file' ? '↓' : '↗',
          isGroupLocation() && item.type === 'file' ? 'Download' : 'Open',
          () => openItem(item)
        );

        // Shared group folders are managed through their role-specific
        // permissions. Never offer personal-file rename/delete actions here.
        if (!isGroupLocation()) {
          context.appendChild(document.createElement('hr'));
          addAction('✎', 'Rename  ·  F2', () => renameItem(item));
          addAction('⌫', 'Delete', () => deleteItem(item), true);
        }
      }

      context.style.left = '0px';
      context.style.top = '0px';
      const bounds = root.getBoundingClientRect();
      const menuWidth = 180;
      const menuHeight = context.scrollHeight || 120;
      const left = Math.max(4, Math.min(x - bounds.left, bounds.width - menuWidth - 4));
      const top = Math.max(4, Math.min(y - bounds.top, bounds.height - menuHeight - 4));
      context.style.left = `${left}px`;
      context.style.top = `${top}px`;
    }

    async function action(operation, name = '', newName = '', contentText = '') {
      const response = await fetch('/api/files/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid, location: locationName, path: currentPath,
          operation, name, newName, content: contentText
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Operation failed.');
      return data;
    }

    async function runAction(operation, name, newName = '') {
      if (busy) return;
      setBusy(true);
      setStatus('Working…');
      try {
        await action(operation, name, newName);
        selected.clear();
        await navigate(currentPath, { remember: false });
      } catch (error) {
        setStatus(error.message, true);
        window.alert(error.message);
      } finally {
        setBusy(false);
      }
    }

    function renameItem(item) {
      const proposed = window.prompt('Enter the new name:', item.name);
      if (proposed === null || proposed === item.name) return;
      if (!proposed.trim()) return window.alert('Name cannot be empty.');
      if (proposed.includes('/') || proposed.includes('\\')) return window.alert('Enter a name, not a path.');
      runAction('rename', item.name, proposed.trim());
    }

    function deleteItem(item) {
      const names = selected.has(item.name) && selected.size > 1
        ? [...selected]
        : [item.name];

      const message = names.length > 1
        ? `Delete ${names.length} selected items?\n\nThis cannot be undone.`
        : `Delete "${item.name}"?${item.type === 'folder' ? '\nEverything inside this folder will also be deleted.' : ''}\n\nThis cannot be undone.`;

      if (!window.confirm(message)) return;

      (async () => {
        setBusy(true);
        try {
          for (const name of names) await action('delete', name);
          selected.clear();
          await navigate(currentPath, { remember: false });
        } catch (error) {
          setStatus(error.message, true);
          window.alert(error.message);
        } finally {
          setBusy(false);
        }
      })();
    }

    async function navigate(nextPath = currentPath, options = {}) {
      const { remember = true } = options;
      currentPath = nextPath;
      const thisRequest = ++requestNumber;
      selected.clear();
      closeContext();
      renderBreadcrumb();
      renderHeading();
      updateNavigationButtons();
      itemsEl.replaceChildren(el('div', 'Loading directory…', 'fm-empty'));
      setStatus('Loading directory…');

      if (remember) rememberPath();

      const params = new URLSearchParams({ uid, location: locationName, path: currentPath });

      try {
        const url = isGroupLocation()
          ? `${groupEndpoint()}?path=${encodeURIComponent(currentPath)}`
          : `/api/files?${params}`;

        const response = await fetch(url);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to list files.');
        if (disposed || thisRequest !== requestNumber) return;

        allItems = Array.isArray(data.items) ? data.items : [];
        renderItems();
        updateNavigationButtons();
      } catch (error) {
        if (disposed || thisRequest !== requestNumber) return;
        allItems = [];
        itemsEl.replaceChildren();
        const empty = el('div', undefined, 'fm-empty');
        empty.append(el('div', '⚠️', 'fm-empty-icon'), el('div', 'Could not load this folder', 'fm-empty-title'), el('div', error.message, 'fm-empty-desc'));
        itemsEl.appendChild(empty);
        setStatus(error.message, true);
      }
    }

    function goUp() {
      if (!currentPath) return;
      const parts = currentPath.split('/').filter(Boolean);
      parts.pop();
      navigate(parts.join('/'), { remember: true });
    }

    async function createItem(operation) {
      const isFolder = operation === 'mkdir';
      const group = isGroupLocation();
      const name = window.prompt(isFolder ? 'New folder name:' : 'New empty file name:');
      if (name === null) return;
      if (!name.trim()) return window.alert('Name cannot be empty.');
      if (name.includes('/') || name.includes('\\')) return window.alert('Enter a name, not a path.');

      if (group) {
        if (groupRole !== 'admin') {
          window.alert('This shared folder is read-only for your account.');
          return;
        }
        if (!isFolder) {
          window.alert('Use the Upload button to add a file.');
          return;
        }

        setBusy(true);
        try {
          const response = await fetch(`${groupEndpoint()}/folder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim(), path: currentPath })
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Could not create folder.');
          await navigate(currentPath, { remember: false });
        } catch (error) {
          setStatus(error.message, true);
          window.alert(error.message);
        } finally {
          setBusy(false);
        }
        return;
      }

      runAction(operation, name.trim());
    }

    backBtn.onclick = () => {
      if (historyIndex <= 0) return;
      historyIndex--;
      const entry = history[historyIndex];
      locationName = entry.location;
      navigate(entry.path, { remember: false });
    };
    upBtn.onclick = goUp;
    refreshBtn.onclick = () => navigate(currentPath, { remember: false });
    newFolderBtn.onclick = () => createItem('mkdir');
    newFileBtn.onclick = () => {
      if (!isGroupLocation()) {
        createItem('create-file');
        return;
      }
      if (groupRole !== 'admin') return;
      uploadInput.click();
    };

    uploadInput.addEventListener('change', async () => {
      const file = uploadInput.files?.[0];
      uploadInput.value = '';
      if (!file || !isGroupLocation() || groupRole !== 'admin') return;

      setBusy(true);
      setStatus('Uploading…');
      try {
        const query = new URLSearchParams({
          name: file.name,
          path: currentPath
        });
        const response = await fetch(`${groupEndpoint()}/upload?${query}`, {
          method: 'POST',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Upload failed.');
        await navigate(currentPath, { remember: false });
      } catch (error) {
        setStatus(error.message, true);
        window.alert(error.message);
      } finally {
        setBusy(false);
      }
    });

    toolbar.appendChild(uploadInput);

    search.addEventListener('input', () => {
      selected.clear();
      renderItems();
      updateSelectedStatus();
    });

    listViewBtn.onclick = () => { view = 'list'; renderItems(); };
    gridViewBtn.onclick = () => { view = 'grid'; renderItems(); };

    for (const button of listHead.querySelectorAll('[data-sort]')) {
      button.addEventListener('click', () => {
        const key = button.dataset.sort;
        if (sortKey === key) sortDirection *= -1;
        else {
          sortKey = key;
          sortDirection = 1;
        }
        renderItems();
      });
    }

    root.addEventListener('click', event => {
      if (!context.hidden && !context.contains(event.target)) closeContext();
    });
    root.addEventListener('contextmenu', event => {
      if (!event.target.closest('.fm-item')) {
        event.preventDefault();
        selected.clear();
        updateSelectedStatus();
        closeContext();
      }
    });

    const onKeyDown = event => {
      if (disposed) return;
      const inSearch = event.target === search;
      if (event.key === 'Escape') {
        closeContext();
        if (search.value) {
          search.value = '';
          renderItems();
        }
        return;
      }
      if (inSearch) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        selected = new Set(getVisibleItems().map(item => item.name));
        renderItems();
        return;
      }
      if (event.key === 'Backspace' && event.target === root) {
        event.preventDefault();
        goUp();
      }
      if (event.key === 'Delete' && selected.size === 1) {
        const item = allItems.find(x => x.name === [...selected][0]);
        if (item) deleteItem(item);
      }
    };

    root.tabIndex = -1;
    root.addEventListener('keydown', onKeyDown);

    navigate('');

    fetch('/api/group-folders/me')
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load role.');
        groupRole = data.role;

        if (sideButtons['group:students']) {
          sideButtons['group:students'].hidden =
            groupRole !== 'admin' || !data.locations.includes('students');
        }
        if (sideButtons['group:admin']) {
          sideButtons['group:admin'].hidden =
            groupRole !== 'student' || !data.locations.includes('admin');
        }

        updateGroupToolbar();
      })
      .catch(error => {
        setStatus(`Group folders unavailable: ${error.message}`, true);
      });

    this._cleanup = () => {
      disposed = true;
      requestNumber++;
      closeContext();
      root.removeEventListener('keydown', onKeyDown);
    };
  },

  unmount() {
    this._cleanup?.();
  },
});
