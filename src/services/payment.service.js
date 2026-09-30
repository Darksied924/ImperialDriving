/**
 * Payment service.
 * Schema-aligned against migrations 006 (payments + receipts + student_balances view)
 * and 014 (courses.min_first_deposit, receipt_counters).
 *
 * Design decisions (Phase 6):
 *   - A payment is always against a student. The course is derived via
 *     students.course_id. Payments do not carry a course_id of their own.
 *   - Balance is computed on read from the student_balances view. Never cached.
 *   - Soft-delete via payments.deleted_at. The view filters deleted rows out,
 *     so a voided payment removes itself from the balance automatically.
 *   - Overpayment is allowed. Balance can go negative — UI renders it as a credit.
 *   - First payment for a student must meet courses.min_first_deposit.
 *     Subsequent payments only emit a warning (route layer handles the warning).
 *   - Receipt number is generated inside the transaction using the atomic
 *     upsert in receiptNumber.js, so a failed insert rolls the counter back too.
 *   - payments.updated_at is owned by trg_payments_updated_at. Never set it.
 *   - Audit changes carry identifiers only — no phone numbers, no emails.
 */

const fs   = require('fs').promises;
const path = require('path');
const pool = require('../config/db');
const { recordAudit }         = require('../utils/audit');
const { generateReceiptNumber } = require('../utils/receiptNumber');

const PAYMENT_COLS = `
  id, student_id, receipt_number, amount, currency, payment_type,
  payment_method, reference, notes, paid_at, recorded_by, created_at
`;

/* ------------------------------------------------------------------ reads */

async function listPaymentsForStudent(studentId, { includeDeleted = false } = {}) {
  const where = includeDeleted
    ? 'WHERE student_id = $1'
    : 'WHERE student_id = $1 AND deleted_at IS NULL';
  const { rows } = await pool.query(
    `SELECT ${PAYMENT_COLS} FROM payments ${where}
      ORDER BY paid_at DESC, created_at DESC`,
    [studentId]
  );
  return rows;
}

async function listRecentPayments({ limit = 50, offset = 0 } = {}) {
  const { rows } = await pool.query(
    `SELECT p.id, p.receipt_number, p.amount, p.currency, p.payment_type,
            p.payment_method, p.reference, p.paid_at,
            s.id AS student_id, s.admission_number,
            s.first_name || ' ' || s.last_name AS student_name,
            c.code AS course_code, c.name AS course_name
       FROM payments p
       JOIN students s ON s.id = p.student_id
       LEFT JOIN courses c ON c.id = s.course_id
      WHERE p.deleted_at IS NULL
      ORDER BY p.paid_at DESC, p.created_at DESC
      LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

async function getPaymentById(id) {
  const { rows } = await pool.query(
    `SELECT p.*,
            s.admission_number, s.first_name, s.last_name, s.phone, s.email,
            c.code AS course_code, c.name AS course_name, c.total_fee,
            u.first_name AS recorder_first_name,
            u.last_name  AS recorder_last_name
       FROM payments p
       JOIN students s ON s.id = p.student_id
       LEFT JOIN courses c ON c.id = s.course_id
       LEFT JOIN users u ON u.id = p.recorded_by
      WHERE p.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function getStudentBalance(studentId) {
  const { rows } = await pool.query(
    `SELECT * FROM student_balances WHERE student_id = $1`,
    [studentId]
  );
  return rows[0] || null;
}

/* ----------------------------------------------------------------- create */

async function createPayment(data, actor) {
  const {
    studentId,
    amount,
    paymentType   = 'tuition',
    paymentMethod = 'cash',
    reference     = null,
    notes         = null,
    paidAt        = null,
  } = data;

  const ctx = (typeof actor === 'object' && actor !== null)
    ? actor
    : { userId: actor };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock the student row and pull course fee + min-deposit in one shot.
    //    FOR UPDATE OF s (not the nullable side of the LEFT JOIN) serializes
    //    concurrent payments for the same student, protecting the min-deposit
    //    first-payment check below from a race.
    const { rows: srows } = await client.query(
      `SELECT s.id, s.course_id, s.admission_number, s.first_name, s.last_name,
              s.phone, s.email, s.deleted_at,
              c.code AS course_code, c.name AS course_name,
              c.total_fee, c.currency, c.min_first_deposit
         FROM students s
         LEFT JOIN courses c ON c.id = s.course_id
        WHERE s.id = $1
        FOR UPDATE OF s`,
      [studentId]
    );
    const student = srows[0];
    if (!student || student.deleted_at) {
      const err = new Error('Student not found.');
      err.code = 'STUDENT_NOT_FOUND';
      throw err;
    }
    if (!student.course_id) {
      const err = new Error('Student has no course assigned — assign a course before recording payment.');
      err.code = 'NO_COURSE';
      throw err;
    }

    // 2. First-payment min-deposit check.
    const { rows: prows } = await client.query(
      `SELECT COUNT(*)::int AS n
         FROM payments
        WHERE student_id = $1 AND deleted_at IS NULL`,
      [studentId]
    );
    const isFirstPayment = prows[0].n === 0;
    const minFirst = Number(student.min_first_deposit) || 0;
    const amt      = Number(amount);
    if (isFirstPayment && amt < minFirst) {
      const err = new Error(
        `First payment for this course must be at least ` +
        `${student.currency} ${minFirst.toFixed(2)}.`
      );
      err.code = 'MIN_FIRST_DEPOSIT';
      err.minRequired = minFirst;
      throw err;
    }

    // 3. Atomic receipt number inside this tx.
    const receiptNumber = await generateReceiptNumber(client);

    // 4. Insert the payment. paid_at defaults to now() when not supplied.
    const currency = student.currency || 'KES';
    const { rows: insRows } = await client.query(
      `INSERT INTO payments
         (student_id, receipt_number, amount, currency, payment_type,
          payment_method, reference, notes, paid_at, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, now()), $10)
       RETURNING ${PAYMENT_COLS}`,
      [
        studentId, receiptNumber, amt, currency, paymentType,
        paymentMethod, reference, notes, paidAt, ctx.userId || null,
      ]
    );
    const payment = insRows[0];

    // 5. Receipts row. file_path is written after commit — see below.
    const relPath = path.posix.join('storage', 'receipts', `${receiptNumber}.html`);
    const { rows: rRows } = await client.query(
      `INSERT INTO receipts (payment_id, file_path)
       VALUES ($1, $2)
       RETURNING id, payment_id, file_path, created_at`,
      [payment.id, relPath]
    );
    const receipt = rRows[0];

    // 6. Audit inside the same tx. Identifiers only — no phone/email.
    await recordAudit(
      {
        userId: ctx.userId,
        action: 'payment.created',
        entityType: 'payment',
        entityId: payment.id,
        changes: {
          receipt_number: payment.receipt_number,
          student_id:     payment.student_id,
          amount:         payment.amount,
          currency:       payment.currency,
          payment_type:   payment.payment_type,
          payment_method: payment.payment_method,
        },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      },
      client
    );

    await client.query('COMMIT');

    // 7. Write the printable receipt file AFTER commit. The DB is the source
    //    of truth — a failed disk write logs but does not void the payment.
    //    The file can be regenerated later from the same rows.
    try {
      const html = renderReceiptHtml({ payment, student });
      const abs  = path.join(process.cwd(), relPath);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, html, 'utf8');
    } catch (fileErr) {
      console.error('[payment] receipt file write failed:', fileErr.message);
    }

    return { payment, receipt, student };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/* --------------------------------------------------------- soft delete */

async function softDeletePayment(id, actor) {
  const ctx = (typeof actor === 'object' && actor !== null)
    ? actor
    : { userId: actor };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE payments
          SET deleted_at = now()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, receipt_number, student_id, amount, currency`,
      [id]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    const p = rows[0];
    await recordAudit(
      {
        userId: ctx.userId,
        action: 'payment.voided',
        entityType: 'payment',
        entityId: p.id,
        changes: {
          receipt_number: p.receipt_number,
          amount:         p.amount,
          currency:       p.currency,
        },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      },
      client
    );
    await client.query('COMMIT');
    return p;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/* ---------------------------------------------------------- receipt HTML */

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function renderReceiptHtml({ payment, student }) {
  const amount = Number(payment.amount).toFixed(2);
  const when   = new Date(payment.paid_at).toLocaleString();
  const name   = `${student.first_name} ${student.last_name}`;
  const course = `${student.course_code} — ${student.course_name}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Receipt ${escHtml(payment.receipt_number)}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif;
         max-width: 640px; margin: 2rem auto; padding: 1rem; color: #111; }
  h1   { margin: 0 0 .25rem; font-size: 1.4rem; }
  .sub { color: #666; margin-bottom: 1rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  td   { padding: .45rem 0; border-bottom: 1px solid #eee; vertical-align: top; }
  td:first-child { color: #666; width: 40%; }
  .total { font-size: 1.5rem; font-weight: 700; margin-top: 1.25rem; }
  .no-print { margin-top: 2rem; }
  .no-print button, .no-print a {
    font: inherit; padding: .5rem 1rem; margin-right: .5rem;
    border: 1px solid #333; background: #fff; cursor: pointer;
    text-decoration: none; color: #111; border-radius: 4px;
  }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
<h1>Imperial Driving School</h1>
<div class="sub">Official Payment Receipt</div>
<table>
  <tr><td>Receipt No.</td><td><strong>${escHtml(payment.receipt_number)}</strong></td></tr>
  <tr><td>Date</td><td>${escHtml(when)}</td></tr>
  <tr><td>Student</td><td>${escHtml(name)}</td></tr>
  <tr><td>Admission No.</td><td>${escHtml(student.admission_number)}</td></tr>
  <tr><td>Course</td><td>${escHtml(course)}</td></tr>
  <tr><td>Payment Type</td><td>${escHtml(payment.payment_type)}</td></tr>
  <tr><td>Method</td><td>${escHtml(payment.payment_method)}</td></tr>
  ${payment.reference ? `<tr><td>Reference</td><td>${escHtml(payment.reference)}</td></tr>` : ''}
  ${payment.notes     ? `<tr><td>Notes</td><td>${escHtml(payment.notes)}</td></tr>`         : ''}
</table>
<div class="total">Amount: ${escHtml(payment.currency)} ${escHtml(amount)}</div>
<div class="no-print">
  <button onclick="window.print()">Print</button>
  <a href="javascript:history.back()">Back</a>
</div>
</body>
</html>`;
}

module.exports = {
  listPaymentsForStudent,
  listRecentPayments,
  getPaymentById,
  getStudentBalance,
  createPayment,
  softDeletePayment,
  renderReceiptHtml,
};
