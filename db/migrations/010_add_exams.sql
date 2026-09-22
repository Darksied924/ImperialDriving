
CREATE TABLE exams (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID NOT NULL REFERENCES students(id),
  exam_type    exam_type NOT NULL,
  scheduled_at TIMESTAMPTZ,
  taken_at     TIMESTAMPTZ,
  result       exam_result NOT NULL DEFAULT 'pending',
  score        NUMERIC(5,2) CHECK (score IS NULL OR (score BETWEEN 0 AND 100)),
  examiner     TEXT,
  location     TEXT,
  notes        TEXT,
  recorded_by  UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX exams_student_idx      ON exams (student_id);
CREATE INDEX exams_type_result_idx  ON exams (exam_type, result);

SELECT attach_updated_at('exams');

