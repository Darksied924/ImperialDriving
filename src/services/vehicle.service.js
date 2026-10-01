// src/services/vehicle.service.js
//
// Vehicles service.
// Schema-aligned against migration 005:
//   - registration_number is UNIQUE NOT NULL.
//   - year has CHECK 1950..2100; nullable.
//   - transmission is nullable enum (manual, automatic).
//   - status is NOT NULL enum default 'available'.
//   - updated_at owned by trg_vehicles_updated_at — never set manually.
//   - Soft delete via deleted_at (set to now()); reactivate via NULL.
//
// Audit via the shared helper in src/utils/audit.js, using the transaction
// client so the row commits/rolls back with the write.

const pool = require('../config/db');
const { recordAudit } = require('../utils/audit');

const SELECT_COLS = `
  id, registration_number, make, model, year, color,
  transmission, status, notes, created_at, updated_at, deleted_at
`;

/* ------------------------------------------------------------------ reads */

async function listVehicles({ includeDeleted = false } = {}) {
  const where = includeDeleted ? '' : 'WHERE deleted_at IS NULL';
  const { rows } = await pool.query(
    `SELECT ${SELECT_COLS} FROM vehicles
      ${where}
      ORDER BY registration_number ASC`
  );
  return rows;
}

async function getVehicleById(id) {
  const { rows } = await pool.query(
    `SELECT ${SELECT_COLS} FROM vehicles WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

/* ----------------------------------------------------------------- writes */

async function createVehicle(data, actor) {
  const {
    registration_number,
    make         = null,
    model        = null,
    year         = null,
    color        = null,
    transmission = null,
    status       = 'available',
    notes        = null,
  } = data;

  // Accept either { userId, ipAddress, userAgent } or a bare userId.
  const ctx = (typeof actor === 'object' && actor !== null)
    ? actor
    : { userId: actor };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO vehicles
         (registration_number, make, model, year, color, transmission, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${SELECT_COLS}`,
      [
        registration_number, make, model, year, color,
        transmission, status, notes,
      ]
    );
    const vehicle = rows[0];

    await recordAudit(
      {
        userId: ctx.userId,
        action: 'vehicle.created',
        entityType: 'vehicle',
        entityId: vehicle.id,
        changes: {
          registration_number: vehicle.registration_number,
          make:         vehicle.make,
          model:        vehicle.model,
          year:         vehicle.year,
          transmission: vehicle.transmission,
          status:       vehicle.status,
        },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      },
      client
    );

    await client.query('COMMIT');
    return vehicle;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateVehicle(id, data, actor) {
  const {
    registration_number,
    make         = null,
    model        = null,
    year         = null,
    color        = null,
    transmission = null,
    status       = 'available',
    notes        = null,
  } = data;

  const ctx = (typeof actor === 'object' && actor !== null)
    ? actor
    : { userId: actor };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // updated_at handled by trg_vehicles_updated_at — do not set manually.
    const { rows } = await client.query(
      `UPDATE vehicles
          SET registration_number = $1,
              make                = $2,
              model               = $3,
              year                = $4,
              color               = $5,
              transmission        = $6,
              status              = $7,
              notes               = $8
        WHERE id = $9
        RETURNING ${SELECT_COLS}`,
      [
        registration_number, make, model, year, color,
        transmission, status, notes, id,
      ]
    );
    const vehicle = rows[0];
    if (!vehicle) {
      await client.query('ROLLBACK');
      return null;
    }

    await recordAudit(
      {
        userId: ctx.userId,
        action: 'vehicle.updated',
        entityType: 'vehicle',
        entityId: vehicle.id,
        changes: {
          registration_number: vehicle.registration_number,
          make:         vehicle.make,
          model:        vehicle.model,
          year:         vehicle.year,
          transmission: vehicle.transmission,
          status:       vehicle.status,
        },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      },
      client
    );

    await client.query('COMMIT');
    return vehicle;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Soft delete: set deleted_at = now() on an active row.
// Returns null if the row is already deleted or doesn't exist.
async function softDeleteVehicle(id, actor) {
  const ctx = (typeof actor === 'object' && actor !== null)
    ? actor
    : { userId: actor };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE vehicles
          SET deleted_at = now()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING ${SELECT_COLS}`,
      [id]
    );
    const vehicle = rows[0];
    if (!vehicle) {
      await client.query('ROLLBACK');
      return null;
    }

    await recordAudit(
      {
        userId: ctx.userId,
        action: 'vehicle.deleted',
        entityType: 'vehicle',
        entityId: vehicle.id,
        changes: {
          registration_number: vehicle.registration_number,
        },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      },
      client
    );

    await client.query('COMMIT');
    return vehicle;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Reactivate: set deleted_at = NULL on a deleted row.
// Returns null if the row is not currently deleted.
async function reactivateVehicle(id, actor) {
  const ctx = (typeof actor === 'object' && actor !== null)
    ? actor
    : { userId: actor };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE vehicles
          SET deleted_at = NULL
        WHERE id = $1 AND deleted_at IS NOT NULL
        RETURNING ${SELECT_COLS}`,
      [id]
    );
    const vehicle = rows[0];
    if (!vehicle) {
      await client.query('ROLLBACK');
      return null;
    }

    await recordAudit(
      {
        userId: ctx.userId,
        action: 'vehicle.reactivated',
        entityType: 'vehicle',
        entityId: vehicle.id,
        changes: {
          registration_number: vehicle.registration_number,
        },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      },
      client
    );

    await client.query('COMMIT');
    return vehicle;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  listVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  softDeleteVehicle,
  reactivateVehicle,
};
