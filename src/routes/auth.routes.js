/**
 * Authentication routes: login, logout, current user.
 */

const express = require('express');
const passport = require('../config/passport');
const authService = require('../services/auth.service');
const {
  ensureGuest,
  ensureAuthenticated,
  dashboardFor,
} = require('../middleware/auth');

const router = express.Router();

// GET /auth/login — render login form.
router.get('/login', ensureGuest, (req, res) => {
  res.render('auth/login', {
    title: 'Sign in',
    error: null,
    email: '',
  });
});

// POST /auth/login — authenticate and redirect by role.
router.post('/login', ensureGuest, (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);

    if (!user) {
      return res.status(401).render('auth/login', {
        title: 'Sign in',
        error: (info && info.message) || 'Invalid email or password.',
        email: req.body.email || '',
      });
    }

    // Regenerate the session to prevent session fixation.
    req.session.regenerate((regenErr) => {
      if (regenErr) return next(regenErr);

      req.logIn(user, async (loginErr) => {
        if (loginErr) return next(loginErr);

        // Best-effort audit. Never blocks login.
        await authService.recordLoginAudit({
          userId: user.id,
          ip: req.ip,
          userAgent: req.get('user-agent') || null,
        });

        return res.redirect(dashboardFor(user.role));
      });
    });
  })(req, res, next);
});

// POST /auth/logout — destroy session and return to login.
router.post('/logout', ensureAuthenticated, (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);

    req.session.destroy((destroyErr) => {
      if (destroyErr) return next(destroyErr);
      res.clearCookie('imperial.sid');
      res.redirect('/auth/login');
    });
  });
});

// GET /auth/me — JSON view of the current user (useful for debugging).
router.get('/me', (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ user: null });
  }
  res.json({ user: req.user });
});

module.exports = router;