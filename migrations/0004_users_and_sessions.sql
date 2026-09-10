-- 0004_users_and_sessions — the people, and the proof they signed in (gap H1).
--
-- Until now the product had no user authentication. The dashboard's sign-in
-- was a form that took a name, an email and a self-selected role and wrote
-- them to localStorage; every browser was then handed one shared API key
-- carrying read, write, lock and assess under a single hardcoded tenant, and
-- the X-Actor header that reached `lockedBy` and the audit chain was whatever
-- had been typed. The chain was cryptographically sound and attested to a
-- self-declared identity, which is not evidence.
--
-- Two tables, both in the shared partition ('_') because both are looked up
-- before an organisation is known: a login is by email, and a request is by
-- the token it presents. The owning organisation is carried inside the record
-- and lifted out by a generated column, exactly as api_keys does.
--
-- A session is a row, not a signed token. A signed token cannot be revoked
-- without a denylist, and "sign this person out now" is a control a bank will
-- ask for. The row holds a SHA-256 of the token; the token itself is only
-- ever in the client's hands, so a database read cannot impersonate anyone.

CREATE TABLE users (
  org_id       text NOT NULL,
  id           text NOT NULL,
  data         jsonb NOT NULL,
  email        text GENERATED ALWAYS AS (lower(data->>'email')) STORED,
  owner_org_id text GENERATED ALWAYS AS (data->>'orgId') STORED,
  role         text GENERATED ALWAYS AS (data->>'role') STORED,
  active       boolean GENERATED ALWAYS AS ((data->>'active')::boolean) STORED,
  version      integer NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id)
);

-- One account per email address, across the whole deployment. A check in code
-- cannot stop two sign-ups racing; this index can, which is the same reason
-- 0001 restates the locked-assessment rule in the database.
CREATE UNIQUE INDEX users_email_key ON users (email);
CREATE INDEX users_org_idx ON users (owner_org_id, active);

CREATE TABLE sessions (
  org_id       text NOT NULL,
  id           text NOT NULL,
  data         jsonb NOT NULL,
  user_id      text GENERATED ALWAYS AS (data->>'userId') STORED,
  owner_org_id text GENERATED ALWAYS AS (data->>'orgId') STORED,
  -- text, not timestamptz: casting text to timestamptz depends on the session
  -- TimeZone and is therefore STABLE, and PostgreSQL refuses a generated
  -- column that is not IMMUTABLE. Every timestamp written here is an ISO-8601
  -- instant in UTC from toISOString(), and those sort lexicographically in the
  -- same order they sort chronologically, so the index answers the same
  -- questions.
  expires_at   text GENERATED ALWAYS AS (data->>'expiresAt') STORED,
  version      integer NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id)
);

-- Signing every session out for one person, and sweeping what has expired,
-- are the two queries this table exists to answer quickly.
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expiry_idx ON sessions (expires_at);

-- Rate limiting has to be shared, or it is not a limit.
--
-- express-rate-limit's default store is a Map in one process. Production is a
-- Lambda that scales horizontally, so every container held its own counter and
-- the per-key limits were per-container — which matters most on the agent and
-- assess routes, because those front paid model calls and there was therefore
-- no effective ceiling on spend from an abused key.
--
-- One row per key per window. The window is part of the primary key, so a new
-- window is a new row and expiry is a delete rather than a reset.

CREATE TABLE rate_limits (
  bucket    text PRIMARY KEY,
  hits      integer NOT NULL DEFAULT 0,
  reset_at  timestamptz NOT NULL
);
CREATE INDEX rate_limits_expiry_idx ON rate_limits (reset_at);

-- down
DROP TABLE IF EXISTS rate_limits;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
