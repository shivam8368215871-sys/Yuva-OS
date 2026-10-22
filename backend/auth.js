const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'yuva',
  user: process.env.PGUSER || 'yuva',
  password: process.env.PGPASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

async function initializeAuth() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS yuva_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username VARCHAR(32) NOT NULL UNIQUE,
      email VARCHAR(254) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (username = lower(username))
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS yuva_users_created_at_idx
    ON yuva_users (created_at)
  `);

  console.log('Authentication database schema ready');
}

const sessionStore = new PgSession({
  pool,
  tableName: 'yuva_sessions',
  createTableIfMissing: true,
});

function createSessionMiddleware() {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET must be set to a random value of at least 32 characters');
  }

  return session({
    name: 'yuva.sid',
    secret: process.env.SESSION_SECRET,
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

function registerAuthRoutes(app) {
  app.use(express.json({ limit: '20kb' }));

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Try again later.' },
  });

  const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many signup attempts. Try again later.' },
  });

  app.get('/api/auth/me', (req, res) => {
    const user = req.session?.user;
    if (!user) return res.json({ authenticated: false });

    res.json({
      authenticated: true,
      user: { id: user.id, username: user.username, email: user.email },
    });
  });

  app.post('/api/auth/signup', signupLimiter, async (req, res, next) => {
    try {
      const username = String(req.body?.username || '').trim().toLowerCase();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = req.body?.password;

      if (!/^[a-z0-9_]{3,32}$/.test(username)) {
        return res.status(400).json({
          error: 'Username must be 3–32 characters: lowercase letters, numbers, or underscores.',
        });
      }

      if (
        typeof email !== 'string' ||
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ) {
        return res.status(400).json({ error: 'Enter a valid email address.' });
      }

      if (
        typeof password !== 'string' ||
        password.length < 12 ||
        Buffer.byteLength(password, 'utf8') > 72
      ) {
        return res.status(400).json({
          error: 'Password must be at least 12 characters and no more than 72 bytes.',
        });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      let result;

      try {
        result = await pool.query(
          `INSERT INTO yuva_users (username, email, password_hash)
           VALUES ($1, $2, $3)
           RETURNING id, username, email`,
          [username, email, passwordHash]
        );
      } catch (error) {
        if (error.code === '23505') {
          return res.status(409).json({ error: 'Username or email is already registered.' });
        }
        throw error;
      }

      const user = result.rows[0];

      req.session.regenerate((error) => {
        if (error) return next(error);

        req.session.user = {
          id: user.id,
          username: user.username,
          email: user.email,
        };

        req.session.save((saveError) => {
          if (saveError) return next(saveError);
          res.status(201).json({
            authenticated: true,
            user: req.session.user,
          });
        });
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/auth/login', loginLimiter, async (req, res, next) => {
    try {
      const identifier = String(req.body?.identifier || '').trim().toLowerCase();
      const password = req.body?.password;

      if (
        !identifier ||
        identifier.length > 254 ||
        typeof password !== 'string' ||
        Buffer.byteLength(password, 'utf8') > 72
      ) {
        return res.status(400).json({ error: 'Enter your username/email and password.' });
      }

      const result = await pool.query(
        `SELECT id, username, email, password_hash
         FROM yuva_users
         WHERE username = $1 OR email = $1
         LIMIT 1`,
        [identifier]
      );

      const user = result.rows[0];
      const valid = await bcrypt.compare(
        password,
        user?.password_hash || '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid'
      );

      if (!user || !valid) {
        return res.status(401).json({ error: 'Invalid username/email or password.' });
      }

      req.session.regenerate((error) => {
        if (error) return next(error);

        req.session.user = {
          id: user.id,
          username: user.username,
          email: user.email,
        };

        req.session.save((saveError) => {
          if (saveError) return next(saveError);
          res.json({ authenticated: true, user: req.session.user });
        });
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/auth/logout', (req, res, next) => {
    if (!req.session) return res.json({ authenticated: false });

    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie('yuva.sid', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
      res.json({ authenticated: false });
    });
  });
}

module.exports = {
  pool,
  initializeAuth,
  createSessionMiddleware,
  registerAuthRoutes,
  sessionStore,
};
