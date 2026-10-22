const path = require('path');
const express = require('express');

const UID_RE = /^(?:[a-f0-9-]{8,36}|local-desktop)$/;

const PYTHON_LIST = String.raw`
import os, sys, json
root = os.path.realpath(sys.argv[1])
relative = sys.argv[2]
target = os.path.realpath(os.path.join(root, relative))
if target != root and not target.startswith(root + os.sep):
    raise ValueError("Path is outside the permitted directory")
if not os.path.isdir(target):
    raise ValueError("Not a directory")
items = []
with os.scandir(target) as entries:
    for entry in entries:
        try:
            info = entry.stat(follow_symlinks=False)
            items.append({
                "name": entry.name,
                "type": "folder" if entry.is_dir(follow_symlinks=False)
                        else "file" if entry.is_file(follow_symlinks=False)
                        else "other",
                "size": info.st_size,
                "modified": int(info.st_mtime),
            })
        except OSError:
            continue
items.sort(key=lambda x: (x["type"] != "folder", x["name"].lower()))
print(json.dumps({"items": items}))
`;

const PYTHON_ACTION = String.raw`
import os, sys, json, base64, shutil

root = os.path.realpath(sys.argv[1])
operation, relative, name, encoded = sys.argv[2:6]

def inside(p):
    return p == root or p.startswith(root + os.sep)

if os.path.isabs(relative) or any(x == '..' for x in relative.split('/')):
    raise ValueError("Invalid path")

parent = os.path.realpath(os.path.join(root, relative))
if not inside(parent) or not os.path.isdir(parent):
    raise ValueError("Invalid parent directory")

if operation == "mkdir":
    if not name or name in ('.', '..') or '/' in name or '\\' in name or '\0' in name:
        raise ValueError("Enter a valid folder name")
    target = os.path.join(parent, name)
    if os.path.lexists(target): raise ValueError("An item with that name already exists")
    os.mkdir(target)

elif operation == "create-file":
    if not name or name in ('.', '..') or '/' in name or '\\' in name or '\0' in name:
        raise ValueError("Enter a valid file name")
    target = os.path.join(parent, name)
    if os.path.lexists(target): raise ValueError("An item with that name already exists")
    data = base64.b64decode(encoded, validate=True)
    if not data and name.lower().endswith('.ipynb'):
        data = json.dumps({
            "cells": [],
            "metadata": {},
            "nbformat": 4,
            "nbformat_minor": 5
        }, indent=2).encode("utf-8") + b"\n"
    if len(data) > 48000: raise ValueError("New file is too large")
    with open(target, 'xb') as f: f.write(data)

elif operation in ("rename", "delete"):
    if not name or '/' in name or '\\' in name or name in ('.', '..'):
        raise ValueError("Invalid item name")
    target = os.path.join(parent, name)
    if target == root or not inside(target):
        raise ValueError("Cannot modify this path")
    if not os.path.lexists(target): raise ValueError("Item not found")
    if os.path.islink(target): raise ValueError("Symbolic links cannot be changed here")
    if operation == "rename":
        new_name = encoded
        if not new_name or '/' in new_name or '\\' in new_name or new_name in ('.', '..') or '\0' in new_name:
            raise ValueError("Enter a valid new name")
        dest = os.path.join(parent, new_name)
        if os.path.lexists(dest): raise ValueError("An item with that name already exists")
        os.rename(target, dest)
    else:
        if os.path.isdir(target): shutil.rmtree(target)
        else: os.remove(target)
else:
    raise ValueError("Unknown operation")

print(json.dumps({"ok": True}))
`;

function dockerExec(container, cmd) {
  return new Promise(async (resolve, reject) => {
    try {
      const exec = await container.exec({
        Cmd: cmd,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        User: 'ubuntu',
        WorkingDir: '/home/ubuntu',
      });
      const stream = await exec.start({ hijack: true, stdin: false, Tty: true });
      let output = '';
      const timeout = setTimeout(() => {
        stream.destroy();
        reject(new Error('File operation timed out.'));
      }, 10000);
      stream.on('data', chunk => {
        output += chunk.toString('utf8');
        if (output.length > 2000000) stream.destroy();
      });
      stream.on('error', err => {
        clearTimeout(timeout);
        reject(err);
      });
      stream.on('end', async () => {
        clearTimeout(timeout);
        try {
          const info = await exec.inspect();
          if (info.ExitCode !== 0) {
            const m = output.match(/(?:\w*Error): [^\n]*$/m);
            return reject(new Error(m ? m[0].replace(/\r/g, '').trim() : 'File operation failed.'));
          }
          resolve(JSON.parse(output.trim()));
        } catch {
          reject(new Error('Invalid response from the file container.'));
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

function registerFileRoutes(app, getContainer) {
  app.get('/api/files', async (req, res) => {
    const uid = req.session?.user?.id;
    if (!uid) return res.status(401).json({ error: 'Sign in required.' });
    const location = String(req.query.location || 'home');
    const relative = String(req.query.path || '');
    if (!UID_RE.test(uid)) return res.status(400).json({ error: 'Invalid user session.' });

    const roots = { home: '/home/ubuntu', workspace: '/workspace' };
    if (!Object.hasOwn(roots, location)) return res.status(400).json({ error: 'Unknown file location.' });
    if (path.isAbsolute(relative) || relative.includes('\0') || relative.split('/').includes('..')) {
      return res.status(400).json({ error: 'Invalid relative path.' });
    }

    try {
      const container = await getContainer(uid);
      const result = await dockerExec(container, [
        'python3', '-c', PYTHON_LIST, roots[location], relative
      ]);
      res.json({ location, path: relative, items: result.items });
    } catch (err) {
      console.error('file listing failed:', {
        userId: uid,
        location,
        relativePath: relative,
        root: roots[location],
        message: err.message,
      });
      res.status(400).json({ error: err.message || 'Unable to list directory.' });
    }
  });

  app.post('/api/files/action', express.json({ limit: '100kb' }), async (req, res) => {
    const { location, path: relative = '', operation, name, newName = '', content = '' } = req.body || {};
    const uid = req.session?.user?.id;
    if (!uid) return res.status(401).json({ error: 'Sign in required.' });
    const roots = { home: '/home/ubuntu', workspace: '/workspace' };
    if (!Object.hasOwn(roots, location)) return res.status(400).json({ error: 'Unknown file location.' });
    if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.includes('\0') || relative.split('/').includes('..')) {
      return res.status(400).json({ error: 'Invalid relative path.' });
    }
    if (typeof name !== 'string' || name.length > 255 ||
        typeof newName !== 'string' || newName.length > 255 ||
        typeof content !== 'string') {
      return res.status(400).json({ error: 'Invalid file operation details.' });
    }
    if (!['mkdir', 'create-file', 'rename', 'delete'].includes(operation)) {
      return res.status(400).json({ error: 'Unsupported file operation.' });
    }
    if (operation === 'create-file' && Buffer.byteLength(content, 'utf8') > 48000) {
      return res.status(413).json({ error: 'New file is limited to 48 KB.' });
    }

    try {
      const container = await getContainer(uid);
      const encoded = operation === 'create-file'
        ? Buffer.from(content, 'utf8').toString('base64')
        : operation === 'rename' ? newName : '';
      const result = await dockerExec(container, [
        'python3', '-c', PYTHON_ACTION,
        roots[location], operation, relative, name, encoded
      ]);
      res.json(result);
    } catch (err) {
      console.error('file action failed:', err.message);
      res.status(400).json({ error: err.message || 'File operation failed.' });
    }
  });

app.get('/api/files/read', async (req, res) => {
  const uid = req.session?.user?.id;
  if (!uid) return res.status(401).json({ error: 'Sign in required.' });
  const location = String(req.query.location || '');
  const relative = String(req.query.path || '');

  if (!UID_RE.test(uid)) {
    return res.status(400).json({ error: 'Invalid user session.' });
  }

  const roots = { home: '/home/ubuntu', workspace: '/workspace' };
  if (!Object.hasOwn(roots, location)) {
    return res.status(400).json({ error: 'Unknown file location.' });
  }

  if (!relative || path.isAbsolute(relative) ||
      relative.includes('\0') || relative.split('/').some(p => p === '.' || p === '..')) {
    return res.status(400).json({ error: 'Invalid relative file path.' });
  }

  try {
    const container = await getContainer(uid);
    const result = await dockerExec(container, [
      'python3', '-c', PYTHON_EDITOR, roots[location], 'read', relative
    ]);

    res.json({ content: Buffer.from(result.content, 'base64').toString('utf8') });
  } catch (err) {
    console.error('file read failed:', err.message);
    res.status(400).json({ error: err.message || 'Unable to read file.' });
  }
});

app.put('/api/files/save', express.json({ limit: '400kb' }), async (req, res) => {
  const { location, path: relative, content } = req.body || {};

  const uid = req.session?.user?.id;
  if (!uid) return res.status(401).json({ error: 'Sign in required.' });

  const roots = { home: '/home/ubuntu', workspace: '/workspace' };
  if (!Object.hasOwn(roots, location)) {
    return res.status(400).json({ error: 'Unknown file location.' });
  }

  if (typeof relative !== 'string' || !relative ||
      path.isAbsolute(relative) || relative.includes('\0') ||
      relative.split('/').some(p => p === '.' || p === '..')) {
    return res.status(400).json({ error: 'Invalid relative file path.' });
  }

  if (typeof content !== 'string' ||
      Buffer.byteLength(content, 'utf8') > 262144) {
    return res.status(413).json({ error: 'Editor supports files up to 256 KB.' });
  }

  try {
    const container = await getContainer(uid);
    const encoded = Buffer.from(content, 'utf8').toString('base64');

    const result = await dockerExec(container, [
      'python3', '-c', PYTHON_EDITOR, roots[location], 'save', relative, encoded
    ]);

    res.json(result);
  } catch (err) {
    console.error('file save failed:', err.message);
    res.status(400).json({ error: err.message || 'Unable to save file.' });
  }
});
}


const PYTHON_EDITOR = String.raw`
import os, sys, json, base64, tempfile, stat

root = os.path.realpath(sys.argv[1])
operation = sys.argv[2]
relative = sys.argv[3]

if not relative or os.path.isabs(relative) or '\0' in relative:
    raise ValueError("Invalid file path")
if any(part in ('.', '..') for part in relative.split('/')):
    raise ValueError("Invalid file path")

target = os.path.join(root, relative)
parent = os.path.realpath(os.path.dirname(target))

if parent != root and not parent.startswith(root + os.sep):
    raise ValueError("Path is outside the permitted directory")
if not os.path.isdir(parent):
    raise ValueError("Parent directory not found")
if os.path.islink(target):
    raise ValueError("Symbolic links cannot be edited")
if not os.path.isfile(target):
    raise ValueError("File not found or is not a regular file")

if operation == "read":
    if os.path.getsize(target) > 262144:
        raise ValueError("Editor supports files up to 256 KB")
    with open(target, "rb") as f:
        data = f.read(262145)
    if len(data) > 262144:
        raise ValueError("Editor supports files up to 256 KB")
    print(json.dumps({"content": base64.b64encode(data).decode("ascii")}))

elif operation == "save":
    encoded = sys.argv[4]
    data = base64.b64decode(encoded, validate=True)
    if len(data) > 262144:
        raise ValueError("Editor supports files up to 256 KB")

    # Check the target again before writing.
    if os.path.islink(target) or not os.path.isfile(target):
        raise ValueError("File changed or is no longer a regular file")

    fd, temp_path = tempfile.mkstemp(prefix=".yuva-editor-", dir=parent)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        os.chmod(temp_path, stat.S_IMODE(os.stat(target).st_mode))
        os.replace(temp_path, target)
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

    print(json.dumps({"ok": True}))
else:
    raise ValueError("Unknown editor operation")
`;



module.exports = { registerFileRoutes };
