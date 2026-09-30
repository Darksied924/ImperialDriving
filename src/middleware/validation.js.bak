/**
 * Simple form validation helpers.
 * Each validator returns an array of error strings (empty when valid).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Admin staff-user creation
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// Student record creation
// ─────────────────────────────────────────────────────────────────────────────

// ⚠️ Confirm these match the actual Postgres enums:
//   psql "$DATABASE_URL" -c "SELECT unnest(enum_range(NULL::student_status));"
//   psql "$DATABASE_URL" -c "SELECT unnest(enum_range(NULL::gender_type));"
const STUDENT_STATUSES = ['active', 'completed', 'withdrawn','suspended'];
const GENDERS          = ['male', 'female', 'other'];

const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateNewStudent(body) {
  const errors = [];
  const b = body || {};

  const first = (b.first_name || '').trim();
  const last  = (b.last_name  || '').trim();
  const other = (b.other_names || '').trim();

  if (first.length < 2) {
    errors.push('First name is required (at least 2 characters).');
  } else if (first.length > 100) {
    errors.push('First name is too long.');
  }

  if (last.length < 2) {
    errors.push('Last name is required (at least 2 characters).');
  } else if (last.length > 100) {
    errors.push('Last name is too long.');
  }

  if (other && other.length > 100) {
    errors.push('Other names are too long.');
  }

  if (b.email && !EMAIL_RE.test(b.email.trim())) {
    errors.push('Student email is not valid.');
  }

  if (b.next_of_kin_email && !EMAIL_RE.test(b.next_of_kin_email.trim())) {
    errors.push('Next-of-kin email is not valid.');
  }

  if (!b.course_id || !UUID_RE.test(b.course_id)) {
    errors.push('A valid course is required.');
  }

  if (b.status && !STUDENT_STATUSES.includes(b.status)) {
    errors.push('Status is not valid.');
  }

  if (b.gender && !GENDERS.includes(b.gender)) {
    errors.push('Gender is not valid.');
  }

  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Course admin (create + edit)
// ─────────────────────────────────────────────────────────────────────────────
//
// Contract matches the other validators: returns an array of error strings.
// The route layer re-derives sanitized values from req.body on error.

const COURSE_CODE_RE = /^[A-Za-z0-9-]{1,10}$/;
const CURRENCY_RE    = /^[A-Z]{3}$/;

// Blank → null (field absent / not set).
// Non-numeric → { error: 'not a number' }.
// Negative    → { error: 'negative' }.
function parseNonNegNumber(raw) {
  const s = raw == null ? '' : String(raw).trim();
  if (s === '') return { value: null, error: null };
  const n = Number(s);
  if (!Number.isFinite(n)) return { value: null, error: 'not a number' };
  if (n < 0) return { value: null, error: 'negative' };
  return { value: n, error: null };
}

function parseNonNegInt(raw) {
  const s = raw == null ? '' : String(raw).trim();
  if (s === '') return { value: null, error: null };
  if (!/^\d+$/.test(s)) return { value: null, error: 'not an integer' };
  return { value: Number(s), error: null };
}

function validateNewCourse(body) {
  const errors = [];
  const b = body || {};

  const code        = (b.code || '').trim();
  const name        = (b.name || '').trim();
  const description = (b.description || '').trim();
  const currency    = (b.currency || '').trim().toUpperCase();

  if (!code) {
    errors.push('Course code is required.');
  } else if (!COURSE_CODE_RE.test(code)) {
    errors.push('Course code must be 1–10 characters: letters, digits, or hyphen.');
  }

  if (!name) {
    errors.push('Course name is required.');
  } else if (name.length > 100) {
    errors.push('Course name must be 100 characters or fewer.');
  }

  if (description && description.length > 500) {
    errors.push('Description must be 500 characters or fewer.');
  }

  const fee = parseNonNegNumber(b.total_fee);
  if (fee.error === 'not a number') {
    errors.push('Total fee must be a number.');
  } else if (fee.error === 'negative') {
    errors.push('Total fee cannot be negative.');
  }

  const dur = parseNonNegInt(b.duration_weeks);
  if (dur.error) errors.push('Duration (weeks) must be a non-negative whole number.');

  const th = parseNonNegInt(b.theory_hours);
  if (th.error) errors.push('Theory hours must be a non-negative whole number.');

  const ph = parseNonNegInt(b.practical_hours);
  if (ph.error) errors.push('Practical hours must be a non-negative whole number.');

  if (currency && !CURRENCY_RE.test(currency)) {
    errors.push('Currency must be a 3-letter code (e.g. KES, USD).');
  }

  return errors;
}

function validateCourseUpdate(body) {
  return validateNewCourse(body);
}

module.exports = {
  validateNewUser,
  validateNewStudent,
  validateNewCourse,
  validateCourseUpdate,
};