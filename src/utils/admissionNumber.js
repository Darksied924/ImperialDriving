// src/utils/admissionNumber.js
// Generates admission numbers like IMP-2026-0001.
// Uses the students table's current max numeric suffix. Wrap the calling
// INSERT in a transaction if you expect concurrent creation.

const pool = require('../config/db'); // adjust to your db export

async function generateAdmissionNumber(client = pool) {
  const year = new Date().getFullYear();
  const prefix = `IMP-${year}-`;

  const { rows } = await client.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(admission_number FROM '(\\d+)$') AS INTEGER)), 0) AS max_seq
       FROM students
      WHERE admission_number LIKE $1`,
    [`${prefix}%`]
  );

  const next = (rows[0].max_seq || 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

module.exports = { generateAdmissionNumber };