
CREATE TABLE practical_queue (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID NOT NULL REFERENCES students(id),
  session_id   UUID REFERENCES practical_sessions(id) ON DELETE SET NULL,
  position     INT,
  status       queue_status NOT NULL DEFAULT 'waiting',
  queued_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  called_at    TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes        TEXT
);

CREATE INDEX practical_queue_status_idx ON practical_queue (status);
CREATE INDEX practical_queue_queued_idx ON practical_queue (queued_at);

