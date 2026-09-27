// src/services/student.service.js
const pool = require('../config/db');
const { generateAdmissionNumber } = require('../utils/admissionNumber');

// --- audit helper -----------------------------------------------------------
// Adjust to match the recordAudit signature you added in auth.service.js.
// If recordAudit already handles this shape, delete this and import it instead.
async function recordStudentAudit({ userId, action, entityId, changes }) {
  await pool.query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, changes)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, action, 'student', entityId, JSON.stringify(changes || {})]
  );
}

// --- courses ----------------------------------------------------------------
async function listCourses() {
  const { rows } = await pool.query(
    `SELECT id, code, name, total_fee, currency
       FROM courses
      WHERE is_active = TRUE
      ORDER BY name`
  );
  return rows;
}

// --- students ---------------------------------------------------------------
async function listStudents({ search = '' } = {}) {
  const params = [];
  let where = `WHERE s.deleted_at IS NULL`;

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    where += ` AND (
      LOWER(s.first_name) LIKE $${params.length}
      OR LOWER(s.last_name) LIKE $${params.length}
      OR LOWER(s.admission_number) LIKE $${params.length}
    )`;
  }

  const { rows } = await pool.query(
    `SELECT s.id, s.admission_number, s.first_name, s.last_name,
            s.email, s.phone, s.status,s.enrollment_date,s.created_at,
            c.name AS course_name
       FROM students s
       LEFT JOIN courses c ON c.id = s.course_id
       ${where}
       ORDER BY s.created_at DESC`,
    params
  );
  return rows;
}

async function getStudentById(id) {
  const { rows } = await pool.query(
    `SELECT s.*, c.name AS course_name
       FROM students s
       LEFT JOIN courses c ON c.id = s.course_id
      WHERE s.id = $1 AND s.deleted_at IS NULL`,
    [id]
  );
  return rows[0] || null;
}

async function createStudent(data, actorId) {
  const admission_number =
    data.admission_number || (await generateAdmissionNumber());

  const {
    first_name, last_name, email, phone, date_of_birth, gender,
    national_id, address, course_id, status,
    next_of_kin_name, next_of_kin_phone, next_of_kin_relationship,
  } = data;

  const { rows } = await pool.query(
    `INSERT INTO students
       (admission_number, first_name, last_name, email, phone,
        date_of_birth, gender, national_id, address, course_id, status,
        next_of_kin_name, next_of_kin_phone, next_of_kin_relationship)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING id, admission_number`,
    [
      admission_number, first_name, last_name,
      email || null, phone || null,
      date_of_birth || null, gender || null,
      national_id || null, address || null,
      course_id || null, status || 'active',
      next_of_kin_name || null, next_of_kin_phone || null,
      next_of_kin_relationship || null,
    ]
  );

  const student = rows[0];

  await recordStudentAudit({
    userId: actorId,
    action: 'student.created',
    entityId: student.id,
    changes: {
      admission_number: student.admission_number,
      course_id: course_id || null,
      status: status || 'active',
    },
  });

  return student;
}

async function updateStudent(id, data, actorId) {
  const {
    first_name, last_name, email, phone, date_of_birth, gender,
    national_id, address, course_id, status,
    next_of_kin_name, next_of_kin_phone, next_of_kin_relationship,
  } = data;

  const { rows } = await pool.query(
    `UPDATE students
        SET first_name = $1, last_name = $2, email = $3, phone = $4,
            date_of_birth = $5, gender = $6, national_id = $7,
            address = $8, course_id = $9, status = $10,
            next_of_kin_name = $11, next_of_kin_phone = $12,
            next_of_kin_relationship = $13,
            updated_at = NOW()
      WHERE id = $14 AND deleted_at IS NULL
      RETURNING id, admission_number`,
    [
      first_name, last_name,
      email || null, phone || null,
      date_of_birth || null, gender || null,
      national_id || null, address || null,
      course_id || null, status || 'active',
      next_of_kin_name || null, next_of_kin_phone || null,
      next_of_kin_relationship || null,
      id,
    ]
  );

  if (!rows[0]) return null;

  await recordStudentAudit({
    userId: actorId,
    action: 'student.updated',
    entityId: id,
    changes: { status: status || 'active', course_id: course_id || null },
  });

  return rows[0];
}

async function softDeleteStudent(id, actorId) {
  const { rows } = await pool.query(
    `UPDATE students
        SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id`,
    [id]
  );
  if (!rows[0]) return null;

  await recordStudentAudit({
    userId: actorId,
    action: 'student.soft_deleted',
    entityId: id,
    changes: { deleted: true },
  });

  return rows[0];
}

module.exports = {
  listCourses,
  listStudents,
  getStudentById,
  createStudent,
  updateStudent,
  softDeleteStudent,
};