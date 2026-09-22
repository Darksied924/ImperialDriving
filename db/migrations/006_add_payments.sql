
CREATE TABLE payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID NOT NULL REFERENCES students(id),
  receipt_number TEXT UNIQUE NOT NULL,
  amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency       TEXT NOT NULL DEFAULT 'KES',
  payment_type   payment_type   NOT NULL DEFAULT 'tuition',
  payment_method payment_method NOT NULL DEFAULT 'cash',
  reference      TEXT,                        -- M-Pesa code, cheque no., etc.
  notes          TEXT,
  paid_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by    UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);

CREATE INDEX payments_student_idx ON payments (student_id);
CREATE INDEX payments_paid_at_idx ON payments (paid_at);

SELECT attach_updated_at('payments');

CREATE TABLE receipts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  file_path  TEXT,                            -- path under storage/receipts/
  printed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Balances view — now that payments exists
CREATE VIEW student_balances AS
SELECT
  s.id                                                            AS student_id,
  s.admission_number,
  s.first_name || ' ' || s.last_name                              AS student_name,
  s.course_id,
  COALESCE(c.total_fee, 0)                                        AS total_fee,
  COALESCE(SUM(p.amount) FILTER (WHERE p.deleted_at IS NULL), 0)  AS total_paid,
  COALESCE(c.total_fee, 0)
    - COALESCE(SUM(p.amount) FILTER (WHERE p.deleted_at IS NULL), 0) AS balance
FROM students s
LEFT JOIN courses  c ON c.id = s.course_id
LEFT JOIN payments p ON p.student_id = s.id
WHERE s.deleted_at IS NULL
GROUP BY s.id, c.total_fee;

