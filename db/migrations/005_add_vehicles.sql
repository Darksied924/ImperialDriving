
CREATE TABLE vehicles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_number TEXT UNIQUE NOT NULL,
  make                TEXT,
  model               TEXT,
  year                INT CHECK (year IS NULL OR year BETWEEN 1950 AND 2100),
  color               TEXT,
  transmission        transmission_type,
  status              vehicle_status NOT NULL DEFAULT 'available',
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX vehicles_status_idx ON vehicles (status);

SELECT attach_updated_at('vehicles');

