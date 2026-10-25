const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');

const { pool, requireAuth, requireAdmin } = require('./auth');

const STORAGE_DIR = process.env.YUVA_SHARED_FILES_DIR || '/app/shared-files';
const MAX_FILE_SIZE = 50 * 1024 * 1024;

function safeFilename(name) {
  if (typeof name !== 'string' || !name.trim()) {
    return null;
  }

  const filename = path.basename(name.trim());

  if (
    filename === '.' ||
    filename === '..' ||
    filename.length > 255 ||
    /[\0/\\]/.test(filename)
  ) {
    return null;
  }

  return filename;
}

function safeFilePath(id) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) {
    return null;
  }

  return path.join(STORAGE_DIR, id);
}

async function initializeSharedFiles() {
  await fs.promises.mkdir(STORAGE_DIR, {
    recursive: true,
    mode: 0o700,
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS yuva_shared_files (
      id UUID PRIMARY KEY,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      size_bytes BIGINT NOT NULL,
      uploaded_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Group folder metadata. Existing files remain private by default.
  await pool.query(`
    ALTER TABLE yuva_shared_files
      ADD COLUMN IF NOT EXISTS is_group_shared BOOLEAN NOT NULL DEFAULT FALSE
  `);

  await pool.query(`
    ALTER TABLE yuva_shared_files
      ADD COLUMN IF NOT EXISTS folder_path TEXT NOT NULL DEFAULT ''
  `);

  await pool.query(`
    ALTER TABLE yuva_shared_files
      ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'file'
  `);

  await pool.query(`
    ALTER TABLE yuva_shared_files
      ADD COLUMN IF NOT EXISTS group_name TEXT
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS yuva_shared_file_access (
      file_id UUID NOT NULL
        REFERENCES yuva_shared_files(id)
        ON DELETE CASCADE,
      student_id UUID NOT NULL,
      shared_by UUID,
      shared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (file_id, student_id)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS yuva_shared_file_access_student_idx
    ON yuva_shared_file_access(student_id)
  `);

  console.log('[Shared Files] Database tables initialized');
}

function registerGroupFolderRoutes(app) {
  function cleanFolder(value) {
    if (typeof value !== 'string') return null;

    const folder = value.trim().replace(/\/+/g, '/').replace(/^\/|\/$/g, '');

    if (!folder) return '';

    const parts = folder.split('/');

    if (parts.some(part =>
      !part ||
      part === '.' ||
      part === '..' ||
      part.length > 255 ||
      /[\0\\]/.test(part)
    )) {
      return null;
    }

    return parts.join('/');
  }

  function groupItemPath(folder, name) {
    const safeFolder = cleanFolder(folder);
    const safeName = safeFilename(name);

    if (safeFolder === null || !safeName) return null;

    return safeFolder ? `${safeFolder}/${safeName}` : safeName;
  }

  function groupFilePath(id) {
    return safeFilePath(id);
  }

  async function listGroup(group, folder) {
    const result = await pool.query(
      `
      SELECT
        id,
        original_name,
        mime_type,
        size_bytes,
        created_at,
        folder_path,
        item_type
      FROM yuva_shared_files
      WHERE is_group_shared = TRUE
        AND group_name = $1
        AND folder_path = $2
        AND item_type = 'file'
      ORDER BY original_name
      `,
      [group, folder]
    );

    const folders = await pool.query(
      `
      SELECT
        id,
        original_name,
        folder_path,
        item_type,
        created_at
      FROM yuva_shared_files
      WHERE is_group_shared = TRUE
        AND group_name = $1
        AND item_type = 'folder'
        AND folder_path = $2
      ORDER BY original_name
      `,
      [group, folder]
    );

    return {
      group,
      path: folder,
      items: [
        ...folders.rows.map(item => ({
          id: item.id,
          name: item.original_name,
          type: 'folder',
          size: 0,
          modified: item.created_at,
        })),
        ...result.rows.map(item => ({
          id: item.id,
          name: item.original_name,
          type: 'file',
          mimeType: item.mime_type,
          size: Number(item.size_bytes),
          modified: item.created_at,
        })),
      ],
    };
  }

  // Resolve a directory and verify that it belongs to the requested group.
  async function validGroupFolder(group, folder) {
    const safeFolder = cleanFolder(folder);

    if (safeFolder === null) return false;

    if (!safeFolder) return true;

    const result = await pool.query(
      `
      SELECT 1
      FROM yuva_shared_files
      WHERE is_group_shared = TRUE
        AND group_name = $1
        AND item_type = 'folder'
        AND original_name = $2
        AND folder_path = $3
      LIMIT 1
      `,
      [
        group,
        safeFolder.split('/').pop(),
        safeFolder.split('/').slice(0, -1).join('/'),
      ]
    );

    return result.rowCount > 0;
  }

  // Current role and the folder available to that role.
  app.get('/api/group-folders/me', requireAuth, async (req, res) => {
    const isAdmin = req.session.user.role === 'admin';

    return res.json({
      role: isAdmin ? 'admin' : 'student',
      locations: isAdmin ? ['students'] : ['admin'],
    });
  });

  // Admin: list the Students shared directory.
  app.get(
    '/api/group-folders/students',
    requireAuth,
    requireAdmin,
    async (req, res) => {
      const folder = cleanFolder(req.query.path || '');

      if (folder === null) {
        return res.status(400).json({ error: 'Invalid folder path' });
      }

      try {
        return res.json(await listGroup('students', folder));
      } catch (error) {
        console.error('[Group Folders] Students listing:', error.message);
        return res.status(500).json({ error: 'Could not load folder' });
      }
    }
  );

  // Admin: create a folder.
  app.post(
    '/api/group-folders/students/folder',
    requireAuth,
    requireAdmin,
    async (req, res) => {
      const { name, path: parentPath = '' } = req.body || {};
      const safeName = safeFilename(name);
      const folderPath = groupItemPath(parentPath, name);

      if (!safeName || folderPath === null) {
        return res.status(400).json({ error: 'Invalid folder name or path' });
      }

      try {
        const parent = cleanFolder(parentPath);

        if (parent === null || !(await validGroupFolder('students', parent))) {
          return res.status(400).json({ error: 'Invalid parent folder' });
        }

        const duplicate = await pool.query(
          `
          SELECT 1
          FROM yuva_shared_files
          WHERE is_group_shared = TRUE
            AND group_name = 'students'
            AND folder_path = $1
            AND original_name = $2
          LIMIT 1
          `,
          [parent, safeName]
        );

        if (duplicate.rowCount) {
          return res.status(409).json({ error: 'An item with this name already exists' });
        }

        const id = crypto.randomUUID();

        await pool.query(
          `
          INSERT INTO yuva_shared_files
            (id, original_name, mime_type, size_bytes, uploaded_by,
             is_group_shared, folder_path, item_type, group_name)
          VALUES ($1, $2, 'application/x-directory', 0, $3, TRUE, $4, 'folder', 'students')
          `,
          [id, safeName, req.session.user.id, parent]
        );

        return res.status(201).json({
          id,
          name: safeName,
          type: 'folder',
        });
      } catch (error) {
        console.error('[Group Folders] Create folder:', error.message);
        return res.status(500).json({ error: 'Could not create folder' });
      }
    }
  );

  // Admin: upload into Students directory.
  app.post(
    '/api/group-folders/students/upload',
    requireAuth,
    requireAdmin,
    async (req, res) => {
      const filename = safeFilename(req.query.name);
      const folder = cleanFolder(req.query.path || '');

      if (!filename || folder === null) {
        return res.status(400).json({ error: 'Invalid filename or folder path' });
      }

      const mimeType =
        typeof req.headers['content-type'] === 'string'
          ? req.headers['content-type'].split(';')[0].trim()
          : 'application/octet-stream';

      const id = crypto.randomUUID();
      const destination = groupFilePath(id);
      const temporary = `${destination}.tmp`;

      let size = 0;

      try {
        if (!(await validGroupFolder('students', folder))) {
          return res.status(400).json({ error: 'Folder does not exist' });
        }

        const duplicate = await pool.query(
          `
          SELECT 1
          FROM yuva_shared_files
          WHERE is_group_shared = TRUE
            AND group_name = 'students'
            AND folder_path = $1
            AND original_name = $2
          LIMIT 1
          `,
          [folder, filename]
        );

        if (duplicate.rowCount) {
          return res.status(409).json({ error: 'An item with this name already exists' });
        }

        await fs.promises.mkdir(STORAGE_DIR, {
          recursive: true,
          mode: 0o700,
        });

        const output = fs.createWriteStream(temporary, {
          flags: 'wx',
          mode: 0o600,
        });

        req.on('data', chunk => {
          size += chunk.length;

          if (size > MAX_FILE_SIZE) {
            req.destroy(new Error('File exceeds 50 MB limit'));
          }
        });

        await pipeline(req, output);

        if (!size) {
          await fs.promises.unlink(temporary).catch(() => {});
          return res.status(400).json({ error: 'Empty files are not allowed' });
        }

        await fs.promises.rename(temporary, destination);

        await pool.query(
          `
          INSERT INTO yuva_shared_files
            (id, original_name, mime_type, size_bytes, uploaded_by,
             is_group_shared, folder_path, item_type, group_name)
          VALUES ($1, $2, $3, $4, $5, TRUE, $6, 'file', 'students')
          `,
          [
            id,
            filename,
            mimeType || 'application/octet-stream',
            size,
            req.session.user.id,
            folder,
          ]
        );

        return res.status(201).json({
          id,
          name: filename,
          type: 'file',
          size,
        });
      } catch (error) {
        await fs.promises.unlink(temporary).catch(() => {});
        await fs.promises.unlink(destination).catch(() => {});

        console.error('[Group Folders] Upload:', error.message);

        return res.status(size > MAX_FILE_SIZE ? 413 : 500).json({
          error: size > MAX_FILE_SIZE
            ? 'Maximum upload size is 50 MB'
            : 'Upload failed',
        });
      }
    }
  );

  // Admin: delete file or folder recursively.
  app.delete(
    '/api/group-folders/students/:id',
    requireAuth,
    requireAdmin,
    async (req, res) => {
      const id = req.params.id;

      if (!safeFilePath(id)) {
        return res.status(400).json({ error: 'Invalid item ID' });
      }

      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const found = await client.query(
          `
          SELECT id, original_name, folder_path, item_type
          FROM yuva_shared_files
          WHERE id = $1 AND is_group_shared = TRUE AND group_name = 'students'
          FOR UPDATE
          `,
          [id]
        );

        if (!found.rowCount) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Item not found' });
        }

        const item = found.rows[0];

        if (item.item_type === 'folder') {
          const fullPath = groupItemPath(item.folder_path, item.original_name);

          // Get physical file IDs before removing database records.
          const descendants = await client.query(
            `
            SELECT id
            FROM yuva_shared_files
            WHERE is_group_shared = TRUE
              AND group_name = 'students'
              AND item_type = 'file'
              AND (
                folder_path = $1
                OR folder_path LIKE $2
              )
            `,
            [fullPath, `${fullPath}/%`]
          );

          await client.query(
            `
            DELETE FROM yuva_shared_files
            WHERE is_group_shared = TRUE
              AND group_name = 'students'
              AND (
                id = $1
                OR folder_path = $2
                OR folder_path LIKE $3
              )
            `,
            [id, fullPath, `${fullPath}/%`]
          );

          for (const child of descendants.rows) {
            const childPath = groupFilePath(child.id);
            if (childPath) await fs.promises.unlink(childPath).catch(() => {});
          }
        } else {
          await client.query(
            "DELETE FROM yuva_shared_files WHERE id = $1 AND is_group_shared = TRUE AND group_name = 'students'",
            [id]
          );

          const filePath = groupFilePath(id);
          if (filePath) await fs.promises.unlink(filePath).catch(() => {});
        }

        await client.query('COMMIT');

        return res.json({ message: 'Item deleted' });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[Group Folders] Delete:', error.message);
        return res.status(500).json({ error: 'Could not delete item' });
      } finally {
        client.release();
      }
    }
  );


  // Admin: create a folder in the Admin shared directory.
  app.post(
    '/api/group-folders/admin/folder',
    requireAuth,
    requireAdmin,
    async (req, res) => {
      const { name, path: parentPath = '' } = req.body || {};
      const safeName = safeFilename(name);
      const folderPath = groupItemPath(parentPath, name);

      if (!safeName || folderPath === null) {
        return res.status(400).json({ error: 'Invalid folder name or path' });
      }

      try {
        const parent = cleanFolder(parentPath);

        if (parent === null || !(await validGroupFolder('admin', parent))) {
          return res.status(400).json({ error: 'Invalid parent folder' });
        }

        const duplicate = await pool.query(
          `
          SELECT 1
          FROM yuva_shared_files
          WHERE is_group_shared = TRUE
            AND group_name = 'admin'
            AND folder_path = $1
            AND original_name = $2
          LIMIT 1
          `,
          [parent, safeName]
        );

        if (duplicate.rowCount) {
          return res.status(409).json({
            error: 'An item with this name already exists'
          });
        }

        const id = crypto.randomUUID();

        await pool.query(
          `
          INSERT INTO yuva_shared_files
            (id, original_name, mime_type, size_bytes, uploaded_by,
             is_group_shared, folder_path, item_type, group_name)
          VALUES ($1, $2, 'application/x-directory', 0, $3,
                  TRUE, $4, 'folder', 'admin')
          `,
          [id, safeName, req.session.user.id, parent]
        );

        return res.status(201).json({
          id,
          name: safeName,
          type: 'folder'
        });
      } catch (error) {
        console.error('[Group Folders] Admin create folder:', error.message);
        return res.status(500).json({ error: 'Could not create folder' });
      }
    }
  );

  // Admin: upload a file into the Admin shared directory.
  app.post(
    '/api/group-folders/admin/upload',
    requireAuth,
    requireAdmin,
    async (req, res) => {
      const filename = safeFilename(req.query.name);
      const folder = cleanFolder(req.query.path || '');

      if (!filename || folder === null) {
        return res.status(400).json({
          error: 'Invalid filename or folder path'
        });
      }

      const mimeType =
        typeof req.headers['content-type'] === 'string'
          ? req.headers['content-type'].split(';')[0].trim()
          : 'application/octet-stream';

      const id = crypto.randomUUID();
      const destination = groupFilePath(id);
      const temporary = `${destination}.tmp`;

      let size = 0;

      try {
        if (!(await validGroupFolder('admin', folder))) {
          return res.status(400).json({ error: 'Folder does not exist' });
        }

        const duplicate = await pool.query(
          `
          SELECT 1
          FROM yuva_shared_files
          WHERE is_group_shared = TRUE
            AND group_name = 'admin'
            AND folder_path = $1
            AND original_name = $2
          LIMIT 1
          `,
          [folder, filename]
        );

        if (duplicate.rowCount) {
          return res.status(409).json({
            error: 'An item with this name already exists'
          });
        }

        await fs.promises.mkdir(STORAGE_DIR, {
          recursive: true,
          mode: 0o700
        });

        const output = fs.createWriteStream(temporary, {
          flags: 'wx',
          mode: 0o600
        });

        req.on('data', chunk => {
          size += chunk.length;

          if (size > MAX_FILE_SIZE) {
            req.destroy(new Error('File exceeds 50 MB limit'));
          }
        });

        await pipeline(req, output);

        if (!size) {
          await fs.promises.unlink(temporary).catch(() => {});
          return res.status(400).json({
            error: 'Empty files are not allowed'
          });
        }

        await fs.promises.rename(temporary, destination);

        await pool.query(
          `
          INSERT INTO yuva_shared_files
            (id, original_name, mime_type, size_bytes, uploaded_by,
             is_group_shared, folder_path, item_type, group_name)
          VALUES ($1, $2, $3, $4, $5, TRUE, $6, 'file', 'admin')
          `,
          [
            id,
            filename,
            mimeType || 'application/octet-stream',
            size,
            req.session.user.id,
            folder
          ]
        );

        return res.status(201).json({
          id,
          name: filename,
          type: 'file',
          size
        });
      } catch (error) {
        await fs.promises.unlink(temporary).catch(() => {});
        await fs.promises.unlink(destination).catch(() => {});

        console.error('[Group Folders] Admin upload:', error.message);

        return res.status(size > MAX_FILE_SIZE ? 413 : 500).json({
          error: size > MAX_FILE_SIZE
            ? 'Maximum upload size is 50 MB'
            : 'Upload failed'
        });
      }
    }
  );

  // Student: browse the Admin shared directory, read-only.
  app.get(
    '/api/group-folders/admin',
    requireAuth,
    async (req, res) => {
      if (!['student', 'admin'].includes(req.session.user.role)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const folder = cleanFolder(req.query.path || '');

      if (folder === null) {
        return res.status(400).json({ error: 'Invalid folder path' });
      }

      try {
        return res.json(await listGroup('admin', folder));
      } catch (error) {
        console.error('[Group Folders] Admin listing:', error.message);
        return res.status(500).json({ error: 'Could not load folder' });
      }
    }
  );


  // Admin: download only files from the Students shared directory.
  app.get(
    '/api/group-folders/students/:id/download',
    requireAuth,
    requireAdmin,
    async (req, res) => {
      const id = req.params.id;
      const filePath = groupFilePath(id);

      if (!filePath) {
        return res.status(400).json({ error: 'Invalid file ID' });
      }

      try {
        const result = await pool.query(
          `
          SELECT original_name, mime_type
          FROM yuva_shared_files
          WHERE id = $1
            AND is_group_shared = TRUE
            AND group_name = 'students'
            AND item_type = 'file'
          `,
          [id]
        );

        if (!result.rowCount) {
          return res.status(404).json({ error: 'File not found' });
        }

        const file = result.rows[0];

        try {
          await fs.promises.access(filePath, fs.constants.R_OK);
        } catch {
          return res.status(404).json({ error: 'File content not found' });
        }

        res.setHeader(
          'Content-Type',
          file.mime_type || 'application/octet-stream'
        );
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${encodeURIComponent(file.original_name)}"`
        );

        return res.sendFile(filePath, error => {
          if (error && !res.headersSent) {
            res.status(500).json({ error: 'Download failed' });
          }
        });
      } catch (error) {
        console.error('[Group Folders] Students download:', error.message);
        return res.status(500).json({ error: 'Could not download file' });
      }
    }
  );

  // Student: download only group-shared files.
  app.get(
    '/api/group-folders/admin/:id/download',
    requireAuth,
    async (req, res) => {
      if (!['student', 'admin'].includes(req.session.user.role)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const id = req.params.id;
      const filePath = groupFilePath(id);

      if (!filePath) {
        return res.status(400).json({ error: 'Invalid file ID' });
      }

      try {
        const result = await pool.query(
          `
          SELECT original_name, mime_type
          FROM yuva_shared_files
          WHERE id = $1
            AND is_group_shared = TRUE
            AND group_name = 'admin'
            AND item_type = 'file'
          `,
          [id]
        );

        if (!result.rowCount) {
          return res.status(404).json({ error: 'File not found' });
        }

        const file = result.rows[0];

        res.setHeader(
          'Content-Type',
          file.mime_type || 'application/octet-stream'
        );

        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${encodeURIComponent(file.original_name)}"`
        );

        return res.sendFile(filePath, error => {
          if (error && !res.headersSent) {
            res.status(500).json({ error: 'Download failed' });
          }
        });
      } catch (error) {
        console.error('[Group Folders] Download:', error.message);
        return res.status(500).json({ error: 'Could not download file' });
      }
    }
  );
}

function registerSharedFileRoutes(app) {
  // Admin: upload a file.
  app.post(
    '/api/shared-files/upload',
    requireAuth,
    requireAdmin,
    async (req, res) => {
      const filename = safeFilename(req.query.name);

      if (!filename) {
        return res.status(400).json({
          error: 'A valid filename is required in ?name=',
        });
      }

      const mimeType =
        typeof req.headers['content-type'] === 'string'
          ? req.headers['content-type'].split(';')[0].trim()
          : 'application/octet-stream';

      const id = crypto.randomUUID();
      const destination = safeFilePath(id);
      const temporary = `${destination}.tmp`;

      let size = 0;

      try {
        await fs.promises.mkdir(STORAGE_DIR, {
          recursive: true,
          mode: 0o700,
        });

        const output = fs.createWriteStream(temporary, {
          flags: 'wx',
          mode: 0o600,
        });

        req.on('data', chunk => {
          size += chunk.length;

          if (size > MAX_FILE_SIZE) {
            req.destroy(new Error('File exceeds 50 MB limit'));
          }
        });

        await pipeline(req, output);

        if (size === 0) {
          await fs.promises.unlink(temporary).catch(() => {});

          return res.status(400).json({
            error: 'Empty files are not allowed',
          });
        }

        await fs.promises.rename(temporary, destination);

        await pool.query(
          `
          INSERT INTO yuva_shared_files
            (id, original_name, mime_type, size_bytes, uploaded_by)
          VALUES ($1, $2, $3, $4, $5)
          `,
          [
            id,
            filename,
            mimeType || 'application/octet-stream',
            size,
            req.session.user.id,
          ]
        );

        return res.status(201).json({
          message: 'File uploaded',
          file: {
            id,
            name: filename,
            mimeType,
            size,
          },
        });
      } catch (error) {
        await fs.promises.unlink(temporary).catch(() => {});
        await fs.promises.unlink(destination).catch(() => {});

        console.error('[Shared Files] Upload failed:', error.message);

        if (size > MAX_FILE_SIZE) {
          return res.status(413).json({
            error: 'Maximum upload size is 50 MB',
          });
        }

        return res.status(500).json({
          error: 'File upload failed',
        });
      }
    }
  );

  // Admin: list students for the sharing interface.
  app.get(
    '/api/shared-files/students',
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const result = await pool.query(`
          SELECT id, username, role
          FROM yuva_users
          WHERE role = 'student'
          ORDER BY username
        `);

        return res.json({
          students: result.rows,
        });
      } catch (error) {
        console.error('[Shared Files] Student lookup failed:', error.message);

        return res.status(500).json({
          error: 'Could not load students',
        });
      }
    }
  );

  // Admin: list uploaded files and their sharing permissions.
  app.get(
    '/api/shared-files/admin',
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const result = await pool.query(`
          SELECT
            f.id,
            f.original_name,
            f.mime_type,
            f.size_bytes,
            f.created_at,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', u.id,
                  'username', u.username
                )
              ) FILTER (WHERE u.id IS NOT NULL),
              '[]'::json
            ) AS shared_with
          FROM yuva_shared_files f
          LEFT JOIN yuva_shared_file_access a
            ON a.file_id = f.id
          LEFT JOIN yuva_users u
            ON u.id = a.student_id
          GROUP BY f.id
          ORDER BY f.created_at DESC
        `);

        return res.json({
          files: result.rows,
        });
      } catch (error) {
        console.error('[Shared Files] Admin listing failed:', error.message);

        return res.status(500).json({
          error: 'Could not load shared files',
        });
      }
    }
  );

  // Admin: share a file with a student.
  app.post(
    '/api/shared-files/:fileId/share',
    requireAuth,
    requireAdmin,
    async (req, res) => {
      const { fileId } = req.params;
      const { studentId } = req.body || {};

      if (!safeFilePath(fileId) || !studentId) {
        return res.status(400).json({
          error: 'Valid fileId and studentId are required',
        });
      }

      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const file = await client.query(
          'SELECT id FROM yuva_shared_files WHERE id = $1',
          [fileId]
        );

        if (!file.rowCount) {
          await client.query('ROLLBACK');

          return res.status(404).json({
            error: 'File not found',
          });
        }

        const student = await client.query(
          `
          SELECT id
          FROM yuva_users
          WHERE id = $1 AND role = 'student'
          `,
          [studentId]
        );

        if (!student.rowCount) {
          await client.query('ROLLBACK');

          return res.status(404).json({
            error: 'Student not found',
          });
        }

        await client.query(
          `
          INSERT INTO yuva_shared_file_access
            (file_id, student_id, shared_by)
          VALUES ($1, $2, $3)
          ON CONFLICT (file_id, student_id) DO NOTHING
          `,
          [fileId, studentId, req.session.user.id]
        );

        await client.query('COMMIT');

        return res.json({
          message: 'File shared with student',
        });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});

        console.error('[Shared Files] Share failed:', error.message);

        return res.status(500).json({
          error: 'Could not share file',
        });
      } finally {
        client.release();
      }
    }
  );

  // Admin: revoke a student's access.
  app.delete(
    '/api/shared-files/:fileId/share/:studentId',
    requireAuth,
    requireAdmin,
    async (req, res) => {
      const { fileId, studentId } = req.params;

      if (!safeFilePath(fileId)) {
        return res.status(400).json({
          error: 'Invalid file ID',
        });
      }

      try {
        const result = await pool.query(
          `
          DELETE FROM yuva_shared_file_access
          WHERE file_id = $1 AND student_id = $2
          `,
          [fileId, studentId]
        );

        return res.json({
          message: result.rowCount
            ? 'Student access revoked'
            : 'Student did not have access',
        });
      } catch (error) {
        console.error('[Shared Files] Revoke failed:', error.message);

        return res.status(500).json({
          error: 'Could not revoke access',
        });
      }
    }
  );

  // Student: list files shared with their account.
  app.get(
    '/api/shared-files',
    requireAuth,
    async (req, res) => {
      try {
        const result = await pool.query(
          `
          SELECT
            f.id,
            f.original_name,
            f.mime_type,
            f.size_bytes,
            f.created_at,
            a.shared_at
          FROM yuva_shared_file_access a
          JOIN yuva_shared_files f
            ON f.id = a.file_id
          WHERE a.student_id = $1
          ORDER BY a.shared_at DESC
          `,
          [req.session.user.id]
        );

        return res.json({
          files: result.rows,
        });
      } catch (error) {
        console.error('[Shared Files] Student listing failed:', error.message);

        return res.status(500).json({
          error: 'Could not load your shared files',
        });
      }
    }
  );

  // Student: download only files explicitly shared with them.
  app.get(
    '/api/shared-files/:fileId/download',
    requireAuth,
    async (req, res) => {
      const { fileId } = req.params;
      const filePath = safeFilePath(fileId);

      if (!filePath) {
        return res.status(400).json({
          error: 'Invalid file ID',
        });
      }

      try {
        const result = await pool.query(
          `
          SELECT f.original_name, f.mime_type
          FROM yuva_shared_files f
          JOIN yuva_shared_file_access a
            ON a.file_id = f.id
          WHERE f.id = $1 AND a.student_id = $2
          `,
          [fileId, req.session.user.id]
        );

        if (!result.rowCount) {
          return res.status(404).json({
            error: 'File not found or access denied',
          });
        }

        const file = result.rows[0];

        res.setHeader(
          'Content-Type',
          file.mime_type || 'application/octet-stream'
        );

        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${encodeURIComponent(file.original_name)}"`
        );

        return res.sendFile(filePath, error => {
          if (error && !res.headersSent) {
            console.error('[Shared Files] Download failed:', error.message);

            res.status(500).json({
              error: 'Download failed',
            });
          }
        });
      } catch (error) {
        console.error('[Shared Files] Download lookup failed:', error.message);

        return res.status(500).json({
          error: 'Could not download file',
        });
      }
    }
  );

  registerGroupFolderRoutes(app);

  console.log('[Shared Files] Routes registered');
}

module.exports = {
  initializeSharedFiles,
  registerSharedFileRoutes,
};
