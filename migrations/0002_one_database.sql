-- 0002_one_database — everything the application persists, in the one
-- database the operator provisions.
--
-- Until now four kinds of record still lived only in Firebase: API keys,
-- Part C runs (an assessment that pauses for the client and resumes), the
-- learning records a run leaves behind, and the per-m² benchmarks derived
-- from them. A deployment on PostgreSQL therefore still needed Firebase for
-- its keys, which is not one database. These tables carry the same spine
-- as 0001 and are read through the same seam.
--
-- API keys are looked up by the hash of the key, not by organisation, so
-- they share one partition (org_id '_') and carry the owning organisation
-- inside the record; a generated column lifts it out for listing.

CREATE TABLE api_keys (
  org_id       text NOT NULL,
  id           text NOT NULL,
  data         jsonb NOT NULL,
  owner_org_id text GENERATED ALWAYS AS (data->>'orgId') STORED,
  active       boolean GENERATED ALWAYS AS ((data->>'active')::boolean) STORED,
  version      integer NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id)
);
CREATE INDEX api_keys_owner_idx ON api_keys (owner_org_id, active);

CREATE TABLE partc_runs (
  org_id      text NOT NULL,
  id          text NOT NULL,
  data        jsonb NOT NULL,
  status      text GENERATED ALWAYS AS (data->>'status') STORED,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id)
);
CREATE INDEX partc_runs_status_idx ON partc_runs (org_id, status, created_at);

CREATE TABLE partc_learnings (
  org_id      text NOT NULL,
  id          text NOT NULL,
  data        jsonb NOT NULL,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id)
);

CREATE TABLE partc_benchmarks (
  org_id       text NOT NULL,
  id           text NOT NULL,
  data         jsonb NOT NULL,
  region       text GENERATED ALWAYS AS (data->>'region') STORED,
  project_type text GENERATED ALWAYS AS (data->>'projectType') STORED,
  version      integer NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id)
);
CREATE INDEX partc_benchmarks_lookup_idx ON partc_benchmarks (org_id, region, project_type);

-- down
DROP TABLE IF EXISTS partc_benchmarks;
DROP TABLE IF EXISTS partc_learnings;
DROP TABLE IF EXISTS partc_runs;
DROP TABLE IF EXISTS api_keys;
