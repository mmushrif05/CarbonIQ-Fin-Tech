# Jobs — work that does not fit inside one request

Phase E4 of `docs/ENTERPRISE-READINESS.md` (gaps I1, I2). A request on the
serverless platform is killed at 26 seconds. A portfolio roll-up over a
real book, an annual disclosure rendered to PDF, a document extraction
that reads every page — none of these belong inside one. A job is enqueued
in one request, worked by a process that has the time, and read back by
id.

## The routes

| Route | What |
|---|---|
| `POST /v1/jobs` (scope `assess`) | `{ type, payload }` → `202 { job, mode }` |
| `GET /v1/jobs/types` | the types this deployment runs, each with what its payload is |
| `GET /v1/jobs` | this organisation's jobs, newest first; pages with `limit` / `cursor`; filters `status`, `type` |
| `GET /v1/jobs/{jobId}` | the job: `status` is `queued` · `running` · `succeeded` · `failed`; `result` for a JSON answer, `artifact` for a document, `error` for a failure |
| `GET /v1/jobs/{jobId}/artifact` | the document — a PDF or a Word file — with its own content type and filename |

A job is the organisation's: another key cannot see it. `requestId` on
the job is the request that enqueued it, so the log line, the audit row
and the job are one thread.

## The types

Every handler calls **the same function the synchronous route calls**, so
a document produced by a job is the document the route would have
produced. The payload is the body the route takes.

| Type | Payload | Answers |
|---|---|---|
| `partc.report` | the body of `POST /v1/pcaf/part-c/report` (`format` json · pdf · docx) | `result.report`, or an artifact |
| `partc.disclosure` | `{ year, format: json · pdf · docx, auditTrail }` | `result.disclosure`, or an artifact |
| `lending.report` | the body of `POST /v1/reports/generate` | `result.report`, or a PDF |
| `extract.document` | the body of `POST /v1/extract` | `result.materials`, `summary`, `tokensUsed` |
| `portfolio.aggregate` | `{ projectIds: [...] }` — up to 10,000 | the roll-up `GET /v1/portfolio` answers |

The handlers are registered in `src/jobs.js`, the fourth composition root
(with `src/server.js`, `router.js` and `schemas.js`): the platform's queue
knows nothing about the engines, and the architecture test holds that.

## Two modes

`/health` → `jobs.mode` says which, and every `202` carries it.

**`postgres`** — the queue is the `jobs` table on the one database
(migration `0003_jobs.sql`). Enqueue answers `queued`; a worker claims the
oldest ready job with `FOR UPDATE SKIP LOCKED`, so any number of workers
take distinct jobs; the outcome and the artifact (bytea) are written to the
row. A failure that may pass next time — a store or provider that did not
answer, an unknown error — is retried with backoff (30 s × attempt) up to
`maxAttempts` (3); an invalid payload, a missing record, a refusal or a
conflict fails at once, because it would fail the same way tomorrow. A job
whose worker died is returned to the queue by `requeueStale()` after
fifteen minutes and carries `error.stale: true`.

**`inline`** — no database holds a queue (local development, tests, a
deployment without `DATABASE_URL`, or `JOBS_INLINE=1`): the job runs
inside the request that enqueued it, the `202` already carries the
outcome, and **the 26-second ceiling still applies**. The response says
`mode: inline`; nothing pretends otherwise.

## Who works the queue

Three ways, all calling the same `drain()` (`src/platform/jobs/worker.js`):

1. **The background function** `netlify/functions/jobs-background.js`. A
   Netlify background function answers `202` at once and may run for
   fifteen minutes; it drains the queue for up to twelve. The API pokes it
   after every enqueue, so a job starts within seconds. It needs:
   - `JOBS_TOKEN` — a shared token; the API sends it, the function checks
     it, so the public cannot start the worker at will. Generate one:
     `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`.
   - `JOBS_URL` — the site's own URL (`https://carboniqfintech.netlify.app`);
     Netlify's `URL` is used when it is present at runtime.
2. **The scheduled sweep** `netlify/functions/jobs-sweep.js`, every ten
   minutes: returns stale jobs to the queue, and if any are waiting pokes
   the background function — or, without a token, drains what it can in
   its own twenty-second budget. A deployment that configured nothing still
   works its queue, slowly; `/health` → `jobs.worker` says `sweep`.
3. **`npm run worker`** — a long-lived process for a container or a VM
   beside the database, with no ceiling but the machine's. `WORKER_POLL_MS`
   sets the idle poll (2000).

`/health` → `jobs.worker` reads `poked` (token and URL set), `sweep`
(neither set), or `inline`.

## Setting it up on Netlify

1. `DATABASE_URL` set and migrated (`docs/DATA-LAYER.md`); migration 0003
   creates the table.
2. Set `JOBS_TOKEN` and `JOBS_URL` on the production context. Redeploy.
3. `GET /health` → `jobs: { mode: "postgres", queued: 0, running: 0, worker: "poked" }`.
4. Enqueue one: `POST /v1/jobs { "type": "lending.report", "payload": { "type": "pcaf", "period": "2025", "format": "pdf", "orgName": "…" } }`,
   then `GET /v1/jobs/{jobId}` until `succeeded`, then download the artifact.

The two functions carry the same `included_files` as the API in
`netlify.toml`: a report needs the fonts and the factor tables wherever it
is rendered.

## Limits, honestly

- An artifact is stored on the row as `bytea`. A disclosure is a few
  hundred kilobytes; a job producing more than a few tens of megabytes
  should write to object storage and record a location instead — not built,
  because nothing here produces one.
- The queue is per database. Two deployments on two databases have two
  queues.
- A job runs with the organisation's identity and the enqueuer's
  `requestId`; it does not carry the key's rate-limit tier.

## What is proved

`tests/jobs.test.js`, on both stores: the types are the registered
handlers; enqueue needs `assess` and refuses an unknown type with the list;
a JSON job is read back with its result and no artifact; a document job's
PDF is the synchronous route's PDF, downloadable by id with its filename;
an invalid payload fails at once and is not retried; a 409 is not retried;
another organisation's job is invisible; `/health` says the mode. On
PostgreSQL also: two workers claim two different jobs and a third finds
none; a dead worker's job is returned by the sweep and then runs; a
transient failure is retried with backoff up to `maxAttempts`.
