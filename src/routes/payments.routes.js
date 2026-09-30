// src/routes/payments.routes.js
//
// Dual-mounted at /reception and /admin (same pattern as students.routes.js).
//   /reception/payments/... and /admin/payments/...
// basePath is req.baseUrl so all redirects stay within the mounted prefix.
//
// 6 routes:
//   GET  /payments              list recent
//   GET  /payments/new          record-payment form
//   POST /payments              create (validate → service → redirect)
//   GET  /payments/:id          detail (with student balance)
//   GET  /payments/:id/receipt  printable HTML (live-rendered, DB source of truth)
//   POST /payments/:id/void     soft-delete (audited as payment.voided)
//
// All routes guarded: ensureAuthenticated + requireRole('reception','admin').
// UUID guards on :id prevent 22P02 from malformed IDs.
// actorFromReq(req) threads ip_address / user_agent into every audit row.

const express = require('express');
const router = express.Router();

const { ensureAuthenticated, requireRole } = require('../middleware/auth');
const { validateNewPayment }               = require('../middleware/validation');
const paymentService = require('../services/payment.service');
const studentService = require('../services/student.service');

const STAFF = ['reception', 'admin'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => UUID_RE.test(v);

function actorFromReq(req) {
  return {
    userId:    req.user.id,
    ipAddress: req.ip || null,
    userAgent: req.get('user-agent') || null,
  };
}

// Form values for re-render on validation failure.
function formStateFromBody(body = {}) {
  const s = (v) => (v == null ? '' : String(v).trim());
  return {
    student_id:     s(body.student_id),
    amount:         s(body.amount),
    payment_type:   s(body.payment_type)   || 'tuition',
    payment_method: s(body.payment_method) || 'cash',
    reference:      s(body.reference),
    notes:          s(body.notes),
    paid_at:        s(body.paid_at),
  };
}

// Typed payload for the service.
function payloadFromBody(body = {}) {
  const s = formStateFromBody(body);
  return {
    studentId:     s.student_id,
    amount:        Number(s.amount),
    paymentType:   s.payment_type,
    paymentMethod: s.payment_method,
    reference:     s.reference || null,
    notes:         s.notes || null,
    paidAt:        s.paid_at || null,
  };
}

// ── Guards apply to every route below ──────────────────────────────────────
router.use(ensureAuthenticated, requireRole(...STAFF));

// ── GET /payments — list ───────────────────────────────────────────────────
router.get('/payments', async (req, res, next) => {
  try {
    const payments = await paymentService.listRecentPayments({ limit: 100 });
    res.render('reception/payments', {
      title: 'Payments',
      user: req.user,
      basePath: req.baseUrl,
      payments,
      active: 'payments',
    });
  } catch (err) { next(err); }
});

// ── GET /payments/new — form ───────────────────────────────────────────────
router.get('/payments/new', async (req, res, next) => {
  try {
    const students = await studentService.listStudents({});
    const preStudentId = req.query.student_id && isUuid(req.query.student_id)
      ? req.query.student_id
      : '';
    res.render('reception/payment-form', {
      title: 'Record Payment',
      user: req.user,
      basePath: req.baseUrl,
      students,
      errors: [],
      values: {
        student_id:     preStudentId,
        amount:         '',
        payment_type:   'tuition',
        payment_method: 'cash',
        reference:      '',
        notes:          '',
        paid_at:        '',
      },
      active: 'payments',
    });
  } catch (err) { next(err); }
});

// ── POST /payments — create ────────────────────────────────────────────────
router.post('/payments', async (req, res, next) => {
  const errors = validateNewPayment(req.body);

  if (errors.length) {
    const students = await studentService.listStudents({}).catch(() => []);
    return res.status(400).render('reception/payment-form', {
      title: 'Record Payment',
      user: req.user,
      basePath: req.baseUrl,
      students,
      errors,
      values: formStateFromBody(req.body),
      active: 'payments',
    });
  }

  try {
    const out = await paymentService.createPayment(
      payloadFromBody(req.body),
      actorFromReq(req)
    );
    return res.redirect(`${req.baseUrl}/payments/${out.payment.id}`);
  } catch (err) {
    // Domain-level failures surfaced by the service — render form with message.
    if (
      err.code === 'STUDENT_NOT_FOUND' ||
      err.code === 'NO_COURSE'         ||
      err.code === 'MIN_FIRST_DEPOSIT' ||
      err.code === '23514'             ||   // check constraint (amount > 0)
      err.code === '22P02'                   // invalid enum / uuid at DB level
    ) {
      const students = await studentService.listStudents({}).catch(() => []);
      return res.status(400).render('reception/payment-form', {
        title: 'Record Payment',
        user: req.user,
        basePath: req.baseUrl,
        students,
        errors: [err.message || 'One of the selected values is not allowed.'],
        values: formStateFromBody(req.body),
        active: 'payments',
      });
    }
    return next(err);
  }
});

// ── GET /payments/:id — detail ─────────────────────────────────────────────
router.get('/payments/:id', async (req, res, next) => {
  if (!isUuid(req.params.id)) return res.status(404).send('Not Found');
  try {
    const payment = await paymentService.getPaymentById(req.params.id);
    if (!payment) return res.status(404).send('Not Found');
    const balance = await paymentService.getStudentBalance(payment.student_id);
    res.render('reception/payment-details', {
      title: `Receipt ${payment.receipt_number}`,
      user: req.user,
      basePath: req.baseUrl,
      payment,
      balance,
      active: 'payments',
    });
  } catch (err) { next(err); }
});

// ── GET /payments/:id/receipt — printable ──────────────────────────────────
// Live-rendered from the DB row. The file on disk under storage/receipts/ is
// the archival copy; this endpoint is the always-current view.
router.get('/payments/:id/receipt', async (req, res, next) => {
  if (!isUuid(req.params.id)) return res.status(404).send('Not Found');
  try {
    const payment = await paymentService.getPaymentById(req.params.id);
    if (!payment) return res.status(404).send('Not Found');
    // getPaymentById joins student fields onto the payment row, so we can
    // pass it as both `payment` and `student` — renderReceiptHtml reads only
    // the fields it needs from each.
    const html = paymentService.renderReceiptHtml({ payment, student: payment });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) { next(err); }
});

// ── POST /payments/:id/void — soft-delete ──────────────────────────────────
router.post('/payments/:id/void', async (req, res, next) => {
  if (!isUuid(req.params.id)) return res.status(404).send('Not Found');
  try {
    const voided = await paymentService.softDeletePayment(
      req.params.id,
      actorFromReq(req)
    );
    if (!voided) return res.status(404).send('Not Found');
    res.redirect(`${req.baseUrl}/payments`);
  } catch (err) { next(err); }
});

module.exports = router;
