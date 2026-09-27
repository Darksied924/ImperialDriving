/**
 * Course service.
 * Schema-aligned against migration 003:
 *   - Column is `total_fee`, not `fee`.
 *   - `total_fee` is NOT NULL DEFAULT 0 with CHECK (>= 0).
 *   - `currency` is NOT NULL DEFAULT 'KES'.
 *   - `updated_at` is maintained by trigger trg_courses_updated_at.
 *     Do NOT set it manually in UPDATEs.
 *   - Soft-delete is via is_active (no deleted_at column).
 *
 * Audit is written via the shared helper in src/utils/audit.js, using the
 * transaction client so the row commits/rolls back with the write.
 */

const pool = require('../config/db');
const { recordAudit } = require('../utils/audit');

const SELECT_COLS = `
  id, code, name, description, duration_weeks,
  theory_hours, practical_hours, total_fee, currency, is_active
`;

async function listCourses({ includeInactive = false } = {}) {
  const where = includeInactive ? '' : 'WHERE is_active = TRUE';
  const { rows } = await pool.query(
    `SELECT ${SELECT_COLS} FROM courses ${where} ORDER BY code ASC`
  );
  return rows;
}

async function getCourseById(id) {
  const { rows } = await pool.query(
    `SELECT ${SELECT_COLS} FROM courses WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function createCourse(data, actor) {
  const {
    code,
    name,
    description = null,
    duration_weeks = null,
    theory_hours = null,
    practical_hours = null,
    total_fee = 0,
    currency = 'KES',
  } = data;

  // `actor` is { userId, ipAddress, userAgent }. Accept a bare userId string
  // too, for forward/backward compatibility with existing call sites.
  const ctx =
    typeof actor === 'object' && actor !== null
      ? actor
      : { userId: actor };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO courses
         (code, name, description, duration_weeks, theory_hours,
          practical_hours, total_fee, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${SELECT_COLS}`,
      [
        code, name, description, duration_weeks, theory_hours,
        practical_hours, total_fee, currency,
      ]
    );
    const course = rows[0];

    await recordAudit(
      {
        userId: ctx.userId,
        action: 'course.created',
        entityType: 'course',
        entityId: course.id,
        changes: {
          code: course.code,
          name: course.name,
          total_fee: course.total_fee,
          currency: course.currency,
          is_active: course.is_active,
        },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      },
      client
    );

    await client.query('COMMIT');
    return course;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateCourse(id, data, actor) {
  const {
    code,
    name,
    description = null,
    duration_weeks = null,
    theory_hours = null,
    practical_hours = null,
    total_fee = 0,
    currency = 'KES',
  } = data;

  const ctx =
    typeof actor === 'object' && actor !== null
      ? actor
      : { userId: actor };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // updated_at handled by trg_courses_updated_at — do not set manually.
    const { rows } = await client.query(
      `UPDATE courses
          SET code            = $1,
              name            = $2,
              description     = $3,
              duration_weeks  = $4,
              theory_hours    = $5,
              practical_hours = $6,
              total_fee       = $7,
              currency        = $8
        WHERE id = $9
        RETURNING ${SELECT_COLS}`,
      [
        code, name, description, duration_weeks, theory_hours,
        practical_hours, total_fee, currency, id,
      ]
    );
    const course = rows[0];
    if (!course) {
      await client.query('ROLLBACK');
      return null;
    }

    await recordAudit(
      {
        userId: ctx.userId,
        action: 'course.updated',
        entityType: 'course',
        entityId: course.id,
        changes: {
          code: course.code,
          name: course.name,
          total_fee: course.total_fee,
          currency: course.currency,
        },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      },
      client
    );

    await client.query('COMMIT');
    return course;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function setCourseActive(id, isActive, actor) {
  const ctx =
    typeof actor === 'object' && actor !== null
      ? actor
      : { userId: actor };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE courses SET is_active = $1 WHERE id = $2 RETURNING ${SELECT_COLS}`,
      [isActive, id]
    );
    const course = rows[0];
    if (!course) {
      await client.query('ROLLBACK');
      return null;
    }

    await recordAudit(
      {
        userId: ctx.userId,
        action: isActive ? 'course.reactivated' : 'course.deactivated',
        entityType: 'course',
        entityId: course.id,
        changes: { code: course.code, is_active: course.is_active },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      },
      client
    );

    await client.query('COMMIT');
    return course;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  listCourses,
  getCourseById,
  createCourse,
  updateCourse,
  setCourseActive,
};