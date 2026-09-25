/**
 * Health and liveness endpoints.
 * Safe to hit without authentication.
 */

const express = require('express');
const pool = require('../config/db');

const router = express.Router();

// GET / — service banner.
router.get('/', (req, res) => {
  res.json({
    service: 'Imperial Driving School',
    status: 'ok',
    time: new Date().toISOString(),
  });
});

// GET /health — process liveness.
router.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// GET /health/db — database connectivity.
router.get('/health/db', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT NOW() AS now');
    res.json({ status: 'ok', db: 'reachable', now: rows[0].now });
  } catch (err) {
    res.status(503).json({ status: 'error', db: 'unreachable', message: err.message });
  }
});

module.exports = router;
