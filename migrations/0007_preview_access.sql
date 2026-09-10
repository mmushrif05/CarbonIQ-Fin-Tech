-- 0007 — preview access: who asked to see the product.
--
-- A visitor is admitted to the sample book by typing an email address into a
-- public form. Two things have to be recorded, and they are deliberately two
-- rows in two tables rather than one.
--
-- `users` gets an ordinary account, role `viewer`, in the shared preview
-- organisation. It is an ordinary account on purpose: the same door, the same
-- session table, the same scope resolution as every other request, so there is
-- no second identity path to reason about and no route that has to know a
-- preview session from a real one.
--
-- `preview_signups` is the other half, and it is not the account. It is the
-- register of who has asked — first seen, last seen, how many times — which is
-- what a product team reads to build a requirement list. Deleting the account
-- (an expired window, a visitor who asked to be removed from the product
-- mailing) must not erase the fact that the question was asked, and keeping
-- both facts in one row would mean it did.
--
-- One partition ('_'), like api_keys and users: a signup is looked up by
-- address, before any organisation is known.

CREATE TABLE preview_signups (
  org_id      text NOT NULL,
  id          text NOT NULL,
  data        jsonb NOT NULL,
  email       text GENERATED ALWAYS AS (data->>'email') STORED,
  -- text, not timestamptz, and the reason is not style. A cast from text to
  -- timestamptz reads the session's TimeZone, so it is not immutable, and
  -- PostgreSQL refuses it in a generation expression outright: "generation
  -- expression is not immutable". Every instant this application stores is an
  -- ISO-8601 UTC string, which sorts correctly as text, so the column that
  -- would have needed the cast does not need it. `sessions.expires_at` in
  -- 0004 is text for the same reason.
  first_seen  text GENERATED ALWAYS AS (data->>'firstSeenAt') STORED,
  last_seen   text GENERATED ALWAYS AS (data->>'lastSeenAt') STORED,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id)
);

-- One row per address, said in the database and not only in code. The service
-- reads by address and updates in place; without this a visitor who pressed
-- the button twice in the same second would become two entries in the register
-- and be counted as two people who asked.
CREATE UNIQUE INDEX preview_signups_email_idx ON preview_signups (email);

-- The register is read newest first, which is the only way it is ever read.
CREATE INDEX preview_signups_last_seen_idx ON preview_signups (last_seen DESC);

-- down
DROP TABLE IF EXISTS preview_signups;
