// src/routes/attendance.routes.js
//
// Theory attendance — dual-mounted at /reception and /admin, same pattern
// as payments.routes.js. Routes are /attendance/* so the full paths are:
//   /reception/attendance/...
//   /admin/attendance/...
// basePath = req.baseUrl keeps redirects and links within the mounted prefix.
//
// 5 routes:
//   GET  /attendance              list sessions
//   GET  /attendance/new          create-session form
//   POST /attendance              create session
//   GET  /attendance/:id          roster + mark form
//   POST /attendance/:id          save marks (idempotent upsert)
//
// All routes guarded: ensureAuthenticated + requireRole('reception','admin').
// UUID guards on :id prevent 22P02 from malformed IDs.
// actorFromReq(req) threads ip_address / user_agent into every audit row.

const express = require('express');
const router  = express.Router();

const { ensureAuthenticated, requireRole } = require('../middleware/auth');
const { validateNewSession }               = require('../middleware/validation');
const attendanceService                    = require('../services/attendance.service');

const STAFF = ['reception', 'admin'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid  = (v) => typeof v === 'string' && UUID_RE.test(v);

// Same helper shape used by payments.routes.js — keeps audit rows consistent.
function actorFromReq(req) {
  return {
    userId:    req.user.id,
    ipAddress: req.ip || null,
    userAgent: req.get('user-agent') || null,
  };
}

// Whitelisted statuses for marks — mirrors the DB enum.
const MARK_STATUSES = ['present', 'absent', 'late', 'excused'];

// ── Guards apply to every route below ──────────────────────────────────────
router.use(ensureAuthenticated, requireRole(...STAFF));

// ── GET /attendance — list ─────────────────────────────────────────────────
router.get('/attendance', async (req, res, next) => {
  try {
    const from   = (req.query.from   || '').trim();
    const to     = (req.query.to     || '').trim();
    const status = (req.query.status || '').trim();

    const sessions = await attendanceService.listSessions({ from, to, status });

    res.render('reception/attendance', {
      title:    'Theory Attendance',
      user:     req.user,
      basePath: req.baseUrl,
      sessions,
      filters:  { from, to, status },
      active:   'attendance',
    });
  } catch (err) { next(err); }
});

// ── GET /attendance/new — form ─────────────────────────────────────────────
router.get('/attendance/new', async (req, res, next) => {
  try {
    const instructors = await attendanceService.listInstructors();
    res.render('reception/attendance-form', {
      title:    'New Theory Session',
      user:     req.user,
      basePath: req.baseUrl,
      instructors,
      errors:   [],
      values: {
        topic:            '',
        instructor_id:    '',
        scheduled_at:     '',
        duration_minutes: 60,
        location:         '',
        status:           'scheduled',
        notes:            '',
      },
      active: 'attendance',
    });
  } catch (err) { next(err); }
});

// ── POST /attendance — create ──────────────────────────────────────────────
router.post('/attendance', async (req, res, next) => {
  const errors = validateNewSession(req.body);

  if (errors.length) {
    const instructors = await attendanceService.listInstructors().catch(() => []);
    return res.status(400).render('reception/attendance-form', {
      title:    'New Theory Session',
      user:     req.user,
      basePath: req.baseUrl,
      instructors,
      errors,
      values:   req.body,   // preserve what the user typed
      active:   'attendance',
    });
  }

  try {
    const session = await attendanceService.createSession(
      req.body,
      actorFromReq(req)
    );
    return res.redirect(`${req.baseUrl}/attendance/${session.id}`);
  } catch (err) {
    // Enum / UUID violations land here if validation missed them.
    if (err.code === '22P02' || err.code === '23514') {
      const instructors = await attendanceService.listInstructors().catch(() => []);
      return res.status(400).render('reception/attendance-form', {
        title:    'New Theory Session',
        user:     req.user,
        basePath: req.baseUrl,
        instructors,
        errors:   ['One of the selected values is not allowed.'],
        values:   req.body,
        active:   'attendance',
      });
    }
    return next(err);
  }
});

// ── GET /attendance/:id — roster + mark form ───────────────────────────────
router.get('/attendance/:id', async (req, res, next) => {
  if (!isUuid(req.params.id)) return res.status(404).send('Not Found');
  try {
    const data = await attendanceService.getSessionRoster(req.params.id);
    if (!data) return res.status(404).send('Not Found');
    res.render('reception/attendance-mark', {
      title:    data.session.topic,
      user:     req.user,
      basePath: req.baseUrl,
      session:  data.session,
      roster:   data.roster,
      saved:    req.query.saved === '1',
      active:   'attendance',
    });
  } catch (err) { next(err); }
});

// ── POST /attendance/:id — save marks ──────────────────────────────────────
router.post('/attendance/:id', async (req, res, next) => {
  if (!isUuid(req.params.id)) return res.status(404).send('Not Found');
  try {
    const session = await attendanceService.getSession(req.params.id);
    if (!session) return res.status(404).send('Not Found');

    // Parse "status_<uuid>" and "notes_<uuid>" keys out of req.body.
    // No hidden JSON blob — every field is directly inspectable in devtools.
    const entries = [];
    for (const key of Object.keys(req.body)) {
      if (!key.startsWith('status_')) continue;
      const sid = key.slice('status_'.length);
      if (!isUuid(sid)) continue;
      const status = req.body[key];
      if (!MARK_STATUSES.includes(status)) continue;
      entries.push({
        studentId: sid,
        status,
        notes: req.body[`notes_${sid}`] || null,
      });
    }

    await attendanceService.saveAttendance(
      req.params.id,
      entries,
      actorFromReq(req)
    );

    return res.redirect(`${req.baseUrl}/attendance/${req.params.id}?saved=1`);
  } catch (err) { next(err); }
});

module.exports = router;
