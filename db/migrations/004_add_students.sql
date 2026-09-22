
CREATE TABLE students (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  admission_number TEXT UNIQUE NOT NULL,
  first_name       TEXT NOT NULL,
  last_name        TEXT NOT NULL,
  other_names      TEXT,
  date_of_birth    DATE,
  gender           gender_type,
  national_id      TEXT,
  email            CITEXT,
  phone            TEXT,
  address          TEXT,
  next_of_kin_name         TEXT,
  next_of_kin_relationship TEXT,      -- 'parent', 'spouse', 'sibling', 'guardian', ...
  next_of_kin_phone        TEXT,
  next_of_kin_email        CITEXT,
  next_of_kin_address      TEXT,
  city             TEXT,
  passport_photo   TEXT,                       -- path under storage/uploads/students/
  course_id        UUID REFERENCES courses(id),
  status           student_status NOT NULL DEFAULT 'active',
  enrollment_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_at     TIMESTAMPTZ,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

CREATE INDEX students_course_idx ON students (course_id);
CREATE INDEX students_status_idx ON students (status);
CREATE INDEX students_name_idx   ON students (last_name, first_name);
CREATE UNIQUE INDEX students_national_id_uniq
  ON students (national_id)
  WHERE national_id IS NOT NULL AND deleted_at IS NULL;

SELECT attach_updated_at('students');

