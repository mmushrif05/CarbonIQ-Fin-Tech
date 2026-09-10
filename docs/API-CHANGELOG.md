# API changelog

The record of every change to the contract (`docs/API-CONTRACT.md`).
Additive changes ship at any time; a breaking change ships only in a new
major version, announced here and on the wire first.

## 2026-09-10 — E4: contract and scale

**Added**
- `GET /v1/openapi.json` — the OpenAPI 3.1 document, generated from the
  router; `docs/openapi.json` is the same document committed and held to
  the code by a test.
- The response envelope `{ data, meta, error }`, opt-in by `Accept:
  application/vnd.carboniq.v1+json`, `X-Envelope: 1` or `?envelope=1`.
  Every JSON response now carries `X-Api-Envelope: legacy | v1`.
- Paging on every list: `limit` and `cursor`, answered with `page`
  `{ limit, nextCursor, hasMore, total? }` — `GET /v1/partc/clients`,
  `/projects`, `/policies`, `/assessments`, `/projects/{id}/boq`,
  `/v1/capital/portfolios`, `/investments`, `/payments`, `/v1/gcf/pipeline`,
  `/v1/pcaf/part-c/runs`, `/v1/projects`, `/v1/webhooks`, `/v1/agent/runs`,
  `/v1/supervisor/pipelines`, `/v1/jobs`. Without `limit` or `cursor` each
  answers exactly as before.
- Jobs: `POST /v1/jobs`, `GET /v1/jobs`, `GET /v1/jobs/types`,
  `GET /v1/jobs/{jobId}`, `GET /v1/jobs/{jobId}/artifact`. Types:
  `partc.report`, `partc.disclosure`, `lending.report`, `extract.document`,
  `portfolio.aggregate`.
- Reference-data caching: `Cache-Control`, `ETag`, `304` on
  `/v1/pcaf/part-c/factors`, `/options`, `/conformance`,
  `/v1/pcaf/part-a/reference`, `/v1/gcf/reference`, `/v1/gcf/conformance`,
  `/v1/ndc-sdg/framework`, `/v1/carbon-pricing/rates`, `/v1/reports/types`.
- `/health` gains `jobs` (mode, depth, how the queue is worked) and
  `contract` (where the document is).

**Changed**
- `GET /v1/pcaf/part-c/runs`, `/v1/agent/runs`, `/v1/supervisor/pipelines`:
  `limit` now asks for a page and the answer carries `page`; without it the
  twenty most recent are answered, as before.
- A page on `GET /v1/partc/projects` and `/assessments` now also carries
  `page.hasMore`.

**Deprecated**
- Nothing removed. The `application/json` shape of every v1 route is the
  shape it keeps for the whole of v1; the envelope becomes the default in
  v2. A legacy response carries `Link: …; rel="deprecation"`.

## 2026-09-09 — E3: observability

**Added**
- `GET /v1/metrics` (scope `read`) — this process's request, latency,
  error and store series, JSON or Prometheus text.
- `X-Request-ID` is honoured when well-formed and always returned; a 500
  carries `eventId` beside `requestId`.
- `/health` gains `observability`.

## 2026-09-09 — the database is the operator's

**Changed**
- PostgreSQL is the store when `DATABASE_URL` is set; Netlify Blobs is no
  longer chosen automatically. No change to any route's shape.

## 2026-09-09 — E2: control

**Added**
- A scope on every route (`docs/API-SCOPES.md`); `403 SCOPE_REQUIRED`
  names the scope required and the scopes held; `X-Key-Scopes` on every
  response; `X-Actor` names the person; `401 KEY_EXPIRED` for an expired key.
- `GET /v1/ui-config.js`.

## 2026-09-09 — E1: the data layer

**Added**
- `/health` → `storage` gains `transactional`, `reachable`, `schema`.
- `GET /v1/partc/projects?limit=&cursor=` and `GET /v1/partc/assessments?limit=&cursor=`
  page on the store's own keyset.
