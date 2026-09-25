/**
 * Admin routes — staff user management.
 * Mounted at /admin in server.js.
 * Every route here requires login + the admin role.
 */

const express = require('express');
const router = express.Router();

const authService = require('../services/auth.service');
const { ensureAuthenticated, requireRole } = require('../middleware/auth');
const { validateNewUser } = require('../middleware/validation');

// Apply guards to every route in this router.
router.use(ensureAuthenticated, requireRole('admin'));

/**
 * Helper — build the values object used to re-populate the form
 * after a validation error. Keeps the three render calls consistent.
 */
function formValues(body) {
  return {
    first_name: body.first_name || '',
    last_name: body.last_name || '',
    email: body.email || '',
    role: body.role || 'reception',
    status: body.status || 'active',
  };
}

/**
 * GET /admin/users
 * List all staff users.
 */
router.get('/users', async (req, res, next) => {
  try {
    const users = await authService.listUsers();
    res.render('admin/users', {
      title: 'Staff Users',
      users,
      user: req.user,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin/users/new
 * Show the create-user form with empty defaults.
 */
router.get('/users/new', (req, res) => {
  res.render('admin/user-form', {
    title: 'New Staff User',
    errors: [],
    values: {
      first_name: '',
      last_name: '',
      email: '',
      role: 'reception',
      status: 'active',
    },
    user: req.user,
  });
});

/**
 * POST /admin/users
 * Create a new staff user.
 */
router.post('/users', async (req, res, next) => {
  const errors = validateNewUser(req.body);

  // Re-render with errors and preserved values.
  if (errors.length > 0) {
    return res.status(400).render('admin/user-form', {
      title: 'New Staff User',
      errors,
      values: formValues(req.body),
      user: req.user,
    });
  }

  try {
    const created = await authService.createUser({
      firstName: req.body.first_name.trim(),
      lastName: req.body.last_name.trim(),
      email: req.body.email.trim().toLowerCase(),
      password: req.body.password,
      role: req.body.role.trim(),
      status: (req.body.status || 'active').trim(),
    });

    // Best-effort audit — never blocks the response on failure.
    await authService.recordAudit({
      userId: req.user.id,
      action: 'user.created',
      entityType: 'user',
      entityId: created.id,
      changes: { role: created.role, status: created.status },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || null,
    });

    return res.redirect('/admin/users');
  } catch (err) {
    // Handle known service errors, otherwise pass to the error handler.
    if (err.code === 'DUPLICATE_EMAIL') {
      return res.status(400).render('admin/user-form', {
        title: 'New Staff User',
        errors: ['A user with that email already exists.'],
        values: formValues(req.body),
        user: req.user,
      });
    }
    if (err.code === 'UNKNOWN_ROLE') {
      return res.status(400).render('admin/user-form', {
        title: 'New Staff User',
        errors: ['That role does not exist.'],
        values: formValues(req.body),
        user: req.user,
      });
    }
    return next(err);
  }
});

module.exports = router;