-- 0001_initial — the record store, one table per collection.
--
-- Every table has the same spine: (org_id, id) as the primary key, the record
-- itself as JSONB, and the timestamps and version the store maintains. What
-- differs is which fields are lifted into GENERATED columns so they can be
-- indexed and referenced. A generated column is derived from the JSON, so the
-- column and the record cannot disagree; a foreign key on it is a foreign key
-- on the record.
--
-- ON DELETE RESTRICT throughout. A cascade would let one DELETE take an
-- assessment's bill of quantities with it, and an assessment that cannot be
-- traced to its BOQ is not a disclosure anybody can audit.

-- ── PCAF Part C — the insurer's book ─────────────────────────────────────

CREATE TABLE partc_settings (
  org_id      text NOT NULL,
  id          text NOT NULL,
  data        jsonb NOT NULL,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id)
);

CREATE TABLE partc_clients (
  org_id      text NOT NULL,
  id          text NOT NULL,
  data        jsonb NOT NULL,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id)
);

CREATE TABLE partc_projects (
  org_id      text NOT NULL,
  id          text NOT NULL,
  data        jsonb NOT NULL,
  client_id   text GENERATED ALWAYS AS (data->>'clientId') STORED,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id),
  FOREIGN KEY (org_id, client_id) REFERENCES partc_clients (org_id, id) ON DELETE RESTRICT
);
CREATE INDEX partc_projects_client_idx ON partc_projects (org_id, client_id);

CREATE TABLE partc_boq_revisions (
  org_id      text NOT NULL,
  id          text NOT NULL,
  data        jsonb NOT NULL,
  project_id  text GENERATED ALWAYS AS (data->>'projectId') STORED,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id),
  FOREIGN KEY (org_id, project_id) REFERENCES partc_projects (org_id, id) ON DELETE RESTRICT
);
CREATE INDEX partc_boq_revisions_project_idx ON partc_boq_revisions (org_id, project_id, created_at);

CREATE TABLE partc_assessments (
  org_id          text NOT NULL,
  id              text NOT NULL,
  data            jsonb NOT NULL,
  project_id      text GENERATED ALWAYS AS (data->>'projectId') STORED,
  policy_id       text GENERATED ALWAYS AS (data->>'policyId') STORED,
  boq_revision_id text GENERATED ALWAYS AS (data->>'boqRevisionId') STORED,
  reporting_year  integer GENERATED ALWAYS AS ((data->>'reportingYear')::integer) STORED,
  status          text GENERATED ALWAYS AS (data->>'status') STORED,
  version         integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id),
  FOREIGN KEY (org_id, project_id)      REFERENCES partc_projects      (org_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (org_id, boq_revision_id) REFERENCES partc_boq_revisions (org_id, id) ON DELETE RESTRICT
);
CREATE INDEX partc_assessments_policy_year_idx ON partc_assessments (org_id, policy_id, reporting_year, status);

-- The reporting-year roll-up reads seventeen fields of a ten-kilobyte record.
-- Over a book of ten thousand that is a hundred megabytes serialised to read
-- forty-six of them, and the serialisation — not the query — is what takes
-- the second. So the subset is computed once, at write time, into its own
-- column, and the roll-up reads that. The field list is owned by
-- platform/database/collections.js (`projections.rollup`); a test holds
-- this function to it. Costs roughly half again the table's storage.
CREATE FUNCTION partc_assessment_rollup(data jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT COALESCE((SELECT jsonb_object_agg(key, value) FROM jsonb_each(data)
                   WHERE key = ANY (ARRAY['assessmentId','status','policyId','policyRef','lineType','clientName',
                                          'projectName','boqRevisionLabel','version','lockedAt','restatement',
                                          'summary','moduleValues','createdAt'])), '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object(
           'dataQuality', jsonb_build_object('option', data #> '{dataQuality,option}', 'score', data #> '{dataQuality,score}'),
           'dqScoring', jsonb_build_object(
             'byGhgScope', jsonb_build_object(
               'scope1and2', jsonb_build_object('score', data #> '{dqScoring,byGhgScope,scope1and2,score}'),
               'scope3',     jsonb_build_object('score', data #> '{dqScoring,byGhgScope,scope3,score}')),
             'internalAid', jsonb_build_object('rows',
               (SELECT jsonb_agg(jsonb_build_object(
                  'applies', r->'applies', 'stage', r->'stage', 'input', r->'input', 'ghgScope', r->'ghgScope',
                  'line', r->'line', 'basis', r->'basis', 'source', r->'source', 'strength', r->'strength'))
                FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(data #> '{dqScoring,internalAid,rows}') = 'array'
                       THEN data #> '{dqScoring,internalAid,rows}' ELSE '[]'::jsonb END) r)))))
$$;
ALTER TABLE partc_assessments ADD COLUMN rollup jsonb GENERATED ALWAYS AS (partc_assessment_rollup(data)) STORED;
CREATE INDEX partc_assessments_project_idx     ON partc_assessments (org_id, project_id);
-- One locked assessment per policy-year. Locking supersedes the previous one
-- inside a transaction; this index is what makes a crash between the two
-- writes impossible to leave behind as two locked versions.
CREATE UNIQUE INDEX partc_assessments_one_locked_idx
  ON partc_assessments (org_id, policy_id, reporting_year) WHERE status = 'locked';

-- ── The capital book ─────────────────────────────────────────────────────

CREATE TABLE capital_portfolios (
  org_id      text NOT NULL,
  id          text NOT NULL,
  data        jsonb NOT NULL,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id)
);

CREATE TABLE capital_investments (
  org_id           text NOT NULL,
  id               text NOT NULL,
  data             jsonb NOT NULL,
  portfolio_id     text GENERATED ALWAYS AS (data->>'portfolioId') STORED,
  status           text GENERATED ALWAYS AS (data->>'status') STORED,
  origin_system    text GENERATED ALWAYS AS (data->'origin'->>'system') STORED,
  origin_record_id text GENERATED ALWAYS AS (data->'origin'->>'recordId') STORED,
  version          integer NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id),
  FOREIGN KEY (org_id, portfolio_id) REFERENCES capital_portfolios (org_id, id) ON DELETE RESTRICT
);
CREATE INDEX capital_investments_portfolio_idx ON capital_investments (org_id, portfolio_id);
-- One pipeline record, one investment. Two rows for one project would double
-- every figure on the desk, and a check in code cannot stop two adoptions
-- racing; this can.
CREATE UNIQUE INDEX capital_investments_origin_idx
  ON capital_investments (org_id, origin_system, origin_record_id) WHERE origin_record_id IS NOT NULL;

CREATE TABLE capital_payments (
  org_id        text NOT NULL,
  id            text NOT NULL,
  data          jsonb NOT NULL,
  portfolio_id  text GENERATED ALWAYS AS (data->>'portfolioId') STORED,
  investment_id text GENERATED ALWAYS AS (data->>'investmentId') STORED,
  version       integer NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id),
  FOREIGN KEY (org_id, portfolio_id)  REFERENCES capital_portfolios  (org_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (org_id, investment_id) REFERENCES capital_investments (org_id, id) ON DELETE RESTRICT
);
CREATE INDEX capital_payments_investment_idx ON capital_payments (org_id, investment_id);

-- ── GCF pipeline and entity facts ────────────────────────────────────────

CREATE TABLE gcf_projects (
  org_id      text NOT NULL,
  id          text NOT NULL,
  data        jsonb NOT NULL,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id)
);

CREATE TABLE gcf_entity (
  org_id      text NOT NULL,
  id          text NOT NULL,
  data        jsonb NOT NULL,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id)
);

-- ── Assurance declarations ───────────────────────────────────────────────

CREATE TABLE assurance_declarations (
  org_id      text NOT NULL,
  id          text NOT NULL,
  data        jsonb NOT NULL,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id)
);

-- ── The audit trail — append-only, hash-chained ──────────────────────────
--
-- Each row carries the SHA-256 of the previous row's hash and its own
-- canonical content, so a deleted or edited row breaks every hash after it.
-- UPDATE, DELETE and TRUNCATE are refused by trigger, so the chain can only
-- grow. `platform/database/audit-chain.js` writes and verifies it.

CREATE TABLE audit_events (
  seq         bigserial PRIMARY KEY,
  org_id      text,
  at          timestamptz NOT NULL,
  actor       text,
  action      text NOT NULL,
  resource    text,
  request_id  text,
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash   char(64) NOT NULL,
  hash        char(64) NOT NULL UNIQUE
);
CREATE INDEX audit_events_org_idx ON audit_events (org_id, seq);

CREATE FUNCTION audit_events_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: % refused', TG_OP USING ERRCODE = '55000';
END
$$;
CREATE TRIGGER audit_events_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_append_only();

-- down
DROP TABLE IF EXISTS audit_events;
DROP FUNCTION IF EXISTS audit_events_append_only();
DROP TABLE IF EXISTS assurance_declarations;
DROP TABLE IF EXISTS gcf_entity;
DROP TABLE IF EXISTS gcf_projects;
DROP TABLE IF EXISTS capital_payments;
DROP TABLE IF EXISTS capital_investments;
DROP TABLE IF EXISTS capital_portfolios;
DROP TABLE IF EXISTS partc_assessments;
DROP FUNCTION IF EXISTS partc_assessment_rollup(jsonb);
DROP TABLE IF EXISTS partc_boq_revisions;
DROP TABLE IF EXISTS partc_projects;
DROP TABLE IF EXISTS partc_clients;
DROP TABLE IF EXISTS partc_settings;
