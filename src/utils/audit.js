/**
 * Shared audit-log helper.
 *
 * Schema (see db/migrations/011_add_audit_logs.sql):
 *   audit_logs(id, user_id, action, entity_type, entity_id, changes,
 *              ip_address, user_agent, created_at)
 *
 * - entity_id is TEXT. Anything UUID-ish is stringified before insert.
 * - changes is JSONB. Accepts a plain object; stringified internally.
 * - ip_address and user_agent are nullable. Pass when available.
 *
 * Pass a `client` when calling inside a transaction so the audit row
 * commits/rolls back with the surrounding write. Falls back to pool.
 */

const pool = require('../config/db');

async function recordAudit(
  { userId, action, entityType, entityId, changes, ipAddress, userAgent },
  client = pool
) {
  await client.query(
    `INSERT INTO audit_logs
       (user_id, action, entity_type, entity_id, changes, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [
      userId || null,
      action,
      entityType,
      entityId == null ? null : String(entityId),
      JSON.stringify(changes || {}),
      ipAddress || null,
      userAgent || null,
    ]
  );
}

module.exports = { recordAudit };