CREATE TABLE IF NOT EXISTS user_sessions (
  sid varchar NOT NULL COLLATE "default",
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
);

ALTER TABLE user_sessions
  DROP CONSTRAINT IF EXISTS user_sessions_pkey;

ALTER TABLE user_sessions
  ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX IF NOT EXISTS idx_user_sessions_expire
  ON user_sessions(expire);