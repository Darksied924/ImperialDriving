
CREATE TABLE audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,              -- 'create', 'update', 'delete', 'login', ...
  entity_type TEXT NOT NULL,              -- 'student', 'payment', 'user', ...
  entity_id   TEXT,
  changes     JSONB,                      -- { before: {...}, after: {...} }
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_user_idx    ON audit_logs (user_id);
CREATE INDEX audit_logs_entity_idx  ON audit_logs (entity_type, entity_id);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);

