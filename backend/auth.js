const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
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
      reset_token TEXT,
      reset_token_expiry TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (username = lower(username))
    );
  `);

  await pool.query(`
    ALTER TABLE yuva_users ADD COLUMN IF NOT EXISTS reset_token TEXT;
    ALTER TABLE yuva_users ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMPTZ;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS yuva_users_created_at_idx
    ON yuva_users (created_at);
  `);

  console.log('Authentication database schema ready with password reset support');
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

function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return 'Password is required';
  }
  if (password.length < 8 || password.length > 32) {
    return 'Password must be between 8 and 32 characters';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must include at least one uppercase letter';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must include at least one lowercase letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must include at least one digit';
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return 'Password must include at least one special character';
  }
  return null;
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many requests, please try again later' },
});

function registerAuthRoutes(app) {
  app.use(express.json());

  // Current logged in user
  app.get('/auth/me', (req, res) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ authenticated: false });
    }
    res.json({
      authenticated: true,
      user: {
        id: req.session.userId,
        username: req.session.username,
        email: req.session.email,
      },
    });
  });

  // User Registration
  app.post('/auth/register', authLimiter, async (req, res) => {
    try {
      const { username, email, password } = req.body;
      if (!username || !email || !password) {
        return res.status(400).json({ error: 'Username, email and password are required' });
      }

      const cleanUsername = username.trim().toLowerCase();
      const cleanEmail = email.trim().toLowerCase();

      if (cleanUsername.length < 3 || cleanUsername.length > 32) {
        return res.status(400).json({ error: 'Username must be between 3 and 32 characters' });
      }

      const passwordError = validatePassword(password);
      if (passwordError) {
        return res.status(400).json({ error: passwordError });
      }

      const userExists = await pool.query(
        'SELECT id FROM yuva_users WHERE username = $1 OR email = $2',
        [cleanUsername, cleanEmail]
      );
      if (userExists.rows.length > 0) {
        return res.status(409).json({ error: 'Username or email already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const result = await pool.query(
        'INSERT INTO yuva_users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
        [cleanUsername, cleanEmail, passwordHash]
      );

      const user = result.rows[0];
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.email = user.email;

      res.status(201).json({ success: true, user });
    } catch (err) {
      console.error('Registration error:', err);
      res.status(500).json({ error: 'Internal server error during registration' });
    }
  });

  // User Login
  app.post('/auth/login', authLimiter, async (req, res) => {
    try {
      const { identifier, password } = req.body;
      if (!identifier || !password) {
        return res.status(400).json({ error: 'Username/Email and password are required' });
      }

      const cleanIdentifier = identifier.trim().toLowerCase();
      const result = await pool.query(
        'SELECT id, username, email, password_hash FROM yuva_users WHERE username = $1 OR email = $1',
        [cleanIdentifier]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = result.rows[0];
      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.email = user.email;

      res.json({
        success: true,
        user: { id: user.id, username: user.username, email: user.email },
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Internal server error during login' });
    }
  });

  // Forgot Password
  app.post('/auth/forgot-password', authLimiter, async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const cleanEmail = email.trim().toLowerCase();
      const user = await pool.query('SELECT id, username FROM yuva_users WHERE email = $1', [cleanEmail]);

      if (user.rows.length === 0) {
        return res.json({ success: true, message: 'If the email exists, a reset code has been generated' });
      }

      const resetToken = crypto.randomBytes(16).toString('hex');
      const tokenExpiry = new Date(Date.now() + 15 * 60 * 1000);

      await pool.query(
        'UPDATE yuva_users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3',
        [resetToken, tokenExpiry, user.rows[0].id]
      );

      console.log(`\n===============================================\n[PASSWORD RESET CODE] for ${cleanEmail}: ${resetToken}\n===============================================\n`);

      res.json({
        success: true,
        message: 'Reset token generated (Check console logs in development)',
        devToken: process.env.NODE_ENV !== 'production' ? resetToken : undefined,
      });
    } catch (err) {
      console.error('Forgot password error:', err);
      res.status(500).json({ error: 'Failed to process forgot password' });
    }
  });

  // Reset Password
  app.post('/auth/reset-password', authLimiter, async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) {
        return res.status(400).json({ error: 'Token and new password are required' });
      }

      const passwordError = validatePassword(newPassword);
      if (passwordError) {
        return res.status(400).json({ error: passwordError });
      }

      const user = await pool.query(
        'SELECT id FROM yuva_users WHERE reset_token = $1 AND reset_token_expiry > NOW()',
        [token.trim()]
      );

      if (user.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }

      const newHash = await bcrypt.hash(newPassword, 12);
      await pool.query(
        'UPDATE yuva_users SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL WHERE id = $2',
        [newHash, user.rows[0].id]
      );

      res.json({ success: true, message: 'Password updated successfully. You can now login.' });
    } catch (err) {
      console.error('Reset password error:', err);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  // Logout
  app.post('/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: 'Failed to logout' });
      res.clearCookie('yuva.sid');
      res.json({ success: true });
    });
  });
}

module.exports = {
  pool,
  initializeAuth,
  createSessionMiddleware,
  registerAuthRoutes,
};
