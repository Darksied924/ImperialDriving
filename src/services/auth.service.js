/**
 * Authentication service.
 * Pure data access + password helpers. No HTTP concerns.
 */

const bcrypt = require('bcryptjs');
const pool = require('../config/db');

const SALT_ROUNDS = 12;

/**
 * Finds a user by email, joined with role name.
 * Returns password_hash for verification. Do not send this to a view.
 */
async function findByEmail(email) {
  const { rows } = await pool.query(
    `SELECT u.id,
            u.email,
            u.password_hash,
            u.first_name,
            u.last_name,
            (u.status = 'active') AS is_active,
            r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE u.email = $1
        AND u.deleted_at IS NULL
      LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

/**
 * Finds a user by id. Used by passport.deserializeUser on every request.
 * Does not return password_hash.
 */
async function findById(id) {
  const { rows } = await pool.query(
    `SELECT u.id,
            u.email,
            u.first_name,
            u.last_name,
            (u.status = 'active') AS is_active,
            r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1
        AND u.deleted_at IS NULL
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

function verifyPassword(user, password) {
  if (!user || !user.password_hash) return false;
  return bcrypt.compare(password, user.password_hash);
}

function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Minimal user object stored in the session and exposed to views.
 * Never include password_hash here.
 */
function toSessionUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name: [user.first_name, user.last_name].filter(Boolean).join(' '),
  };
}

/**
 * Best-effort audit of successful logins.
 * Matches the audit_logs schema: user_id, action, entity_type, entity_id,
 * changes (jsonb), ip_address (inet), user_agent.
 * Failures here must never block authentication.
 */
async function recordLoginAudit({ userId, ip, userAgent }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs
         (user_id, action, entity_type, entity_id, changes, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
      [
        userId,
        'login.success',
        'user',
        String(userId),
        JSON.stringify({ source: 'web' }),
        ip || null,
        userAgent || null,
      ]
    );
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}

/* ------------------------------------------------------------------ *
 * Staff user management (Phase 3 — admin only)
 * ------------------------------------------------------------------ */

/**
 * Map a role name (e.g. 'admin') to its id in the roles table.
 * Returns null if the role does not exist.
 */
async function getRoleIdByName(roleName) {
  const { rows } = await pool.query(
    'SELECT id FROM roles WHERE name = $1 LIMIT 1',
    [roleName]
  );
  return rows[0] ? rows[0].id : null;
}

/**
 * List all non-deleted staff users with their role names.
 * Never returns password_hash.
 */
async function listUsers() {
  const { rows } = await pool.query(
    `SELECT u.id,
            u.email,
            u.first_name,
            u.last_name,
            u.status,
            u.created_at,
            r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE u.deleted_at IS NULL
      ORDER BY u.created_at DESC`
  );
  return rows;
}

/**
 * Split a single "name" string into first_name / last_name.
 * "Felix Cheruiyot" -> { firstName: 'Felix', lastName: 'Cheruiyot' }
 * "Cheruiyot"        -> { firstName: 'Cheruiyot', lastName: null }
 */
function splitName(name) {
  const trimmed = String(name || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return { firstName: '', lastName: null };
  const idx = trimmed.indexOf(' ');
  if (idx === -1) return { firstName: trimmed, lastName: null };
  return {
    firstName: trimmed.slice(0, idx),
    lastName: trimmed.slice(idx + 1),
  };
}

/**
 * Create a new staff user.
 * Expects explicit firstName and lastName.
 * Throws error.code === 'DUPLICATE_EMAIL' if the email is taken.
 * Throws error.code === 'UNKNOWN_ROLE' if the role does not exist.
 * Returns the safe user shape (never the hash).
 */
async function createUser({
  firstName,
  lastName,
  email,
  password,
  role,
  status = 'active',
}) {
  const first = (firstName || '').trim();
  const last = (lastName || '').trim();

  // Duplicate email check reuses the verified findByEmail.
  const existing = await findByEmail(email);
  if (existing) {
    const err = new Error('Duplicate email');
    err.code = 'DUPLICATE_EMAIL';
    throw err;
  }

  // Resolve the role id.
  const roleId = await getRoleIdByName(role);
  if (!roleId) {
    const err = new Error('Unknown role');
    err.code = 'UNKNOWN_ROLE';
    throw err;
  }

  // Hash with the existing bcrypt helper (cost 12).
  const hash = await hashPassword(password);

  const { rows } = await pool.query(
    `INSERT INTO users (first_name, last_name, email, password_hash, role_id, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, email, first_name, last_name, status, created_at`,
    [first, last, email, hash, roleId, status]
  );

  return { ...rows[0], role };
}

/**
 * Generic best-effort audit writer.
 * Failures here must never block the primary operation.
 */
async function recordAudit({
  userId,
  action,
  entityType,
  entityId,
  changes,
  ipAddress,
  userAgent,
}) {
  try {
    await pool.query(
      `INSERT INTO audit_logs
         (user_id, action, entity_type, entity_id, changes, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
      [
        userId,
        action,
        entityType,
        String(entityId),
        JSON.stringify(changes || {}),
        ipAddress || null,
        userAgent || null,
      ]
    );
  } catch (err) {
    console.error('recordAudit failed:', err.message);
  }
}

module.exports = {
  // Existing — unchanged
  findByEmail,
  findById,
  verifyPassword,
  hashPassword,
  toSessionUser,
  recordLoginAudit,

  // New — staff user management
  getRoleIdByName,
  listUsers,
  createUser,
  recordAudit,
};