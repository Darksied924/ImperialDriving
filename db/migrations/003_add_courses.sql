
CREATE TABLE courses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT UNIQUE NOT NULL,      -- e.g. 'B', 'C', 'A'
  name            TEXT NOT NULL,             -- e.g. 'Class B — Light Vehicle'
  description     TEXT,
  duration_weeks  INT,
  theory_hours    INT,
  practical_hours INT,
  total_fee       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_fee >= 0),
  currency        TEXT NOT NULL DEFAULT 'KES',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

SELECT attach_updated_at('courses');

