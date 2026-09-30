/**
 * Courses admin routes.
 * Mounted at /admin/courses (see server.js). Admin-only.
 *
 * Follows the Phase 3/4 pattern: service → validation → views → audit.
 *
 * Validators return an array of error strings (see middleware/validation.js).
 * On validation failure we re-derive form state from req.body to preserve
 * what the admin typed. On success we build a typed payload for the service.
 *
 * Audit context is built by `actorFromReq(req)` and passed to the service so
 * ip_address / user_agent land in audit_logs.
 */

const express = require('express');
const router = express.Router();

const { ensureAuthenticated, requireRole } = require('../middleware/auth');
const {
  validateNewCourse,
  validateCourseUpdate,
} = require('../middleware/validation');
const courseService = require('../services/course.service');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => UUID_RE.test(v);

// Form state for re-render on validation failure — string-ish values that
// round-trip cleanly into the EJS form inputs.
function formStateFromBody(body = {}) {
  const s = (v) => (v == null ? '' : String(v).trim());
  return {
    code:            s(body.code).toUpperCase(),
    name:            s(body.name),
    description:     s(body.description),
    duration_weeks:  s(body.duration_weeks),
    theory_hours:    s(body.theory_hours),
    practical_hours: s(body.practical_hours),
    total_fee:       s(body.total_fee),
    currency:        (s(body.currency).toUpperCase()) || 'KES',
  };
}

// Typed payload for the service — numbers where numbers belong, nulls where
// blanks are allowed, DB defaults where the schema provides them.
function payloadFromBody(body = {}) {
  const s = formStateFromBody(body);
  const toNum = (v) => (v === '' ? null : Number(v));
  const toInt = (v) => (v === '' ? null : parseInt(v, 10));
  return {
    code:            s.code,
    name:            s.name,
    description:     s.description || null,
    duration_weeks:  toInt(s.duration_weeks),
    theory_hours:    toInt(s.theory_hours),
    practical_hours: toInt(s.practical_hours),
    total_fee:       s.total_fee === '' ? 0 : Number(s.total_fee),
    currency:        s.currency || 'KES',
  };
}

// Audit context passed to the service. The service's recordAudit call
// threads ip_address / user_agent into audit_logs.
function actorFromReq(req) {
  return {
    userId:    req.user.id,
    ipAddress: req.ip || null,
    userAgent: req.get('user-agent') || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Guards — apply to every route below.
// ─────────────────────────────────────────────────────────────────────────────

router.use(ensureAuthenticated, requireRole('admin'));

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/courses — list
// ─────────────────────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const showInactive = req.query.inactive === '1';
    const courses = await courseService.listCourses({ includeInactive: showInactive });

    res.render('admin/courses', {
      title: 'Courses',
      user: req.user,
      basePath: req.baseUrl,   // "/admin/courses"
      courses,
      showInactive,
      errors: [],
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/courses/new — create form
// ─────────────────────────────────────────────────────────────────────────────

router.get('/new', (req, res) => {
  res.render('admin/course-form', {
    title: 'New Course',
    user: req.user,
    basePath: req.baseUrl,
    mode: 'create',
    course: {
      code: '', name: '', description: '',
      duration_weeks: '', theory_hours: '', practical_hours: '',
      total_fee: '', currency: 'KES',
    },
    errors: [],
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/courses — create
// ─────────────────────────────────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
  const errors = validateNewCourse(req.body);

  if (errors.length) {
    return res.status(400).render('admin/course-form', {
      title: 'New Course',
      user: req.user,
      basePath: req.baseUrl,
      mode: 'create',
      course: formStateFromBody(req.body),
      errors,
    });
  }

  try {
    await courseService.createCourse(payloadFromBody(req.body), actorFromReq(req));
    res.redirect(req.baseUrl);
  } catch (err) {
    if (err.code === '23505') {
      const code = formStateFromBody(req.body).code;
      return res.status(400).render('admin/course-form', {
        title: 'New Course',
        user: req.user,
        basePath: req.baseUrl,
        mode: 'create',
        course: formStateFromBody(req.body),
        errors: [`A course with code "${code}" already exists.`],
      });
    }
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/courses/:id/edit — edit form
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:id/edit', async (req, res, next) => {
  if (!isUuid(req.params.id)) return res.status(404).send('Not Found');

  try {
    const course = await courseService.getCourseById(req.params.id);
    if (!course) return res.status(404).send('Not Found');

    res.render('admin/course-form', {
      title: `Edit ${course.code}`,
      user: req.user,
      basePath: req.baseUrl,
      mode: 'edit',
      course: {
        id:              course.id,
        code:            course.code,
        name:            course.name,
        description:     course.description || '',
        duration_weeks:  course.duration_weeks == null ? '' : String(course.duration_weeks),
        theory_hours:    course.theory_hours   == null ? '' : String(course.theory_hours),
        practical_hours: course.practical_hours == null ? '' : String(course.practical_hours),
        total_fee:       course.total_fee == null ? '' : String(course.total_fee),
        currency:        course.currency || 'KES',
      },
      errors: [],
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/courses/:id — update
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:id', async (req, res, next) => {
  if (!isUuid(req.params.id)) return res.status(404).send('Not Found');

  const errors = validateCourseUpdate(req.body);

  if (errors.length) {
    return res.status(400).render('admin/course-form', {
      title: 'Edit Course',
      user: req.user,
      basePath: req.baseUrl,
      mode: 'edit',
      course: { ...formStateFromBody(req.body), id: req.params.id },
      errors,
    });
  }

  try {
    const updated = await courseService.updateCourse(
      req.params.id,
      payloadFromBody(req.body),
      actorFromReq(req)
    );

    if (!updated) return res.status(404).send('Not Found');

    res.redirect(req.baseUrl);
  } catch (err) {
    if (err.code === '23505') {
      const code = formStateFromBody(req.body).code;
      return res.status(400).render('admin/course-form', {
        title: 'Edit Course',
        user: req.user,
        basePath: req.baseUrl,
        mode: 'edit',
        course: { ...formStateFromBody(req.body), id: req.params.id },
        errors: [`A course with code "${code}" already exists.`],
      });
    }
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /admin/courses/:id/toggle — activate / deactivate (soft-delete path)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:id/toggle', async (req, res, next) => {
  if (!isUuid(req.params.id)) return res.status(404).send('Not Found');

  try {
    const course = await courseService.getCourseById(req.params.id);
    if (!course) return res.status(404).send('Not Found');

    await courseService.setCourseActive(
      course.id,
      !course.is_active,
      actorFromReq(req)
    );

    res.redirect(req.baseUrl);
  } catch (err) {
    next(err);
  }
});

module.exports = router;