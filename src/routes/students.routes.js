// src/routes/students.routes.js
const express = require('express');
const router = express.Router();

const { ensureAuthenticated, requireRole } = require('../middleware/auth');
const { validateNewStudent } = require('../middleware/validation');
const studentService = require('../services/student.service');
const paymentService = require('../services/payment.service');
const attendanceService = require('../services/attendance.service');

// Roles allowed to view/create students
const STAFF = ['reception', 'admin'];

// ─────────────────────────────────────────────────────────────────────────────
// GET /students — list
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/students',
  ensureAuthenticated,
  requireRole(...STAFF),
  async (req, res, next) => {
    try {
      const search = (req.query.q || '').trim();
      const students = await studentService.listStudents({ search });
      res.render('reception/students', {
        title: 'Students',
        user: req.user,
        students,
        search,
        active: 'students',
        basePath: req.baseUrl, // '/reception' or '/admin'
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /students/new — registration form
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/students/new',
  ensureAuthenticated,
  requireRole(...STAFF),
  async (req, res, next) => {
    try {
      const courses = await studentService.listCourses();
      res.render('reception/register-student', {
        title: 'Register Student',
        user: req.user,
        courses,
        errors: [],
        values: {},
        active: 'students',
        basePath: req.baseUrl,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /students — create
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/students',
  ensureAuthenticated,
  requireRole(...STAFF),
  async (req, res, next) => {
    const basePath = req.baseUrl; // '/reception' or '/admin'
    const errors = validateNewStudent(req.body);
    const courses = await studentService.listCourses().catch(() => []);

    // Validation failure — re-render form with preserved values.
    if (errors.length) {
      return res.status(400).render('reception/register-student', {
        title: 'Register Student',
        user: req.user,
        courses,
        errors,
        values: req.body,
        active: 'students',
        basePath,
      });
    }

    try {
      await studentService.createStudent(req.body, req.user.id);
      return res.redirect(`${basePath}/students`);
    } catch (err) {
      // Unique constraint violations (admission_number, national_id).
      if (err.code === '23505') {
        const which = err.constraint || '';
        let msg = 'A student with that value already exists.';
        if (which.includes('admission_number')) {
          msg = 'Admission number is already in use.';
        } else if (which.includes('national_id')) {
          msg = 'A student with that national ID already exists.';
        }
        return res.status(400).render('reception/register-student', {
          title: 'Register Student',
          user: req.user,
          courses,
          errors: [msg],
          values: req.body,
          active: 'students',
          basePath,
        });
      }

      // Invalid enum value or malformed UUID.
      if (err.code === '22P02' || err.code === '23514') {
        return res.status(400).render('reception/register-student', {
          title: 'Register Student',
          user: req.user,
          courses,
          errors: ['One of the selected values is not allowed.'],
          values: req.body,
          active: 'students',
          basePath,
        });
      }

      return next(err);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /students/:id — details
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/students/:id',
  ensureAuthenticated,
  requireRole(...STAFF),
  async (req, res, next) => {
    try {
      const student = await studentService.getStudentById(req.params.id);
      if (!student) return res.status(404).send('Student not found');

      const [balance, payments, attendance] = await Promise.all([
        paymentService.getStudentBalance(student.id),
        paymentService.listPaymentsForStudent(student.id),
        attendanceService.getStudentAttendance(student.id, { limit: 20 }),
      ]);

      res.render('reception/student-details', {
        title: `${student.first_name} ${student.last_name}`,
        user: req.user,
        student,
        balance,
        payments,
        attendance,
        active: 'students',
        basePath: req.baseUrl,
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;