/**
 * Express session configuration.
 * Uses PostgreSQL as the session store so sessions survive restarts
 * and work across multiple Node processes.
 */

const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const pool = require('./db');

const isProduction = process.env.NODE_ENV === 'production';

const sessionConfig = {
  name: 'imperial.sid',
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  store: new PgSession({
    pool,
    tableName: 'user_sessions',
    createTableIfMissing: false, // table is managed by migration 013
    pruneSessionInterval: 60 * 15, // prune every 15 minutes
  }),
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 8, // 8 hours
  },
};

module.exports = sessionConfig;