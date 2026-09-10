# The API contract

Phase E4 of `docs/ENTERPRISE-READINESS.md`. What a bank's integration
team needs to build against this API without reading its source: the
document, the two shapes, paging, errors, caching, and the policy on
change.

## The document

`GET /v1/openapi.json` — no credential — is the OpenAPI 3.1 document, and
`docs/openapi.json` is the same document committed. Both are **generated
from the running router**: every operation is a route Express registered,
its request schema is the validator in that route's chain, its scope is
what `scopes.js` resolves, its paging and caching are the markers in its
chain. `npm run docs:openapi` rewrites the file; `tests/api-contract.test.js`
fails the build when the file and the router disagree, when the document
is not valid OpenAPI 3.1, or when a live response no longer satisfies it.

**Generating a client.** Any OpenAPI 3.1 generator works. Two that are
known to:

```bash
# TypeScript types and a fetch client
npx openapi-typescript docs/openapi.json -o carboniq.d.ts
npx openapi-fetch  # then: createClient<paths>({ baseUrl, headers: { 'X-API-Key': key } })

# Any language
npx @openapitools/openapi-generator-cli generate -i docs/openapi.json -g java -o ./client
```

Every operation has a stable `operationId` (`getPartcClients`,
`postPartcClients`, `getPartcClientsByClientId`, `postJobs` …), and the
contract test proves the point by generating a client from the document
alone and driving the API with it.

## Authentication

Send the organisation's key in `X-API-Key`; name the person acting in
`X-Actor`. Every operation carries `x-scope` — `read`, `write`, `lock`,
`assess` or `admin` — and a key that does not hold it is refused with
`403 SCOPE_REQUIRED`, naming the scope required and the scopes held. See
`docs/API-SCOPES.md`.

## Two shapes

Each route has always answered its own top-level shape — `{ clients }`,
`{ dashboard }`, `{ job }`. That shape is **`application/json`** and it is
unchanged. The **envelope** is the same body inside one shape for every
response:

```json
{ "data": { "clients": [ … ] }, "meta": { "requestId": "…", "timestamp": "…", "release": "8b80f73738c0", "page": { … } }, "error": null }
{ "data": null, "meta": { … }, "error": { "code": "CLIENT_NOT_FOUND", "message": "No client x.", "requestId": "…" } }
```

Ask for it with any of:

- `Accept: application/vnd.carboniq.v1+json`
- `X-Envelope: 1`
- `?envelope=1`

Every JSON response says which shape it is in **`X-Api-Envelope: legacy |
v1`**. A document — a PDF, a Word file — is bytes and is never wrapped.
The OpenAPI document lists both media types on every operation, so a
generated client picks one with `Accept`.

## Paging

A list answers whole until asked for a page:

| Query | Meaning |
|---|---|
| `limit` | at most this many items (1–500; 50 when only `cursor` is given) |
| `cursor` | `page.nextCursor` from the previous page — opaque, pass it back |

A page keeps the route's shape and adds `page`: `{ limit, nextCursor,
hasMore, total? }`. In the envelope it is `meta.page`. `nextCursor` is
`null` on the last page. A `limit` outside the range or a cursor this API
did not issue is `400 BAD_PAGE` with a remedy. Every list operation is
marked `x-paged` in the document, with the filters it takes.

## Errors

One shape, always: `{ error, message, remedy?, details?, requestId }`.
`error` is a stable code (`VALIDATION_ERROR`, `SCOPE_REQUIRED`,
`NOT_FOUND`, `BAD_PAGE`, `UNKNOWN_JOB_TYPE`, `INTERNAL_ERROR` …);
`details` names the fields on a validation error; `remedy` says what to do
where there is something to do. **Quote `requestId`** when asking for help:
it finds the log line, the audit row and the error report
(`docs/OBSERVABILITY.md`). A 500 also carries `eventId`.

## Caching

Reference data — factor tables, the Part A reference, the conformance
matrices, the GCF reference, the SLGFT framework, carbon tax rates, the
report types — answers with `Cache-Control: private, max-age=3600` and a
strong `ETag`, and answers `304` to a matching `If-None-Match`. The
operation says so in the document (a `304` response). Nothing a write can
change carries a `Cache-Control`; a test asserts it.

## Jobs

Work that does not fit inside one request — a portfolio roll-up over a
real book, an annual disclosure rendered to PDF, a document extraction —
goes through `POST /v1/jobs` and is read back by id. `docs/JOBS.md`.

## The policy on change

- **Versioning is in the path.** This is `/v1`. A new major version is a
  new prefix; the old one keeps answering for at least twelve months after
  the new one is published.
- **Additive changes ship at any time**: a new operation, a new optional
  field, a new optional query parameter, a new response header. A client
  that ignores what it does not know is not broken by them.
- **A breaking change ships only in a new major version**: removing or
  renaming a field, changing a type, changing a default shape, removing an
  operation.
- **The envelope becomes the default in v2.** The `application/json` shape
  each v1 route answers today stays for the whole of v1; a legacy response
  carries `X-Api-Envelope: legacy` and a `Link: …; rel="deprecation"` to
  this document so a client can see, from the wire, that it is on the shape
  that will not be the default next time.
- **Deprecation is announced in the wire and in writing.** An operation or
  field on its way out carries `Deprecation` and `Sunset` headers (RFC
  9745 / RFC 8594) for at least ninety days before the version that removes
  it, and `docs/API-CHANGELOG.md` records what, when and why.
- **The changelog is the record.** Every change to the contract — additive
  or breaking — is an entry in `docs/API-CHANGELOG.md`, dated, with the
  commit.
