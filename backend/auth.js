const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

const pool = new Pool({
  host: process.env.PGHOST || 'postgres',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'yuva',
  user: process.env.PGUSER || 'yuva',
  password: process.env.PGPASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const sessionStore = new PgSession({
  pool,
  tableName: 'yuva_sessions',
  createTableIfMissing: true,
});

async function initializeAuth() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS yuva_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username VARCHAR(32) UNIQUE NOT NULL,
      email VARCHAR(254) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE yuva_users
    ADD COLUMN IF NOT EXISTS role VARCHAR(16)
    NOT NULL DEFAULT 'student';
  `);

  await pool.query(`
    ALTER TABLE yuva_users
    ADD COLUMN IF NOT EXISTS full_name VARCHAR(100);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS yuva_users_created_at_idx
    ON yuva_users(created_at);
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS yuva_users_username_lower_idx
    ON yuva_users(LOWER(username));
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS yuva_users_email_lower_idx
    ON yuva_users(LOWER(email));
  `);

  await pool.query(`
    ALTER TABLE yuva_users
    DROP CONSTRAINT IF EXISTS yuva_users_role_check;
  `);

  await pool.query(`
    ALTER TABLE yuva_users
    ADD CONSTRAINT yuva_users_role_check
    CHECK (role IN ('student', 'admin'));
  `);

  console.log('Authentication database initialized.');
}

function createSessionMiddleware() {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      'SESSION_SECRET must be configured and at least 32 characters long.'
    );
  }

  return session({
    name: 'yuva.sid',
    secret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  });
}

function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({
      error: 'Authentication required.',
    });
  }

  next();
}

function requireAdmin(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({
      error: 'Authentication required.',
    });
  }

  if (req.session.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Administrator access required.',
    });
  }

  next();
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    full_name: user.full_name || '',
    role: user.role,
  };
}

function validateAccount({ username, email, password, fullName }) {
  if (!/^[a-z0-9_]{3,32}$/.test(username)) {
    return 'Username must be 3–32 characters and contain only letters, numbers, or underscores.';
  }

  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return 'Please enter a valid email address.';
  }

  if (!fullName || fullName.length < 2 || fullName.length > 100) {
    return 'Full name must be between 2 and 100 characters.';
  }

  if (
    password.length < 12 ||
    Buffer.byteLength(password, 'utf8') > 72
  ) {
    return 'Password must be at least 12 characters and at most 72 bytes.';
  }

  return null;
}

function registerAuthRoutes(app) {
  app.use(express.json({ limit: '20kb' }));

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many login attempts. Please try again later.',
    },
  });

  const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many registration attempts. Please try again later.',
    },
  });

  app.get('/api/auth/me', (req, res) => {
    if (!req.session?.user) {
      return res.json({ authenticated: false });
    }

    return res.json({
      authenticated: true,
      user: req.session.user,
    });
  });

  // Public registration: students only.
  app.post('/api/auth/signup', signupLimiter, async (req, res) => {
    try {
      const fullName = String(req.body.full_name || '').trim();
      const username = String(req.body.username || '')
        .trim()
        .toLowerCase();
      const email = String(req.body.email || '')
        .trim()
        .toLowerCase();
      const password = String(req.body.password || '');
      const confirmPassword = String(req.body.confirm_password || '');

      if (password !== confirmPassword) {
        return res.status(400).json({
          error: 'Passwords do not match.',
        });
      }

      const validationError = validateAccount({
        fullName,
        username,
        email,
        password,
      });

      if (validationError) {
        return res.status(400).json({
          error: validationError,
        });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const result = await pool.query(
        `INSERT INTO yuva_users
          (full_name, username, email, password_hash, role)
         VALUES ($1, $2, $3, $4, 'student')
         RETURNING id, full_name, username, email, role`,
        [fullName, username, email, passwordHash]
      );

      const user = publicUser(result.rows[0]);

      req.session.regenerate((error) => {
        if (error) {
          console.error('Signup session regeneration failed:', error);
          return res.status(500).json({
            error: 'Account created, but session could not start.',
          });
        }

        req.session.user = user;

        req.session.save((saveError) => {
          if (saveError) {
            console.error('Signup session save failed:', saveError);
            return res.status(500).json({
              error: 'Account created, but session could not be saved.',
            });
          }

          return res.status(201).json({
            authenticated: true,
            user,
          });
        });
      });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({
          error: 'Username or email already exists.',
        });
      }

      console.error('Student signup error:', error);

      return res.status(500).json({
        error: 'Unable to create student account.',
      });
    }
  });

  // Admin creation: only an authenticated admin can use this endpoint.
  app.post(
    '/api/auth/admins',
    requireAdmin,
    signupLimiter,
    async (req, res) => {
      try {
        const fullName = String(req.body.full_name || '').trim();
        const username = String(req.body.username || '')
          .trim()
          .toLowerCase();
        const email = String(req.body.email || '')
          .trim()
          .toLowerCase();
        const password = String(req.body.password || '');
        const confirmPassword = String(req.body.confirm_password || '');

        if (password !== confirmPassword) {
          return res.status(400).json({
            error: 'Passwords do not match.',
          });
        }

        const validationError = validateAccount({
          fullName,
          username,
          email,
          password,
        });

        if (validationError) {
          return res.status(400).json({
            error: validationError,
          });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const result = await pool.query(
          `INSERT INTO yuva_users
            (full_name, username, email, password_hash, role)
           VALUES ($1, $2, $3, $4, 'admin')
           RETURNING id, full_name, username, email, role`,
          [fullName, username, email, passwordHash]
        );

        return res.status(201).json({
          success: true,
          user: publicUser(result.rows[0]),
        });
      } catch (error) {
        if (error.code === '23505') {
          return res.status(409).json({
            error: 'Username or email already exists.',
          });
        }

        console.error('Admin creation error:', error);

        return res.status(500).json({
          error: 'Unable to create admin account.',
        });
      }
    }
  );

  app.post('/api/auth/login', loginLimiter, async (req, res) => {
    try {
      const identifier = String(
        req.body.identifier || req.body.username || ''
      ).trim().toLowerCase();

      const password = String(req.body.password || '');

      if (
        !identifier ||
        !password ||
        Buffer.byteLength(password, 'utf8') > 72
      ) {
        return res.status(400).json({
          error: 'Enter your username/email and password.',
        });
      }

      const result = await pool.query(
        `SELECT id, full_name, username, email, password_hash, role
         FROM yuva_users
         WHERE LOWER(username) = $1 OR LOWER(email) = $1
         LIMIT 1`,
        [identifier]
      );

      const record = result.rows[0];

      if (!record) {
        return res.status(401).json({
          error: 'Invalid username/email or password.',
        });
      }

      const passwordMatches = await bcrypt.compare(
        password,
        record.password_hash
      );

      if (!passwordMatches) {
        return res.status(401).json({
          error: 'Invalid username/email or password.',
        });
      }

      const user = publicUser(record);

      req.session.regenerate((error) => {
        if (error) {
          console.error('Login session regeneration failed:', error);
          return res.status(500).json({
            error: 'Unable to start session.',
          });
        }

        req.session.user = user;

        req.session.save((saveError) => {
          if (saveError) {
            console.error('Login session save failed:', saveError);
            return res.status(500).json({
              error: 'Unable to save session.',
            });
          }

          return res.json({
            authenticated: true,
            user,
          });
        });
      });
    } catch (error) {
      console.error('Login error:', error);

      return res.status(500).json({
        error: 'Unable to log in.',
      });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    if (!req.session) {
      res.clearCookie('yuva.sid');
      return res.json({ success: true });
    }

    req.session.destroy((error) => {
      if (error) {
        console.error('Logout error:', error);
        return res.status(500).json({
          error: 'Unable to log out.',
        });
      }

      res.clearCookie('yuva.sid', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });

      return res.json({ success: true });
    });
  });
}

module.exports = {
  pool,
  initializeAuth,
  createSessionMiddleware,
  registerAuthRoutes,
  sessionStore,
  requireAuth,
  requireAdmin,
};
