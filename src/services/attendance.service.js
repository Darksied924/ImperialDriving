// src/services/attendance.service.js
//
// Theory attendance service.
//
// Shape: session-based. Create a theory_sessions row first (topic, when,
// instructor), then record each student's mark for that session.
// UNIQUE(session_id, student_id) makes re-saves idempotent — we upsert
// rather than delete-then-insert.
//
// Audit actions emitted:
//   attendance.session_created  — POST /attendance
//   attendance.marked           — POST /attendance/:id (one per save)
//
// Matches the payment.service.js pattern:
//   - pool = require('../config/db')  (db.js exports a Pool directly)
//   - recordAudit({ userId, action, entityType, entityId, changes,
//                   ipAddress, userAgent }, client)
//   - Transaction wraps multi-write operations; audit participates.

const pool = require('../config/db');
const { recordAudit } = require('../utils/audit');

// Enum whitelists — kept in lock-step with the DB enums.
const SESSION_STATUSES    = ['scheduled', 'in_progress', 'completed', 'cancelled'];
const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'excused'];

/* ------------------------------------------------------------------ reads */

// List sessions with present-count and total-marked-count for the list view.
// Filters are all optional.
async function listSessions({ from, to, status } = {}) {
  const params = [];
  const where  = [];

  if (from) {
    params.push(from);
    where.push(`ts.scheduled_at >= $${params.length}::date`);
  }
  if (to) {
    params.push(to);
    // Include the whole "to" day — compare against the following midnight.
    where.push(`ts.scheduled_at < ($${params.length}::date + interval '1 day')`);
  }
  if (status && SESSION_STATUSES.includes(status)) {
    params.push(status);
    where.push(`ts.status = $${params.length}::session_status`);
  }

  const sql = `
    SELECT
      ts.id,
      ts.topic,
      ts.scheduled_at,
      ts.duration_minutes,
      ts.location,
      ts.status,
      ts.notes,
      (u.first_name || ' ' || u.last_name) AS instructor_name,
      COUNT(ta.id) FILTER (WHERE ta.status = 'present') AS present_count,
      COUNT(ta.id) AS marked_count
    FROM theory_sessions ts
    LEFT JOIN users u              ON u.id = ts.instructor_id
    LEFT JOIN theory_attendance ta ON ta.session_id = ts.id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    GROUP BY ts.id, u.first_name, u.last_name
    ORDER BY ts.scheduled_at DESC
    LIMIT 200
  `;

  const { rows } = await pool.query(sql, params);
  return rows;
}

// Single session, with instructor name.
async function getSession(id) {
  const { rows } = await pool.query(
    `SELECT ts.*,
            (u.first_name || ' ' || u.last_name) AS instructor_name
       FROM theory_sessions ts
       LEFT JOIN users u ON u.id = ts.instructor_id
      WHERE ts.id = $1`,
    [id]
  );
  return rows[0] || null;
}

// Active instructors — used to populate the "Instructor" dropdown.
async function listInstructors() {
  const { rows } = await pool.query(
    `SELECT u.id,
            (u.first_name || ' ' || u.last_name) AS full_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE r.name = 'instructor'
        AND u.status = 'active'
        AND u.deleted_at IS NULL
      ORDER BY u.first_name, u.last_name`
  );
  return rows;
}

// Session + roster of active students, with any existing marks LEFT JOINed in.
// Returns null when the session doesn't exist.
async function getSessionRoster(sessionId) {
  const session = await getSession(sessionId);
  if (!session) return null;

  const { rows } = await pool.query(
    `SELECT
       s.id            AS student_id,
       s.admission_number,
       s.first_name,
       s.last_name,
       c.code          AS course_code,
       ta.status       AS attendance_status,
       ta.notes        AS attendance_notes
     FROM students s
     LEFT JOIN courses c            ON c.id = s.course_id
     LEFT JOIN theory_attendance ta ON ta.student_id = s.id AND ta.session_id = $1
     WHERE s.status = 'active'
       AND s.deleted_at IS NULL
     ORDER BY s.admission_number`,
    [sessionId]
  );

  return { session, roster: rows };
}

// Per-student history (most recent first). Used on student-details.
async function getStudentAttendance(studentId, { limit = 50 } = {}) {
  const { rows } = await pool.query(
    `SELECT ta.status,
            ta.notes,
            ta.recorded_at,
            ts.id          AS session_id,
            ts.topic,
            ts.scheduled_at,
            ts.location
       FROM theory_attendance ta
       JOIN theory_sessions ts ON ts.id = ta.session_id
      WHERE ta.student_id = $1
      ORDER BY ts.scheduled_at DESC
      LIMIT $2`,
    [studentId, limit]
  );
  return rows;
}

/* ----------------------------------------------------------------- writes */

// Create a session. Audit row is not part of a transaction here — single
// INSERT + single audit row, and recordAudit falls back to the pool.
async function createSession(input, actor = {}) {
  const {
    topic,
    instructor_id,
    scheduled_at,
    duration_minutes,
    location,
    notes,
    status,
  } = input;

  const { rows } = await pool.query(
    `INSERT INTO theory_sessions
       (topic, instructor_id, scheduled_at, duration_minutes, location, notes, status)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::session_status, 'scheduled'))
     RETURNING *`,
    [
      topic,
      instructor_id || null,
      scheduled_at,
      duration_minutes || 60,
      location || null,
      notes || null,
      status || null,
    ]
  );
  const session = rows[0];

  await recordAudit({
    userId:     actor.userId    || null,
    action:     'attendance.session_created',
    entityType: 'theory_session',
    entityId:   session.id,
    changes: {
      topic:        session.topic,
      scheduled_at: session.scheduled_at,
      instructor_id: session.instructor_id,
      status:       session.status,
    },
    ipAddress:  actor.ipAddress || null,
    userAgent:  actor.userAgent || null,
  });

  return session;
}

// Bulk upsert marks for one session, inside a transaction with the audit row.
// entries: [{ studentId, status, notes }]
async function saveAttendance(sessionId, entries, actor = {}) {
  if (!entries.length) return { saved: 0 };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let saved = 0;
    for (const e of entries) {
      await client.query(
        `INSERT INTO theory_attendance
           (session_id, student_id, status, notes, recorded_by, recorded_at)
         VALUES ($1, $2, $3::attendance_status, $4, $5, now())
         ON CONFLICT (session_id, student_id) DO UPDATE SET
           status      = EXCLUDED.status,
           notes       = EXCLUDED.notes,
           recorded_by = EXCLUDED.recorded_by,
           recorded_at = now()`,
        [sessionId, e.studentId, e.status, e.notes || null, actor.userId || null]
      );
      saved += 1;
    }

    // Audit inside the same tx so it commits/rolls back with the marks.
    // Identifiers only — no student names or PII in `changes`.
    await recordAudit(
      {
        userId:     actor.userId    || null,
        action:     'attendance.marked',
        entityType: 'theory_session',
        entityId:   sessionId,
        changes:    { count: saved },
        ipAddress:  actor.ipAddress || null,
        userAgent:  actor.userAgent || null,
      },
      client
    );

    await client.query('COMMIT');
    return { saved };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  // reads
  listSessions,
  getSession,
  listInstructors,
  getSessionRoster,
  getStudentAttendance,
  // writes
  createSession,
  saveAttendance,
  // enum re-exports (used by validators / views if needed)
  SESSION_STATUSES,
  ATTENDANCE_STATUSES,
};
