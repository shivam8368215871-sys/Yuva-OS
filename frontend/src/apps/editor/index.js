
import { registerApp } from '../../core/appRegistry.js';

function el(tag, text, css) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (css) node.style.cssText = css;
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

registerApp({
  id: 'editor',
  title: 'Text Editor',
  defaultSize: { w: 820, h: 580 },
  singleton: true,

  mount(container) {
    container.style.cssText =
      'display:flex;flex-direction:column;height:100%;min-height:0;background:#101419;color:#b6beca;font:13px sans-serif';

    const toolbar = el('div', undefined,
      'display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:9px;background:#0d1014');

    const locationSelect = el('select');
    for (const [value, label] of [['workspace', 'Workspace'], ['home', 'Home']]) {
      const option = el('option', label);
      option.value = value;
      locationSelect.appendChild(option);
    }

    const pathInput = el('input');
    pathInput.placeholder = 'File path, e.g. hello.py';
    pathInput.value = '';
    pathInput.setAttribute('aria-label', 'File path');
    pathInput.style.cssText =
      'flex:1;min-width:140px;background:#0a0c0f;color:#b6beca;border:1px solid #30373d;border-radius:4px;padding:7px';

    const status = el('div', 'Ready',
      'padding:6px 10px;background:#0d1014;color:#8c929c;font-size:12px');

    function toolButton(label, callback, accent = false) {
      const button = el('button', label);
      button.type = 'button';
      button.style.cssText =
        `background:${accent ? '#78dba9' : '#1c252c'};color:${accent ? '#101419' : '#b6beca'};border:0;border-radius:5px;padding:7px 10px;cursor:pointer`;
      button.addEventListener('click', callback);
      toolbar.appendChild(button);
      return button;
    }

    const editor = el('textarea');
    editor.spellcheck = false;
    editor.setAttribute('aria-label', 'File contents');
    editor.placeholder = 'Open a file or start writing…';
    editor.style.cssText =
      'flex:1;min-height:0;width:100%;box-sizing:border-box;resize:none;border:0;outline:none;padding:16px;background:#101419;color:#b6beca;font:14px/1.6 monospace;tab-size:2;white-space:pre;overflow:auto';

    const footer = el('div', 'No file open',
      'padding:6px 10px;background:#0d1014;color:#8c929c;font-size:12px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap');

    const counts = el('span', '0 lines · 0 characters');
    footer.appendChild(counts);
    container.append(toolbar, editor, footer, status);

    let locationName = 'workspace';
    let currentFile = '';
    let savedContent = '';
    let loading = false;
    let disposed = false;
    let requestNumber = 0;
    const uid = getUid();

    function setStatus(message) {
      status.textContent = message;
    }

    function isDirty() {
      return editor.value !== savedContent;
    }

    function updateCounts() {
      const value = editor.value;
      const lines = value.length ? value.split('\n').length : 0;
      counts.textContent = `${lines} lines · ${value.length} characters`;
      footer.firstChild.textContent =
        currentFile ? `${currentFile}${isDirty() ? ' • Unsaved changes' : ''}` : 'No file open';
    }

    function safePath(value) {
      const p = value.trim();
      if (!p || p.startsWith('/') || p.includes('\\') ||
          p.split('/').some(part => !part || part === '.' || part === '..')) {
        throw new Error('Enter a relative file path, such as notes.txt or src/main.py.');
      }
      return p;
    }

    function confirmDiscard() {
      return !isDirty() || window.confirm('Discard unsaved changes?');
    }

    async function openFile(filePath = pathInput.value) {
      let target;
      try {
        target = safePath(filePath);
      } catch (error) {
        setStatus(error.message);
        return;
      }

      if (!confirmDiscard()) return;

      const thisRequest = ++requestNumber;
      loading = true;
      setStatus('Opening file…');

      const params = new URLSearchParams({
        uid, location: locationName, path: target
      });

      try {
        const response = await fetch(`/api/files/read?${params}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not open file.');
        if (disposed || thisRequest !== requestNumber) return;

        currentFile = target;
        pathInput.value = target;
        editor.value = data.content;
        savedContent = data.content;
        updateCounts();
        setStatus('File opened');
        editor.focus();
      } catch (error) {
        if (thisRequest === requestNumber) setStatus(error.message);
      } finally {
        if (thisRequest === requestNumber) loading = false;
      }
    }

    async function saveFile() {
      if (loading) return;
      let target = currentFile;

      if (!target) {
        target = window.prompt('Save as a relative file path:', pathInput.value || 'untitled.txt');
        if (target === null) return;
      }

      try {
        target = safePath(target);
      } catch (error) {
        setStatus(error.message);
        return;
      }

      // Save As creates a new file. Existing files are saved through Save.
      if (!currentFile || target !== currentFile) {
        const overwrite = false;
        if (overwrite) return;
        try {
          const response = await fetch('/api/files/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              uid, location: locationName,
              path: target.includes('/') ? target.slice(0, target.lastIndexOf('/')) : '',
              operation: 'create-file',
              name: target.split('/').pop(),
              content: editor.value
            })
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Could not create file.');
          currentFile = target;
          pathInput.value = target;
          savedContent = editor.value;
          updateCounts();
          setStatus('File created and saved');
          return;
        } catch (error) {
          setStatus(error.message);
          return;
        }
      }

      setStatus('Saving…');

      try {
        const response = await fetch('/api/files/save', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid, location: locationName, path: target, content: editor.value
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not save file.');
        savedContent = editor.value;
        updateCounts();
        setStatus('Saved successfully');
      } catch (error) {
        setStatus(error.message);
      }
    }

    toolButton('Open', () => openFile());
    // open files sent from the File Manager
    const onOpen = (e) => {
      if (disposed) { window.removeEventListener('yuva:open-file', onOpen); return; }
      const d = e.detail || {};
      if (d.location) locationName = d.location;
      if (d.path) openFile(d.path);
    };
    window.addEventListener('yuva:open-file', onOpen);
    if (window.__yuvaPendingOpen) {
      const d = window.__yuvaPendingOpen;
      window.__yuvaPendingOpen = null;
      onOpen({ detail: d });
    }
    toolButton('Save', saveFile, true);
    toolButton('Save As', () => {
      const proposed = window.prompt('Save as a relative file path:', currentFile || 'untitled.txt');
      if (proposed === null) return;
      if (!confirmDiscardForSaveAs()) return;
      saveAsNew(proposed);
    });

    function confirmDiscardForSaveAs() {
      // Save As preserves the current editor contents; it does not discard them.
      return true;
    }

    async function saveAsNew(proposed) {
      let target;
      try {
        target = safePath(proposed);
      } catch (error) {
        setStatus(error.message);
        return;
      }

      try {
        const response = await fetch('/api/files/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid, location: locationName,
            path: target.includes('/') ? target.slice(0, target.lastIndexOf('/')) : '',
            operation: 'create-file',
            name: target.split('/').pop(),
            content: editor.value
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not create file.');
        currentFile = target;
        pathInput.value = target;
        savedContent = editor.value;
        updateCounts();
        setStatus('Saved as a new file');
      } catch (error) {
        setStatus(error.message);
      }
    }

    toolButton('New', () => {
      if (!confirmDiscard()) return;
      currentFile = '';
      pathInput.value = '';
      editor.value = '';
      savedContent = '';
      updateCounts();
      setStatus('New document');
      editor.focus();
    });

    const openButton = toolButton('↵', () => openFile());
    openButton.title = 'Open the path entered below';

    toolbar.appendChild(locationSelect);
    toolbar.appendChild(pathInput);

    locationSelect.style.cssText =
      'background:#1c252c;color:#b6beca;border:0;border-radius:5px;padding:7px';

    pathInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') openFile();
    });

    editor.addEventListener('input', updateCounts);

    editor.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveFile();
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        editor.setRangeText('  ', start, end, 'end');
        updateCounts();
      }
    });

    locationSelect.addEventListener('change', () => {
      if (!confirmDiscard()) {
        locationSelect.value = locationName;
        return;
      }
      locationName = locationSelect.value;
      currentFile = '';
      pathInput.value = '';
      editor.value = '';
      savedContent = '';
      updateCounts();
      setStatus(`Location: ${locationName}`);
    });

    window.addEventListener('beforeunload', beforeUnload);

    function beforeUnload(event) {
      if (isDirty()) {
        event.preventDefault();
        event.returnValue = '';
      }
    }

    updateCounts();
    this._cleanup = () => {
      disposed = true;
      requestNumber++;
      window.removeEventListener('beforeunload', beforeUnload);
    };
  },

  unmount() {
    this._cleanup?.();
  }
});
