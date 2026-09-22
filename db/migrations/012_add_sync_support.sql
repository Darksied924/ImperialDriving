
CREATE TABLE sync_devices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_name  TEXT NOT NULL,
  device_token TEXT UNIQUE NOT NULL,
  last_seen_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only log of changes that need to be pushed to other devices.
CREATE TABLE sync_changes (
  id          BIGSERIAL PRIMARY KEY,
  device_id   UUID REFERENCES sync_devices(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  operation   TEXT NOT NULL CHECK (operation IN ('insert','update','delete')),
  payload     JSONB,
  applied_at  TIMESTAMPTZ,                    -- null = pending
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sync_changes_applied_idx ON sync_changes (applied_at);
CREATE INDEX sync_changes_entity_idx  ON sync_changes (entity_type, entity_id);

