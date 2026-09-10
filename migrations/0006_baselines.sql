-- 0006 — the master baseline table.
--
-- PCAF sets the method; it does not set Sri Lanka's baseline. Somebody
-- credible and in-region has to, and a baseline anyone can change without a
-- recorded reason is worth nothing: if one institution can move its number
-- quietly, every number in the market becomes negotiable.
--
-- So a baseline is a row per version, never an edit in place. A released row
-- is immutable; a change is a new row that supersedes it, carrying the reason
-- and the movement. This is the same shape as partc_assessments, and for the
-- same reason.
--
-- Two partitions: `org_id = '_'` holds the global and country figures, which
-- are the market's and which every organisation resolves against;
-- `org_id = <the organisation>` holds that institution's own baseline and its
-- pledge. Nothing lets one tenant write the other's.

CREATE TABLE baselines (
  org_id        text NOT NULL,
  id            text NOT NULL,
  data          jsonb NOT NULL,
  baseline_key  text GENERATED ALWAYS AS (data->>'key') STORED,
  metric        text GENERATED ALWAYS AS (data->>'metric') STORED,
  scope         text GENERATED ALWAYS AS (data->>'scope') STORED,
  country       text GENERATED ALWAYS AS (data->>'country') STORED,
  status        text GENERATED ALWAYS AS (data->>'status') STORED,
  version       integer NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id)
);

CREATE INDEX baselines_key_idx ON baselines (org_id, baseline_key, status);
CREATE INDEX baselines_metric_idx ON baselines (metric, scope, country);

-- One released version per baseline, said in the database as well as in code.
-- The release path is a transaction that supersedes the old row and releases
-- the new one; a check in code cannot stop two administrators releasing at the
-- same moment, and this can. Two released versions of one baseline is the
-- position that would make every figure quoted from it unreconcilable.
CREATE UNIQUE INDEX baselines_one_released_idx
  ON baselines (org_id, baseline_key) WHERE status = 'released';

-- down
DROP TABLE IF EXISTS baselines;
