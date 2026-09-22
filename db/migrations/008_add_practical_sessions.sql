CREATE TABLE practical_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        UUID NOT NULL REFERENCES students(id),
  vehicle_id        UUID REFERENCES vehicles(id),
  scheduled_at      TIMESTAMPTZ,
  started_at        TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ,
  duration_minutes  INT CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
  status            session_status NOT NULL DEFAULT 'scheduled',
  route             TEXT,
  mileage_start     NUMERIC(10,2),
  mileage_end       NUMERIC(10,2),
  performance_notes TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX practical_sessions_student_idx    ON practical_sessions (student_id);
CREATE INDEX practical_sessions_vehicle_idx    ON practical_sessions (vehicle_id);
CREATE INDEX practical_sessions_scheduled_idx  ON practical_sessions (scheduled_at);

SELECT attach_updated_at('practical_sessions');
