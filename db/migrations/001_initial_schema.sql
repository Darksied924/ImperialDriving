
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive text (emails)

-- ---------- Enums ----------
CREATE TYPE user_status       AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE student_status    AS ENUM ('active', 'completed', 'withdrawn', 'suspended');
CREATE TYPE gender_type       AS ENUM ('male', 'female', 'other');
CREATE TYPE transmission_type AS ENUM ('manual', 'automatic');
CREATE TYPE vehicle_status    AS ENUM ('available', 'in_use', 'maintenance', 'out_of_service');
CREATE TYPE payment_method    AS ENUM ('cash', 'mobile_money', 'bank_transfer', 'card', 'other');
CREATE TYPE payment_type      AS ENUM ('registration', 'tuition', 'practical', 'exam', 'other');
CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'late', 'excused');
CREATE TYPE session_status    AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');
CREATE TYPE queue_status      AS ENUM ('waiting', 'called', 'in_progress', 'completed', 'no_show', 'cancelled');
CREATE TYPE exam_type         AS ENUM ('theory', 'practical');
CREATE TYPE exam_result       AS ENUM ('pending', 'pass', 'fail', 'absent');

-- ---------- Helper functions ----------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION attach_updated_at(tbl TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON %1$I', tbl);
  EXECUTE format(
    'CREATE TRIGGER trg_%1$s_updated_at
       BEFORE UPDATE ON %1$I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()', tbl);
END;
$$ LANGUAGE plpgsql;

-- ---------- Settings (key/value config) ----------
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO settings (key, value, description) VALUES
  ('school.name',      '"Imperial Driving School"', 'Display name'),
  ('school.address',   '""',                        'Physical address'),
  ('school.phone',     '""',                        'Contact phone'),
  ('school.currency',  '"KES"',                     'Default currency code'),
  ('admission.prefix', '"IDS"',                     'Admission number prefix'),
  ('receipt.prefix',   '"RCP"',                     'Receipt number prefix');


-- ---------- Document number sequences ----------
-- Global monotonic receipt sequence (never resets)
CREATE SEQUENCE receipt_number_seq START 1;

-- Per-year admission counters
CREATE TABLE admission_counters (
  year       INT PRIMARY KEY,
  last_value INT NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION next_receipt_number()
RETURNS TEXT AS $$
  SELECT LPAD(nextval('receipt_number_seq')::TEXT, 7, '0');
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION next_admission_number(p_prefix TEXT DEFAULT 'IDS')
RETURNS TEXT AS $$
DECLARE
  v_year INT := EXTRACT(YEAR FROM now())::INT;
  v_next INT;
BEGIN
  INSERT INTO admission_counters (year, last_value)
  VALUES (v_year, 1)
  ON CONFLICT (year) DO UPDATE
    SET last_value = admission_counters.last_value + 1
  RETURNING last_value INTO v_next;

  RETURN p_prefix || '/' || v_year || '/' || LPAD(v_next::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

