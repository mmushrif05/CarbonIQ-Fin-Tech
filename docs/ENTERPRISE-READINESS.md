# Enterprise readiness — gap register and remediation plan

An audit of what this codebase is today against what a bank's IT procurement,
security review and external auditor would each ask of it, with a costed plan
to close the distance.

**47 findings — 7 Critical, 18 High, 20 Medium, 2 Low.**

**Audited:** 2026-09-09, at commit `0db6b93`.
**Method:** static audit of the repository — not a summary of the documentation.
Every finding below cites the file or the count it rests on, so each one can be
re-checked.

---

## 1. Verdict

**The calculation core is production-grade. The platform around it is
pilot-grade.**

| | |
|---|---|
| Backend code | 37,446 lines across services, routes, middleware, models, schemas, config, db, bridge |
| Frontend code | 29,079 lines |
| Endpoints | ~90, across 24 route files, versioned under `/v1` |
| Test suites | 91, including engines that reproduce published standards' worked examples to the figure |
| Persistence | Firebase Realtime Database (JSON document store), Netlify Blobs (key-value), in-process memory |
| **Relational database** | **None** |

This is not a front end with mock data. Every figure on every screen is
computed server-side by a tested engine. But "enterprise" has a specific
meaning to a bank's procurement team, and the distance is real and nameable.

**Readiness by dimension**, scored 1–10 against what a tier-2 bank would
expect of a system of record:

| Dimension | Score | One-line reason |
|---|---|---|
| Calculation engines | 9 | Pure, deterministic, traced, conformance-tested against the standards themselves |
| API layer | 7 | Express, Joi on every body, versioned, rate-limited — missing a machine-readable contract |
| Security — authentication | 7 | Dual JWT/API-key, SHA-256 hashed, helmet, CORS per environment |
| Security — authorisation | 3 | RBAC/ABAC written but wired to 2 of 24 route files |
| Testing & quality | 5 | 91 suites, but thresholds at 22–43% and `npm run lint` does not run |
| Code organisation | 5 | Flat 44-file services directory, 8 files over 500 lines, duplicated helpers |
| API contract | 4 | No OpenAPI spec; 35 distinct response shapes |
| **Data layer** | **3** | **No relational database, no migrations, no transactions, no query** |
| Observability | 3 | Correlation ID exists; no structured logging, no sink, no error tracking |
| Operations | 4 | CI runs tests; no staging, no deploy gate, no job queue |
| **Overall** | **5.0** | **Pilot-ready. Not yet a system of record.** |

---

## 2. The gap register

47 findings. **Severity** is what it means to a bank: **Critical** blocks
production use on real data; **High** blocks a security or audit sign-off;
**Medium** is technical debt that compounds; **Low** is hygiene.

### A. Data layer — 8 gaps

| # | Gap | Evidence | Severity |
|---|---|---|---|
| A1 | **No relational database.** Firebase RTDB is a JSON document store; Netlify Blobs is key-value | No `postgres`, `mysql`, `prisma`, `sequelize` or `knex` anywhere in the tree | **Critical** |
| A2 | **No migrations.** A schema change is a code change with no version, no rollback, no forward path for existing records | No `migrations/` directory | **Critical** |
| A3 | **No query capability.** Listing a collection reads every key then every record | `src/platform/database/blob-store.js` `list()`; its own header: *"It is not a database. There is no query, no index, no transaction."* | **Critical** |
| A4 | **No transactions.** Locking an assessment and superseding the previous one cannot be atomic — a crash between the two leaves two locked versions for one policy-year | `src/domains/pcaf-part-c/application/partc-assessments.js` writes sequentially | **Critical** |
| A5 | **No referential integrity.** A project can hold a `clientId` for a deleted client; nothing prevents or detects it | No foreign keys in any store | High |
| A6 | **No pagination at the API.** List endpoints return whole collections; the store caps at 200 internally without telling the caller | `blob-store.js` `list(..., { limit = 200 })`; no `cursor` in any route | High |
| A7 | **No backup, restore or point-in-time recovery** documented or scripted | No `scripts/backup*`; nothing in `docs/` | High |
| A8 | **No caching.** Every dashboard read recomputes from the store | No `redis`, `node-cache` or `lru-cache` | Medium |

> **Why A1–A4 are Critical together.** Part A listed equity is the first module
> that will meet a real book — a mid-size bank holds thousands of positions.
> Rolling up by sector, weighting by outstanding amount and producing a
> comparative against last year are *queries*. On a key-value store each is a
> full scan. And a locked baseline that can be left half-written is not a
> baseline an auditor will accept.

### B. Authorisation and identity — 4 gaps

| # | Gap | Evidence | Severity |
|---|---|---|---|
| B1 | **RBAC/ABAC is built but not wired.** A 268-line authorisation middleware and a full policy model exist; `authorize()` appears in **2 of 24** route files | `src/platform/auth/authorization.js`, `src/shared/policies.js`; only `agent.js` and `supervisor.js` call it | **Critical** |
| B2 | **Any valid API key can do anything.** 22 route files check authentication, not permission — so a read-only integration key can lock an assessment or delete a client | Absence of `authorize()` on `partc-registry.js`, `capital.js`, `gcf.js`, `desk.js` | **Critical** |
| B3 | **No per-user identity on API-key requests.** The audit line records `orgId` only, so "who locked this assessment" is answerable only to an organisation | `src/platform/observability/audit.js` logs `orgId` for key auth | High |
| B4 | **No key rotation or expiry enforcement** | `src/platform/auth/api-key-model.js`, `src/platform/auth/api-key.js` | Medium |

### C. Testing and quality — 5 gaps

| # | Gap | Evidence | Severity |
|---|---|---|---|
| C1 | **`npm run lint` is broken.** ESLint 9 requires `eslint.config.js`; none exists. The CI lint step has never run | `npx eslint .` → *"ESLint couldn't find an eslint.config file"* | High |
| C2 | **Coverage thresholds far below a financial bar:** branches 22%, functions 29%, lines and statements 43% | `package.json` `coverageThreshold` | High |
| C3 | **No integration test against a real store.** Tests run in-memory, so store-specific failures cannot surface | `tests/setup.js` | High |
| C4 | **No load or performance test.** Nothing establishes how the system behaves at 10,000 exposures | — | Medium |
| C5 | **13 swallowed errors** of the form `.catch(() => {})` — a failed write is indistinguishable from a successful one | `grep -rn "catch(() => {})" services/ routes/` | Medium |

### D. Observability — 6 gaps

| # | Gap | Evidence | Severity |
|---|---|---|---|
| D1 | **No structured logging library.** JSON strings via `console.log` | `src/platform/observability/audit.js`; no `pino`/`winston` | High |
| D2 | **No log sink.** Logs go to stdout and are captured by Netlify; they are not queryable, alertable or retained | — | High |
| D3 | **No error tracking.** A 500 in production is invisible unless someone reads function logs | No Sentry/Datadog/New Relic | High |
| D4 | **No metrics or APM.** No latency, throughput or error-rate signal | — | High |
| D5 | **Correlation ID is generated but not propagated.** `req.requestId` exists and is returned as a header, but service-layer logs do not carry it, so a request cannot be traced through the engines | `src/platform/observability/audit.js` lines 14–23 | Medium |
| D6 | **Audit trail is not tamper-evident.** It is written to stdout, not to an append-only store | `src/platform/observability/audit.js` | **Critical** for a regulated client |

### E. Code organisation — 6 gaps

| # | Gap | Evidence | Severity |
|---|---|---|---|
| E1 | **Flat services directory.** 44 files at one level mixing five domains — `partc-*`, `capital-*`, `gcf/`, `desk/`, `agents/` | `ls services/` | Medium |
| E2 | **No module boundaries.** Any file may import any other; nothing prevents the GCF engine importing a Part C internal | — | Medium |
| E3 | **Eight files over 500 lines**, largest 1,232 | `partc-report-standard.js` 1232, `agent.js` 900, `reports.js` 898, `partc-theme.js` 682 | Medium |
| E4 | **The `handle()` async wrapper is duplicated** in five route files rather than being one shared middleware | `capital.js`, `desk.js`, `gcf.js`, `partc-registry.js`, `assurance.js` | Medium |
| E5 | **Config sprawl.** `process.env` is read in 6 files outside `config/`, including `STORAGE_BACKEND` and `UI_API_KEY` | `grep -rln process.env services/ routes/ middleware/` | Medium |
| E6 | **One layering leak** — a service touching HTTP request/response objects | `src/platform/ai/deadline.js` | Low |

> **What is *not* wrong here.** All 125 async route handlers are protected —
> either by an inline `try/catch` or by a `handle()` wrapper. I checked each
> file. The finding is duplication, not an unhandled-rejection bug.

### F. API contract — 4 gaps

| # | Gap | Evidence | Severity |
|---|---|---|---|
| F1 | **No OpenAPI specification.** A bank's integration team cannot generate a client, and there is no contract to test against | No `openapi.*` / `swagger.*` | High |
| F2 | **Inconsistent response envelope.** 35 distinct top-level shapes across routes — `{dashboard}`, `{runId}`, `{project}`, `{success}` … | `grep -oh "res.json({ *[a-zA-Z]*" routes/v1/*.js` | Medium |
| F3 | **No deprecation policy or API changelog** | — | Medium |
| F4 | **No contract tests.** Nothing fails the build when a response shape changes | — | Medium |

### G. Type safety — 2 gaps

| # | Gap | Evidence | Severity |
|---|---|---|---|
| G1 | **No TypeScript.** Plain JavaScript with JSDoc on 28 of 44 service files | No `.ts`, no `tsconfig.json` | Medium |
| G2 | **No contract between services.** Joi validates the HTTP boundary; nothing validates what one service hands another | — | Medium |

### H. Frontend — 4 gaps

| # | Gap | Evidence | Severity |
|---|---|---|---|
| H1 | **No build step.** No bundler, no transpile, no minification; 21 hand-written modules served raw | No webpack/vite/rollup config | Medium |
| H2 | **No component model.** DOM manipulation by hand across 13 pages | — | Medium |
| H3 | **No frontend behavioural tests.** The UI suites sweep source text; nothing drives the DOM in CI | `tests/*-ui.test.js` | Medium |
| H4 | **CSP disabled in the app**, deferred to Netlify headers | `src/server.js`: `contentSecurityPolicy: false` | Medium |

### I. Operations — 5 gaps

| # | Gap | Evidence | Severity |
|---|---|---|---|
| I1 | **26-second serverless ceiling.** No path for a long-running batch — a 10,000-exposure portfolio run cannot complete in one request | `netlify.toml` | High |
| I2 | **No job queue or async processing** | — | High |
| I3 | **No staging environment** documented or configured | — | High |
| I4 | **CI has no deploy gate.** `npm audit` is `continue-on-error`, lint does not run, coverage is not enforced in CI | `.github/workflows/fintech-ci.yml` | Medium |
| I5 | **No dependency update automation** | No Dependabot/Renovate config | Low |

### J. Compliance posture — 3 gaps

| # | Gap | Evidence | Severity |
|---|---|---|---|
| J1 | **No data retention or deletion policy** | — | High |
| J2 | **No control mapping** to SOC 2, ISO 27001 or CBSL expectations | — | High |
| J3 | **No documented disaster recovery** — no RPO, no RTO | — | High |

---

## 3. The plan

Five phases, 13 weeks, ordered so that each makes the next safe. Phase E1 is
the one that unblocks everything else.

### Phase E1 — The data layer (4 weeks) · Critical

Closes A1–A7, D6, and half of I1.

1. **PostgreSQL + Prisma.** Schema for organisations, users, exposures,
   assessments, BOQ revisions, policies, capital book, GCF records, audit.
2. **Migrations from day one.** `prisma migrate`, checked in, with a rollback
   path. No schema change without a versioned migration.
3. **Repository pattern behind the existing seam.** `src/platform/database/store.js`
   is already a single interface — every engine reads through it and none
   touches a database directly. Swapping the implementation touches **zero
   calculation code**, which is why this is a fortnight rather than a rewrite.
4. **Transactions** for the operations that must be atomic: lock-and-supersede,
   BOQ revision plus mapping carry-forward, adopt-to-book.
5. **Backfill** from Blobs and Firebase, with a verification pass that counts
   records on both sides and refuses to cut over on a mismatch.
6. **Append-only audit table** — the tamper-evident trail D6 needs, with a
   hash chain so a deleted row is detectable.
7. **Backup and PITR** — managed Postgres gives this; document RPO and RTO.

*Exit criterion: every existing test passes against Postgres, and a 10,000-row
portfolio roll-up returns in under a second.*

> **Delivered** — `docs/DATA-LAYER.md`. Plain SQL with `pg` rather than
> Prisma (the reasons are in that document). All 94 suites pass on PostgreSQL;
> the 10,001-row roll-up measures 832 ms alone, on a stored projection column,
> and the suite holds it. A1–A7 and D6 closed; A8 (caching) deliberately not
> started — a read that takes 39 ms of SQL does not need a cache in front of
> it yet.

### Phase E2 — Control (2 weeks) · Critical

Closes B1–B4, C1, C2, E4, E5.

1. **Wire `authorize()` to all 24 route files.** The policy model exists; this
   is application, not design. Read/write/lock/admin permissions per endpoint.
2. **One shared `asyncHandler`** in `middleware/`, and delete the five copies.
3. **Fix ESLint** — an `eslint.config.js` for v9, and make CI fail on it.
4. **Raise coverage** to 70% lines / 60% branches, enforced in CI.
5. **Centralise config** — every `process.env` read moves into `config/`, with
   boot-time validation that refuses to start on a missing required variable.
6. **API key scopes and expiry.**

*Exit criterion: a read-only key is refused when it tries to lock an
assessment, and the refusal is tested.*

### Phase E3 — Observability (2 weeks) · High

Closes D1–D5, C5.

1. **Pino** structured logging, with the correlation ID threaded from
   `src/platform/observability/audit.js` through the service layer.
2. **A log sink** — Better Stack, Datadog or CloudWatch — with retention.
3. **Sentry** for errors, with release tagging against the commit already
   reported by `/health`.
4. **Metrics**: request rate, latency percentiles, error rate, store latency.
5. **Replace the 13 swallowed `.catch(() => {})`** with logged, classified
   failures.

*Exit criterion: a 500 in production raises an alert naming the request ID,
the org and the failing module.*

### Phase E4 — Contract and scale (3 weeks) · High

Closes A6, A8, F1–F4, I1, I2.

1. **OpenAPI 3.1 generated from the Joi schemas** — one source, so the spec
   cannot drift from the validation.
2. **Standard response envelope** — `{ data, meta, error }` — applied
   uniformly, with the old shapes kept for one deprecation cycle.
3. **Cursor pagination** on every list endpoint.
4. **Contract tests** in CI against the generated spec.
5. **A job queue** (pg-boss on the same Postgres, so no new infrastructure)
   for portfolio runs, report generation and document extraction — which also
   removes the 26-second ceiling.
6. **Caching** for reference data — factor tables, taxonomy, NACE.

*Exit criterion: a bank's integration team can generate a working client from
the spec alone.*

### Phase E5 — Structure (2 weeks) · Medium

Closes E1–E3, E6, G1, G2, H1–H4, I3–I5.

1. **Domain modules** (target structure in §4).
2. **Split the eight files over 500 lines** along the seams they already have.
3. **TypeScript**, or `checkJs` with JSDoc types if a full migration is too
   much — the second gets most of the benefit for a fraction of the cost.
4. **A frontend build step** and a small number of Playwright behavioural tests
   in CI.
5. **Staging environment**, deploy gate, Dependabot.

*Exit criterion: an import from one domain into another's internals fails the
build.*

---

## 4. Target structure

The current layout is a flat `services/` directory of 44 files spanning five
domains. The enterprise layout is domain-first, with platform concerns
separated and dependencies pointing inward — engines never know about HTTP or
the database.

```
src/
  domains/
    pcaf-part-a/
      domain/              pure engines — attribution, denominators, options,
                           estimation, lines. No I/O. The crown jewels.
      application/         use cases — assessExposure, rollUpBook
      infrastructure/      repositories, factor-table loaders
      interface/           routes, Joi schemas, response mappers
      conformance.js       rule → implementation → proving test
    pcaf-part-c/           same five folders
    gcf/
    capital/
    taxonomy/

  platform/
    auth/                  JWT, API key, RBAC/ABAC — one place
    config/                every process.env read, validated at boot
    database/              Prisma client, migrations, base repository, uow
    errors/                the error taxonomy and the HTTP mapping
    http/                  asyncHandler, envelope, pagination, validation
    observability/         logger, correlation, metrics, audit sink
    reporting/             PDF and Word renderers, shared by every domain

  shared/
    provenance/            traced() and absent() — used by every engine
    money/                 currency, FX, rounding rules

prisma/
  schema.prisma
  migrations/

tests/
  unit/                    per domain
  integration/             against a real Postgres
  contract/                against the OpenAPI spec
  acceptance/              the standards' own worked examples
```

> **Delivered (structure).** The tree is now `src/domains/{pcaf-part-a, pcaf-part-c,
> gcf, capital, taxonomy, lending}` with `domain/ · application/ · interface/`
> (plus `agents/`, `reporting/`, `infrastructure/`, `desk/` where a domain has
> them), `src/platform/` and `src/shared/`. 192 files moved with history, every
> require rewritten, every cited path in the conformance matrices regenerated.
> `tests/architecture.test.js` enforces the direction below; ESLint 9 runs
> again at zero errors. Not yet done from this phase: splitting `tests/` into
> unit / integration / contract / acceptance, and the staging context.

**The rule that makes it enterprise, not just tidy:** dependencies point
inward only. `domain/` imports nothing but `shared/`. `application/` may import
`domain/`. `infrastructure/` and `interface/` may import both. Nothing imports
`interface/`. An ESLint boundary rule enforces it, so the structure cannot rot
the way a convention would.

---

## 5. What this costs, and what it buys

| Phase | Weeks | Closes | Without it |
|---|---|---|---|
| E1 Data layer | 4 | 8 gaps, 5 Critical | Cannot hold a real loan book; cannot pass an audit of the baseline |
| E2 Control | 2 | 8 gaps, 2 Critical | Any API key can do anything — fails a security review |
| E3 Observability | 2 | 6 gaps | A production failure is invisible until a client reports it |
| E4 Contract & scale | 3 | 9 gaps | No integration path for a bank's own systems |
| E5 Structure | 2 | 16 gaps | Compounding drag on every future module |
| **Total** | **13** | **47** | |

**Sequencing note.** Part A §5.1 phases L4–L6 (route, screen, report) should
wait for E1. Listed equity is the first module that meets a book of thousands
of holdings, and a screen built on a key-value store that cannot query them is
work that gets thrown away.

The calculation engines — the part that is genuinely hard, genuinely
differentiated, and independently verifiable — need none of this work. They are
already right. Everything above is the platform that lets a bank trust them
with its own data.
