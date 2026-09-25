/**
 * Authentication and authorization middleware.
 */

/**
 * Redirects unauthenticated users to the login page.
 */
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.redirect('/auth/login');
}

/**
 * Redirects already-authenticated users away from guest pages (e.g. login).
 */
function ensureGuest(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return res.redirect(dashboardFor(req.user.role));
  }
  next();
}

/**
 * Requires one of the given roles. Assumes ensureAuthenticated ran first,
 * but still guards in case it did not.
 */

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.redirect('/auth/login');
    }
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).send('Forbidden');
    }
    next();
  };
}



/**
 * Maps a role to its home dashboard.
 */
function dashboardFor(role) {
  switch (role) {
    case 'admin':     return '/admin/dashboard';
    case 'reception': return '/reception/dashboard';
    case 'student':   return '/students/dashboard';
    default:          return '/';
  }
}

module.exports = {
  ensureAuthenticated,
  ensureGuest,
  requireRole,
  dashboardFor,
};