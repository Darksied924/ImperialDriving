
CREATE TABLE theory_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic            TEXT NOT NULL,
  instructor_id    UUID REFERENCES users(id),
  scheduled_at     TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  location         TEXT,
  status           session_status NOT NULL DEFAULT 'scheduled',
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX theory_sessions_scheduled_idx ON theory_sessions (scheduled_at);

SELECT attach_updated_at('theory_sessions');

CREATE TABLE theory_attendance (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES theory_sessions(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status      attendance_status NOT NULL DEFAULT 'present',
  notes       TEXT,
  recorded_by UUID REFERENCES users(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);

CREATE INDEX theory_attendance_student_idx ON theory_attendance (student_id);

