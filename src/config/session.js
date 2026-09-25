/**
 * Express session middleware.
 * Exports a ready-to-use middleware function (already wrapped in express-session)
 * backed by PostgreSQL, so sessions survive restarts and work across processes.
 */

const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const pool = require('./db');

const isProduction = process.env.NODE_ENV === 'production';

const sessionMiddleware = session({
  name: 'imperial.sid',
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  store: new PgSession({
    pool,
    tableName: 'user_sessions',
    createTableIfMissing: false,
    pruneSessionInterval: 60 * 15,
  }),
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 8,
  },
});

module.exports = sessionMiddleware;