
CREATE TABLE roles (
  id          SMALLSERIAL PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO roles (name, description) VALUES
  ('admin',      'System administrator'),
  ('reception',  'Front desk / reception staff'),
  ('instructor', 'Driving instructor'),
  ('student',    'Driving school student');

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         CITEXT,
  phone         TEXT,
  password_hash TEXT NOT NULL,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  role_id       SMALLINT NOT NULL REFERENCES roles(id),
  status        user_status NOT NULL DEFAULT 'active',
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE UNIQUE INDEX users_email_active_uniq
  ON users (email) WHERE deleted_at IS NULL AND email IS NOT NULL;
CREATE UNIQUE INDEX users_phone_active_uniq
  ON users (phone) WHERE deleted_at IS NULL AND phone IS NOT NULL;
CREATE INDEX users_role_idx ON users (role_id);

SELECT attach_updated_at('users');

