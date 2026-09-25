/**
 * Simple form validation helpers.
 * Each validator returns an array of error strings (empty when valid).
 */

// Validate the admin "create staff user" form.
function validateNewUser(body) {
  const errors = [];

  const firstName = (body.first_name || '').trim();
  const lastName = (body.last_name || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';
  const role = (body.role || '').trim();
  const status = (body.status || 'active').trim();

  if (!firstName) errors.push('First name is required.');
  if (firstName.length > 100) errors.push('First name is too long.');

  if (!lastName) errors.push('Last name is required.');
  if (lastName.length > 100) errors.push('Last name is too long.');

  // Basic email shape check — not exhaustive, just a sanity gate.
  if (!email) {
    errors.push('Email is required.');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Email is not valid.');
  }

  if (!password) {
    errors.push('Password is required.');
  } else if (password.length < 8) {
    errors.push('Password must be at least 8 characters.');
  }

  // Only staff roles can be created here. Students are records, not users.
  const allowedRoles = ['admin', 'reception', 'instructor'];
  if (!allowedRoles.includes(role)) {
    errors.push('Role must be admin, reception, or instructor.');
  }

  const allowedStatuses = ['active', 'inactive', 'suspended'];
  if (!allowedStatuses.includes(status)) {
    errors.push('Status is not valid.');
  }

  return errors;
}

module.exports = { validateNewUser };