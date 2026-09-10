-- 0005 — the lending records join the one database.
--
-- Five record types were written straight to Firebase through
-- `src/platform/bridge/firebase.js`, past the storage seam: lending projects,
-- their annual monitoring entries, agent runs, supervisor pipeline runs and
-- webhook subscriptions. Every one of those writers was guarded by
-- `const db = getDatabase(); if (!db) return;` — so on a deployment with no
-- Firebase, `POST /v1/projects` returned **201 Created** and stored nothing.
-- The record was discarded and the caller was told it had been saved.
--
-- On the seam the same call is refused with a 503 naming DATABASE_URL, which
-- is the phase's exit criterion. These are the tables it lands in.
--
-- Records already in Firebase are brought across by
-- `npm run db:backfill -- --from=firebase`, which walks the seam's own prefix.
-- Records written by the *old* bridge sit at their own legacy paths
-- (`fintech/projects/<id>`, `fintech/monitoring/<id>/<year>`, …) and are not
-- in that walk; they were only ever reachable on a Firebase deployment, and
-- an operator holding any should say so before cutting over rather than
-- discover it afterwards.

-- Lending projects. `org_id` is the partition, as it is everywhere else here.
CREATE TABLE fintech_projects (
  org_id      text NOT NULL,
  id          text NOT NULL,
  data        jsonb NOT NULL,
  region      text GENERATED ALWAYS AS (data->>'region') STORED,
  phase       text GENERATED ALWAYS AS (data->>'phase') STORED,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id)
);

-- Annual monitoring, one row per project-year — which is what the id says, so
-- a second entry for a year supersedes the first rather than accumulating.
--
-- Deliberately no foreign key to fintech_projects: a monitoring entry may name
-- a project held in the CarbonIQ core engine and never created here, and a
-- constraint that refused it would refuse a legitimate entry. What the entry
-- is scoped by is the organisation, which the old path
-- (`fintech/monitoring/<projectId>/<year>`) did not carry at all.
CREATE TABLE fintech_monitoring (
  org_id      text NOT NULL,
  id          text NOT NULL,
  data        jsonb NOT NULL,
  project_id  text GENERATED ALWAYS AS (data->>'projectId') STORED,
  year        integer GENERATED ALWAYS AS ((data->>'year')::integer) STORED,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id)
);
CREATE INDEX fintech_monitoring_project_idx ON fintech_monitoring (org_id, project_id);

-- Agent runs. The EU AI Act Article 22 human review lands on this row, so it
-- is a compliance record and not a log line.
CREATE TABLE agent_runs (
  org_id      text NOT NULL,
  id          text NOT NULL,
  data        jsonb NOT NULL,
  agent       text GENERATED ALWAYS AS (data->>'agent') STORED,
  status      text GENERATED ALWAYS AS (data->>'status') STORED,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id)
);
CREATE INDEX agent_runs_status_idx ON agent_runs (org_id, status);

-- Supervisor pipeline runs — one row per multi-agent pipeline.
CREATE TABLE pipeline_runs (
  org_id      text NOT NULL,
  id          text NOT NULL,
  data        jsonb NOT NULL,
  status      text GENERATED ALWAYS AS (data->>'status') STORED,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id)
);

-- Webhook subscriptions. `active` is a column because listing a book of
-- subscriptions to dispatch to is the query this table exists to answer.
CREATE TABLE webhooks (
  org_id      text NOT NULL,
  id          text NOT NULL,
  data        jsonb NOT NULL,
  active      boolean GENERATED ALWAYS AS ((data->>'active')::boolean) STORED,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id)
);
CREATE INDEX webhooks_active_idx ON webhooks (org_id, active);

-- down
DROP TABLE IF EXISTS webhooks;
DROP TABLE IF EXISTS pipeline_runs;
DROP TABLE IF EXISTS agent_runs;
DROP TABLE IF EXISTS fintech_monitoring;
DROP TABLE IF EXISTS fintech_projects;
