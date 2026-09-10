-- 0003_jobs — a job queue on the one database (gaps I1, I2).
--
-- A request on the serverless platform is killed at 26 seconds. A portfolio
-- roll-up over a real book, an annual disclosure rendered to PDF, a document
-- extraction that reads every page — none of these belong inside one. A
-- job is enqueued in one request, worked by a process that has the time,
-- and read back by id.
--
-- The queue is a table, not a service: claiming uses FOR UPDATE SKIP LOCKED,
-- so any number of workers take distinct jobs and a worker that dies mid-job
-- leaves a row that a sweep can return to the queue. The artifact a job
-- produces — a PDF, a Word file — is kept beside the result so a client
-- downloads it by the same id.

CREATE TABLE jobs (
  org_id        text NOT NULL,
  id            text NOT NULL,
  type          text NOT NULL,
  status        text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  result        jsonb,
  error         jsonb,
  attempts      integer NOT NULL DEFAULT 0,
  max_attempts  integer NOT NULL DEFAULT 3,
  run_after     timestamptz NOT NULL DEFAULT now(),
  locked_by     text,
  locked_at     timestamptz,
  started_at    timestamptz,
  finished_at   timestamptz,
  request_id    text,
  actor         text,
  artifact      bytea,
  artifact_type text,
  artifact_name text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id)
);
CREATE INDEX jobs_claim_idx ON jobs (status, run_after, created_at);
CREATE INDEX jobs_org_idx ON jobs (org_id, created_at DESC);

-- down
DROP TABLE IF EXISTS jobs;
