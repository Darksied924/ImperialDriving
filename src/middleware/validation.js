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

// ─────────────────────────────────────────────────────────────────────────────
// Payments (create)
// ─────────────────────────────────────────────────────────────────────────────
//
// Field names mirror the payments schema and the form posts snake_case.
// Enum whitelists reflect the LIVE database enums — verified via:
//   SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
//    WHERE t.typname='payment_type'   ORDER BY enumsortorder;
//   SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
//    WHERE t.typname='payment_method' ORDER BY enumsortorder;
// If the DB enums change, update these arrays in the same commit.

const PAYMENT_TYPES   = ['registration', 'tuition', 'practical', 'exam', 'other'];
const PAYMENT_METHODS = ['cash', 'mobile_money', 'bank_transfer', 'card', 'other'];

// Methods that must carry a reference (M-Pesa code, bank ref, card auth no., etc.)
const METHODS_REQUIRING_REFERENCE = ['mobile_money', 'bank_transfer'];

// Amount: required, positive, max 2 decimal places, sane upper bound.
const AMOUNT_RE      = /^\d+(\.\d{1,2})?$/;
const AMOUNT_MAX     = 1_000_000_000;   // 1 billion — protective bound, not a business limit

function validateNewPayment(body) {
  const errors = [];
  const b = body || {};

  // Student
  const studentId = (b.student_id || '').trim();
  if (!studentId) {
    errors.push('Student is required.');
  } else if (!UUID_RE.test(studentId)) {
    errors.push('Student selection is invalid.');
  }

  // Amount
  const amountRaw = b.amount == null ? '' : String(b.amount).trim();
  if (amountRaw === '') {
    errors.push('Amount is required.');
  } else if (!AMOUNT_RE.test(amountRaw)) {
    errors.push('Amount must be a positive number with at most 2 decimal places.');
  } else {
    const n = Number(amountRaw);
    if (!(n > 0)) {
      errors.push('Amount must be greater than zero.');
    } else if (n > AMOUNT_MAX) {
      errors.push('Amount is unreasonably large.');
    }
  }

  // Payment type
  const paymentType = (b.payment_type || '').trim();
  if (!paymentType) {
    errors.push('Payment type is required.');
  } else if (!PAYMENT_TYPES.includes(paymentType)) {
    errors.push('Payment type is not valid.');
  }

  // Payment method
  const paymentMethod = (b.payment_method || '').trim();
  if (!paymentMethod) {
    errors.push('Payment method is required.');
  } else if (!PAYMENT_METHODS.includes(paymentMethod)) {
    errors.push('Payment method is not valid.');
  }

  // Reference — conditionally required
  const reference = (b.reference || '').trim();
  if (reference.length > 100) {
    errors.push('Reference must be 100 characters or fewer.');
  }
  if (
    METHODS_REQUIRING_REFERENCE.includes(paymentMethod) &&
    reference.length === 0
  ) {
    errors.push(
      paymentMethod === 'mobile_money'
        ? 'Reference (e.g. M-Pesa code) is required for mobile money payments.'
        : 'Reference (e.g. bank slip no.) is required for bank transfer payments.'
    );
  }

  // Notes
  const notes = (b.notes || '').trim();
  if (notes.length > 500) {
    errors.push('Notes must be 500 characters or fewer.');
  }

  // Paid-at — optional; must parse; must not be in the future (60s skew tolerance)
  const paidAtRaw = (b.paid_at || '').trim();
  if (paidAtRaw) {
    const ts = Date.parse(paidAtRaw);
    if (Number.isNaN(ts)) {
      errors.push('Paid-at date is not valid.');
    } else if (ts > Date.now() + 60_000) {
      errors.push('Paid-at date cannot be in the future.');
    }
  }

  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// Theory sessions (create) — Phase 7
// ─────────────────────────────────────────────────────────────────────────────
//
// Field names mirror theory_sessions and the form posts snake_case.
// Enum whitelist reflects the LIVE enum (verified via psql):
//   session_status = scheduled | in_progress | completed | cancelled

const SESSION_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled'];

function validateNewSession(body) {
  const errors = [];
  const b = body || {};

  // Topic
  const topic = (b.topic || '').trim();
  if (!topic) {
    errors.push('Topic is required.');
  } else if (topic.length > 200) {
    errors.push('Topic must be 200 characters or fewer.');
  }

  // Instructor (optional)
  const instructorId = (b.instructor_id || '').trim();
  if (instructorId && !UUID_RE.test(instructorId)) {
    errors.push('Instructor selection is invalid.');
  }

  // Scheduled at (required)
  const scheduledRaw = (b.scheduled_at || '').trim();
  if (!scheduledRaw) {
    errors.push('Scheduled date/time is required.');
  } else if (Number.isNaN(Date.parse(scheduledRaw))) {
    errors.push('Scheduled date/time is not valid.');
  }

  // Duration (positive integer)
  const durRaw = (b.duration_minutes == null ? '' : String(b.duration_minutes)).trim();
  if (durRaw === '') {
    errors.push('Duration (minutes) is required.');
  } else if (!/^\d+$/.test(durRaw) || Number(durRaw) <= 0) {
    errors.push('Duration must be a positive whole number.');
  }

  // Location (optional)
  const location = (b.location || '').trim();
  if (location.length > 200) {
    errors.push('Location must be 200 characters or fewer.');
  }

  // Status (optional — DB default 'scheduled')
  const status = (b.status || '').trim();
  if (status && !SESSION_STATUSES.includes(status)) {
    errors.push('Session status is not valid.');
  }

  // Notes (optional)
  const notes = (b.notes || '').trim();
  if (notes.length > 500) {
    errors.push('Notes must be 500 characters or fewer.');
  }

  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// Vehicles (create + edit) — Phase 8
// ─────────────────────────────────────────────────────────────────────────────
//
// Field names mirror the vehicles schema (migration 005) and the form posts
// snake_case. Enums reflect the LIVE DB:
//   vehicle_status    = available | in_use | maintenance | out_of_service
//   transmission_type = manual    | automatic
// `year` has CHECK 1950..2100 in the DB; validated again here.
// `registration_number` is UNIQUE — a duplicate surfaces as 23505 and is
// handled by the route layer.

const VEHICLE_STATUSES   = ['available', 'in_use', 'maintenance', 'out_of_service'];
const TRANSMISSION_TYPES = ['manual', 'automatic'];

// Plates are alphanumeric with optional spaces / hyphens (e.g. "KDA 123A").
const REGISTRATION_RE = /^[A-Za-z0-9][A-Za-z0-9 -]{0,19}$/;

function validateNewVehicle(body) {
  const errors = [];
  const b = body || {};

  const reg = (b.registration_number || '').trim();
  if (!reg) {
    errors.push('Registration number is required.');
  } else if (!REGISTRATION_RE.test(reg)) {
    errors.push('Registration number must be 1–20 characters: letters, digits, spaces, or hyphens.');
  }

  const make = (b.make || '').trim();
  if (make.length > 100) errors.push('Make must be 100 characters or fewer.');

  const model = (b.model || '').trim();
  if (model.length > 100) errors.push('Model must be 100 characters or fewer.');

  const yearRaw = (b.year == null ? '' : String(b.year)).trim();
  if (yearRaw !== '') {
    if (!/^\d{4}$/.test(yearRaw)) {
      errors.push('Year must be a 4-digit number.');
    } else {
      const y = Number(yearRaw);
      if (y < 1950 || y > 2100) {
        errors.push('Year must be between 1950 and 2100.');
      }
    }
  }

  const color = (b.color || '').trim();
  if (color.length > 50) errors.push('Color must be 50 characters or fewer.');

  const trans = (b.transmission || '').trim();
  if (trans && !TRANSMISSION_TYPES.includes(trans)) {
    errors.push('Transmission must be manual or automatic.');
  }

  const status = (b.status || '').trim();
  if (status && !VEHICLE_STATUSES.includes(status)) {
    errors.push('Vehicle status is not valid.');
  }

  const notes = (b.notes || '').trim();
  if (notes.length > 500) errors.push('Notes must be 500 characters or fewer.');

  return errors;
}

function validateVehicleUpdate(body) {
  return validateNewVehicle(body);
}

module.exports = {
  validateNewUser,
  validateNewStudent,
  validateNewCourse,
  validateCourseUpdate,
  validateNewPayment,
  validateNewSession,
  validateNewVehicle,
  validateVehicleUpdate,
};