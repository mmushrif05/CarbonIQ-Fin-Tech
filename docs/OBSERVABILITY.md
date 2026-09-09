# Observability — logs, errors, metrics

Phase E3 of `docs/ENTERPRISE-READINESS.md`. What a request leaves behind,
where it goes, how an incident is raised, and what to do when one is.

## The rule

**A 500 in production raises an alert naming the request id, the
organisation and the failing module.** `tests/observability.test.js` proves
it: the request handled, the report built before the response goes out, the
three fields on it.

## One id, three records

Every request carries a correlation id: the caller's `X-Request-ID` where it
sent a well-formed one (letters, digits, `. _ : -`, up to 128 characters),
else a fresh UUID. It is returned on the response as `X-Request-ID`, and it
is in the body of every error response as `requestId`. From there it is on:

| Record | Where the id is | What it holds |
|---|---|---|
| The request line | `requestId` | method, path, the route **pattern**, status, duration, organisation, key, actor, scope |
| Every log line written under the request | `requestId` | whatever the module logged, three calls deep or thirty |
| The audit chain row (PostgreSQL) | `request_id` | who did what to which record, hash-chained |
| The error report | tag `requestId` | the exception, its frames, the failing module, release, environment |

The id reaches a service-layer log without being passed to it. The audit
middleware runs the rest of the request inside an `AsyncLocalStorage` store
(`src/platform/observability/context.js`) holding the id and the request,
and the logger's mixin reads it at the moment a line is written. So a
module logs `{ figure }` and the line that lands carries `requestId`,
`orgId` and `actor` beside it.

## The log line

JSON, one object per line, on stdout — the platform captures stdout.
`src/platform/observability/logger.js` is pino with:

| Field | Meaning |
|---|---|
| `time` | ISO 8601 |
| `level` | `trace` `debug` `info` `warn` `error` `fatal` — the word, not a number |
| `service` | `carboniq-fintech` |
| `env` | `NODE_ENV` |
| `release` | the running commit (the one `/health` reports) |
| `module` | the file that wrote the line, e.g. `domains/pcaf-part-c/application/partc-assessments` |
| `requestId` `orgId` `actor` | from the request context, where the line is written inside a request |
| `msg` | the message |
| … | whatever the line carried |

The request line adds `audit: true`, `method`, `path`, `route`, `status`,
`durationMs`, `ip`, `userAgent`, `authType`, `keyName`, `unscoped`,
`scope`. It is `info` for a 2xx and 3xx, `warn` for a 4xx, `error` for a
5xx, so a drain can alert on level alone.

**Redaction.** A key, a token, a password, a service account, a DSN or an
`Authorization` / `X-API-Key` / `Cookie` header that reaches a log line is
replaced with `[redacted]` before it is written, by key name at any depth.

**Level.** `LOG_LEVEL` (default `info`; `silent` under test unless
`TEST_LOG_LEVEL` is set). On a serverless platform the destination is
synchronous, because a frozen container does not flush an asynchronous one.

`logger.for('domains/x/y')` gives a module its logger; `logger.fallback`
is described under *Fallbacks* below.

## The log sink (D2)

Nothing is shipped from the process. Netlify captures function stdout and a
**log drain** forwards it, with retention, to the sink the operator chooses.
This is configuration on the site, not code:

1. Netlify → the site → **Project configuration → Logs → Log drains** (Pro
   plan or above; the site is on Pro).
2. Add a drain for **function logs**. Datadog, New Relic, Axiom, Splunk and
   an HTTP endpoint are offered; Better Stack takes the HTTP endpoint.
   Choose the JSON format where offered — every line is already JSON, so
   the sink indexes the fields above without a parser.
3. Set **retention at the sink**. Ninety days is the floor a regulated
   client will expect for an API that carries a disclosure; a year is
   safer. Record the figure chosen in the deployment runbook.
4. Save three queries and alert on the first two:
   - `level:error` — every 5xx and every failed report;
   - `audit:true AND status>=500` rate over five minutes — the error rate;
   - `kind:unreachable` — a store, Firebase or the AI provider not answering.

The drain is the **cross-instance** view. The metrics endpoint below is the
view of one process.

## Error reporting (D3)

`src/platform/observability/errors.js`. A 500, an unhandled rejection, an
uncaught exception and a failed function invocation are all reported the
same way: logged with the fields below, and sent to **Sentry** when
`SENTRY_DSN` is set. An explained 5xx — a store unreachable (503), the AI
provider down (503), a deadline exceeded (504) — arrives with its own code
and remedy; it is reported best-effort and answered without waiting, and
its request line is an error-level log regardless, which is what the drain
alerts on. Without a DSN the reporter is inert —
the log line still lands — and `/health` → `observability.errorTracking`
says which. A malformed DSN is named by boot validation.

Each report carries:

| Tag / field | Value |
|---|---|
| `requestId` `orgId` `actor` | the request's identity |
| `module` | the innermost frame under `src/` that raised it, e.g. `src/domains/pcaf-part-c/application/partc-assessments.js` |
| `route` `method` `status` | the route pattern, not the concrete path |
| `kind` | `unreachable` · `timeout` · `refused` · `not_found` · `conflict` · `invalid` · `unknown` |
| `release` | the running commit |
| `environment` | `SENTRY_ENVIRONMENT`, else the build context (`production`, `deploy-preview`), else `NODE_ENV` |
| exception | type, message, stack frames with `in_app` marked |

The report is **awaited, with a two-second bound, before the response goes
out**. On a serverless platform the container is frozen once the response
is sent, and a report still in flight then is a report that never arrives.
A sink that is down never breaks the response: the log line says
`reported: false` with the reason, and the client still gets its 500 with
`requestId` and `eventId`.

**Why not the SDK.** The transport is Sentry's documented envelope endpoint,
spoken with the runtime's own `fetch`. The SDK carries an OpenTelemetry
runtime that must initialise before every other module and adds tens of
megabytes to a bundle whose cold start is already the slowest thing about
it, for breadcrumbs and tracing this application does not use. Should
tracing be wanted later, the SDK can replace `sendEnvelope` behind the same
`capture()`.

### Setting it up

1. Create a Sentry project (platform: Node.js). Copy the DSN from the
   project's client keys.
2. Set `SENTRY_DSN` on the Netlify production context, and
   `SENTRY_ENVIRONMENT=production` (the deploy-preview context is stamped
   `deploy-preview` from the build already). Redeploy.
3. `GET /health` → `observability.errorTracking: true`.
4. In Sentry, an alert rule: **"A new issue is created"** → the team's
   email or Slack channel, for environment `production`. Every distinct
   failing module and message is a new issue; the rule fires once per
   issue, and the issue carries every request id since.
5. Optionally a second rule on **"number of events in an issue is more than
   10 in one hour"** for a failure that is recurring.

### When the alert fires

1. Read the tags: `module`, `route`, `orgId`, `requestId`, `release`.
2. Search the log drain for the `requestId` — every line the request wrote,
   in order, including the request line with its duration.
3. `GET /health` → `build.commit` says whether the release on the report is
   what is running now.
4. On PostgreSQL, `audit_events` for the request id says what the request
   was trying to change.
5. A `kind` of `unreachable` on the database is an infrastructure incident,
   not a code one: check `/health` → `storage.reachable` first.

## Metrics (D4)

`GET /v1/metrics` (scope `read`) — JSON by default, the Prometheus text
exposition with `?format=prometheus` or `Accept: text/plain`:

| Series | What |
|---|---|
| `carboniq_requests_total{method,route,status_class}` | requests by route **pattern** and status class |
| `carboniq_request_duration_ms{method,route}` | histogram, buckets from 5 ms to the 26 s wall clock |
| `carboniq_store_operations_total{verb,outcome}` | every verb on the storage seam — put, get, list, query, patch, remove, page, count, transaction |
| `carboniq_store_duration_ms{verb}` | store latency, the same buckets |
| `carboniq_fallbacks_total{site,kind}` | failures answered with a fallback value (below) |
| `carboniq_errors_captured_total{module}` | exceptions that reached the reporter |

The JSON view adds `p50`, `p95`, `p99` and the mean per series, the 5xx
error rate and requests per minute.

**What these are.** The figures are **this process's since it started**,
and the payload says so (`instance`, `since`, `scope`). On a serverless
platform a process is one container among several and is recycled without
notice, so a scraper sees a series per container that starts at zero. That
is the honest shape of in-process metrics on this platform. The durable,
cross-instance view is the log drain: every request line carries `route`,
`status` and `durationMs`, and a sink aggregates those across every
container. This endpoint answers "what is this process doing right now",
which a drain cannot.

## Fallbacks (C5)

The readiness register counted thirteen `.catch(() => {})` in the tree; the
sweep found 33 forms of it, including `.catch(() => null)` and
`.catch(() => [])` — a database outage that reads as "no record" or "an
empty book". Every one is now `.catch(fallback('site', value))`:

- the caller still gets the value it used to get, so nothing changes shape;
- the failure is logged at `warn` with its `site`, its `kind` and the error;
- it is counted under `carboniq_fallbacks_total{site,kind}`.

A test fails the build on any `.catch(() => …)` returning to `src/` or the
function. The sites:

| Site | Falls back to |
|---|---|
| `store.firebase.save` `.patch` `.delete` `.get` `.list` | the in-process copy; Firebase is the optional path here and is only called where configured |
| `store.blobs.get` `.list` | the in-process copy |
| `partc.runs.firebase.save` `.get` `.update` `.list` | the in-process run copy |
| `partc.learnings.firebase.save` `.list` · `partc.benchmarks.firebase.list` | learnings not recorded; no benchmark |
| `partc.runs.save` `.markFailed` · `partc.recordLearnings` · `partc.assessments.recordLearnings` · `partc.portfolio.listLearnings` · `partc.form.getSettings` | the run completes; learnings absent; default settings |
| `gcf.pipeline.list` `.get` · `gcf.entity.get` · `desk.readiness.entityDisclosures` | the shipped seed; no record; no entity facts |
| `agent.updateAgentRun` · `supervisor.updatePipelineRun` | the mid-run progress save is skipped; the run continues |
| `webhook.recordDelivery` `.recordFailure` | delivery statistics not updated |
| `database.rollback` · `database.close` | the connection is released regardless |

A fallback firing is not an incident. A fallback firing a hundred times a
minute with `kind: unreachable` is, and the series is there to say so.

## What is proved

`tests/observability.test.js`: the request id on a deep log line and on the
audit line without being passed; the caller's id honoured or replaced;
redaction; the exit criterion — a 500 reported before the response with
`requestId`, `orgId`, `module`, `route`, `status`, release and frames; the
failing module chosen under `src/`; inert without a DSN; a 4xx neither
reported nor counted; a sink that is down never breaking a response; a
malformed DSN named by validation; requests counted by pattern with latency
and error rate; every store verb timed; the endpoint in both formats and
key-gated; fallbacks logged, classified and counted; no `.catch(() => …)`
and no `console` call under `src/`; `/health`'s block closed and carrying
no DSN; every variable read in `src/platform/config/`.

## What is not done

- **No distributed tracing.** One process, one request, one id; there is no
  second service to trace into. If one arrives, the request id is the
  trace id to carry.
- **No shipping from the process.** The drain is platform configuration and
  its retention is set at the sink; this document says where.
- **Metrics are per process.** See above. A pull-based scraper against a
  serverless function is a poor fit; the drain is the aggregate.
