# Handover gap analysis — can a development team take this over?

**Date:** 2026-09-10 · **Head:** `96ce567` · **Scope:** the whole repository
**Question asked:** if this is handed to a professional development team, will they
develop it as enterprise software, or will they say it is too complex and ask to
start again?

---

## 1. The verdict

**They will not ask to rewrite it, and they would be wrong to.** Four things
that normally trigger a rewrite demand are absent: nesting is flat (24 lines in
42,000 indented past 16 spaces), there are zero TODO/FIXME comments and one
commented-out line, there is no metaprogramming, and every one of ~60 file paths
cited in source comments still resolves. The domain engines are covered at 85–97%
by behavioural tests that run against two different stores and stay green under a
two-year clock shift.

The value is concentrated and defensible:

| Layer | Lines | Judgement |
|---|---|---|
| `domain/` engines | 10,831 | The moat. Nobody rewrites this. |
| `application/` services | 6,816 | Mostly keep. |
| `interface/`, `reporting/`, `agents/` | 13,991 | Keep, with corrections. |
| `ui/` | 29,346 | The genuinely replaceable part. |
| Regulatory data (`data/`) | 1,816 | Irreplaceable and under-governed. |

About a quarter of the codebase is the product. The rest is scaffolding a team
would touch anyway.

**What they will actually object to is narrower and more serious than "it is
complex".** The perimeter has no authentication, one documented endpoint reports
success while discarding data, and the transaction guarantee is a no-op on any
store but PostgreSQL. Those are three specific defects, not an architecture
problem.

**The one structural finding.** This is two codebases wearing one directory
convention. The newer half — PCAF Part C, GCF, capital, Part A — follows the
architecture. The older half — lending, and the Firebase bridge — was renamed
into `src/domains/` without being moved onto the storage seam, the scope model,
or the validation layer. Most gaps below fall along that line.

---

## 2. Method

Six independent audits plus direct verification. Every finding was reproduced by
reading the file or running the command; nothing is inferred from documentation.
Coverage: onboarding and developer experience, code readability, architecture and
boundaries, types and contracts, the test suite, operations and security. The
frontend and the report layer were audited directly.

---

## 3. Severity summary

| Group | Critical | High | Medium | Low |
|---|---|---|---|---|
| H0 Build and delivery | 3 | 2 | 1 | – |
| H1 Identity and perimeter | 5 | 4 | 2 | 1 |
| H2 Data integrity | 4 | 4 | 2 | – |
| H3 Contracts and types | 4 | 3 | 4 | – |
| H4 Regulatory claims | 2 | 5 | 2 | – |
| H5 Tests and developer loop | 2 | 5 | 5 | 2 |
| H6 Documentation and governance | 2 | 6 | 5 | 3 |

---

## H0 — Build and delivery. The first impression.

> **Delivered** (commit `H0 — green the build`). The type check now stamps
> `build-info.json` first, the metrics test loads the app once at module scope
> and the suite carries a 30-second timeout, and the browser job was failing on
> a real defect rather than a flake — the Part C book set the page to 542px at
> a 430px viewport once it had rows, because the rule keeping a wide table in
> its own scroll box was opt-in by a class nobody applied there. `LICENSE`
> carries the Apache-2.0 text, and `docs/RELEASE-AND-ROLLBACK.md` records the
> order to reverse code and schema in. **Outstanding: H0.5** — requiring the
> `gate` check in branch protection is an account-level action no commit can
> perform.

**H0.1 · CI has been red on `main` since E3. Critical.**
Last green run: PR #95 (E2). Every run since has failed. On `96ce567`, four of
seven jobs fail: `typecheck`, `test (22)`, `test-postgres`, `ui`. `test (20)` is
cancelled by fail-fast and `gate` is skipped because it needs them all. A red
badge is the first thing a team looks at, and it makes every other quality claim
in the repository read as unverified.

**H0.2 · `npm run typecheck` cannot pass on a clean checkout. Critical.**
`build-info.json` is gitignored and untracked, is written only by
`npm run build:info`, and no CI job runs that. Three files `require` it inside a
try/catch, so the runtime is correct, but TypeScript resolves the require
statically: `TS2307` × 3. Reproduced by moving the file aside.
*Fix:* commit a placeholder, or add a `.d.ts` shim, or run `build:info` in CI.

**H0.3 · One flaky test fails both test jobs. Critical.**
`tests/observability.test.js:263` exceeds Jest's 5-second default. It calls
`require('../src/server')` inside the test body then makes two supertest round
trips; 1.6s in isolation, 11s under CI load. 2,126 of 2,149 tests pass.
*Fix:* explicit timeout, and move the require to module scope.

**H0.4 · No LICENSE file, though `package.json` and the README assert Apache-2.0. High.**
`README.md:131` links to `../LICENSE`, outside the repository root. This is a
legal blocker at handover, not a documentation nit.

**H0.5 · `main` is unprotected and the `gate` job gates nothing. High.**
No branch protection rule, no `CODEOWNERS`. Netlify builds from `main` on push,
independently of CI, so a red build still deploys.

**H0.6 · No release or rollback scheme. Medium.**
Zero git tags across 279 commits, version pinned at `0.1.0`, no documented
rollback. The only path is Netlify's "publish previous deploy", which is
undocumented and would not revert an applied migration.

---

## H1 — Identity and the perimeter. The part a bank stops at.

> **Delivered** (commit `H1 — one door`). Accounts and sessions are rows in the
> one database; passwords are scrypt; a session is revocable and ends the
> moment an account is disabled; the browser holds no API key; roles decide
> scopes on all 154 routes through the existing resolver, closing B1 and B2;
> unscoped keys are held to `read`; the serverless function refuses to serve a
> production deployment `config.validate()` rejects; rate limits share one
> counter where PostgreSQL is present and say so where it is not; secrets are
> compared in constant time; and a deploy preview will not migrate a database
> it may share with production. `tests/authentication.test.js` holds the exit
> criterion and the five browser journeys sign in for real.
> **Outstanding: H1.10 and H1.11** — a rehearsed restore, a retention policy
> and a configured error sink are operator decisions, not code. See
> `docs/AUTHENTICATION.md` for what authentication deliberately does not do
> yet: no password reset by mail, no second factor, no single sign-on, and
> roles that are coarse until the product has a borrower portal.

**H1.1 · There is no user authentication. Critical.**
`ui/js/auth.js:110` — `login(name, email, role, organisation)` accepts any name,
any email, and a self-selected role including `admin`, validates only that the
role exists, and writes it to `localStorage`. No password field exists anywhere
in the frontend. Role-based access is browser-side page hiding.

**H1.2 · An unauthenticated endpoint hands every visitor a write-and-lock credential. Critical.**
`GET /v1/ui-config.js` is mounted with no auth (`router.js:165`) and emits the raw
`UI_API_KEY`. `src/platform/auth/api-key.js:65` admits that key with scopes
`read write lock assess`. `lock` is the scope that enters an assessment into a
regulatory disclosure. The source comment defends this on the grounds that a
browser key is public by construction — which holds only if the page is behind
authentication, and per H1.1 it is not.

**H1.3 · Every dashboard user is one tenant. Critical.**
`api-key.js:67` sets `orgId: 'ui'` literally. Tenant isolation below this line is
excellent (see the strengths section) and is defeated at the top: two institutions
on one deployment share one partition.

**H1.4 · The audit chain attests to a self-declared identity. Critical.**
`scopes.js:178` accepts `X-Actor` verbatim; `ui/config.js:33` fills it from the
self-asserted session. It reaches `lockedBy` on a lock and `actor` on the
hash-chained audit trail. The chain is cryptographically sound and the identity
inside it is whatever the browser typed. For a product positioned for ISO 14064-3
/ ISAE 3000 assurance, that trail is not evidence.

**H1.5 · Unscoped keys bypass authorization entirely. Critical.**
`scopes.js:147` — `if (held.unscoped) { … return next(); }` returns before any
check. Any key whose stored `scopes` is not an array holds every scope on all 146
routes, including `lock`, indefinitely, with no cutover date.

**H1.6 · RBAC is built and unused. High.**
`src/platform/auth/authorization.js` (268 lines) and the six-role model in
`src/shared/policies.js` are required by seven lending files. The other 139 routes
never call them. This is gap B1/B2 of the previous register, still open; E2
delivered scopes, which is a different axis.

**H1.7 · A public repository, a default salt, and no boot validation. High.**
The repository is public. `config/index.js:61` falls back to
`'default-dev-salt-change-in-production'`. `validate()` catches that at line 164 —
but `netlify/functions/fintech-api.js` never calls `validate()`, so production
cannot refuse to start. If the variable were unset in production, API key hashes
would be computable from a public constant.

**H1.8 · Rate limiting is per-container, so effectively absent. High.**
`rate-limit.js:14` uses the default MemoryStore. Production is a Lambda that
scales horizontally, so per-key limits are per-container. This matters most on
`assessLimiter` and `agentLimiter`, which front paid Anthropic calls: there is no
effective ceiling on spend from an abused key.

**H1.9 · A deploy preview can migrate and write the production database. High.**
`netlify.toml:8` ends the build with `db-migrate up --if-configured`, which skips
only when `DATABASE_URL` is unset. Neither the staging nor the preview context
defines its own, so both inherit whatever is set at site scope.
`docs/ENVIRONMENTS.md` instructs the operator to scope it; nothing enforces it.

**H1.10 · No tested restore, no retention policy, no PII handling. Medium.**
`scripts/` has `db-backup.js` and no restore. `docs/DATA-LAYER.md` verifies a dump
with `pg_restore --list`, a readability check, and defers RPO/RTO. A tree-wide
search for retention, GDPR, PII or data classification returns one incidental hit.
Actor emails are written into an append-only hash-chained table with no erasure
path.

**H1.11 · Alerting is capability, not configuration. Medium.**
The Sentry envelope client is correct and inert: no DSN is set, no log drain is
configured, and the audit chain is verified only by a manual script. The runbook
that `docs/DATA-LAYER.md` and `docs/OBSERVABILITY.md` both defer to does not exist.

**H1.12 · Secret comparison is not constant-time. Low.**
`api-key.js:65,78` compare with `===`. Hard to exploit; a bank's security review
will flag it.

---

## H2 — Data integrity and the storage seam.

> **Delivered** (commit `H2 — one seam`). There is now one adapter per store
> behind one interface, chosen once by the mode `capability()` resolves, and
> `tests/store-conformance.test.js` runs the same contract against every
> adapter the process can reach — so a difference between two stores is a
> failing test rather than something found in production, and the differences
> that are real and deliberate are stated there. The five record types that
> were written past the seam — lending projects, monitoring entries, agent
> runs, pipeline runs, webhook subscriptions — go through it, in five new
> tables (migration `0005`). The exit criterion is a test:
> `POST /v1/projects` on a deployment that cannot persist answers **503
> naming `DATABASE_URL`**, and never 201. A caller that needs atomicity asks
> for it by name and is refused rather than silently downgraded on a durable
> store that cannot commit a group. The in-process store refuses at its
> ceiling instead of forgetting its oldest record. Factor overrides are an
> argument to `runPartC()` held in an `AsyncLocalStorage` scope for the
> duration of that one call. The two private seams inside Part C are gone, the
> registry knows all nineteen generated columns and the origin lookup uses its
> index, and the reference project has moved out of `tests/` into `data/`.
> The bridge is 417 lines down to 176 and is now two things only: the core
> engine read, and the driver behind the seam's Firebase adapter —
> `tests/storage-seam.test.js` fails the build when a sixth record type
> reaches for it.

**H2.1 · A documented endpoint reports success while discarding the record. Critical.**
`POST /v1/projects` → `saveProject()` → `bridge/firebase.js:163`:
`const db = getDatabase(); if (!db) return null;` — then the route returns
`201 { success: true, message: 'Project saved.' }`. On a PostgreSQL-only
deployment, which the documentation calls primary, this has never written
anything. Eight domain files bypass `platform/database/store` and call the bridge
directly; the bridge carries 28 such guards across 14 write functions. Monitoring
entries and webhook subscriptions have the same shape.

**H2.2 · `transaction()` is a silent no-op off PostgreSQL. Critical.**
`store.js:397` — `if (_pgLive()) return db.documents.transaction(fn); return fn();`
The comment says a caller needing the guarantee can read
`capability().transactional`. The three call sites that exist because they need
atomicity — lock-and-supersede, adopt-to-book, BOQ revision carry-forward — do not
read it. The two unique indexes enforcing "one locked assessment per policy-year"
and "one investment per adopted record" exist only in PostgreSQL.

**H2.3 · `STORAGE_BACKEND` does not isolate the backend. Critical.**
The CRUD verbs branch on `isDurable()` ("is Firebase configured") rather than on
the chosen mode. With `STORAGE_BACKEND=memory` explicitly set and Firebase
configured, writes still reach Firebase. The module header forbids dual-writing in
exactly those terms; the rule is enforced for Blobs and broken for memory.

**H2.4 · The memory store evicts at 500 records without a word. Critical.**
`store.js:80`. Write 600, read back 500, `get()` on the first returns null,
`count()` reports 500. No error, no warning. This is the same class as the
"201 projects rolled up as 200" defect the file says was fixed — fixed for the
list cap, not for the bucket.

**H2.5 · There are four backends and no adapter interface. High.**
`store.js` is one 452-line module repeating `if (_pgLive())` / `if (_blobsLive())`
/ `if (isDurable())` per verb. Measured divergences beyond the above: `page()`
cursors are keyset on PostgreSQL and base64 offsets elsewhere; `query()` ordering
is `String(...).localeCompare` off PostgreSQL, so numeric fields sort
lexicographically.

**H2.6 · Per-request tenant data lives in an engine global. High.**
`pcaf-part-c/domain/factors.js:35` — `let _overrides = {}`, set and cleared by an
HTTP handler around the calculation (`runs.js:105`). Safe only because `runPartC`
is synchronous. One `await` inside that block and one insured party's emission
factors reach another party's disclosure. The `finally` resets to `{}` rather than
restoring the previous value. The same file does `fs.readFileSync`, the only I/O
in any `domain/` layer.

**H2.7 · Two more private storage seams inside one domain. High.**
`partc-run-store.js:25` and `learning-store.js:32` each re-implement the tri-branch
backend selection with their own module-level `Map` and their own eviction cap.
Three independent copies of the same decision.

**H2.8 · The collections registry is missing two of nineteen generated columns. Medium.**
`origin_system` and `origin_record_id` (`migrations/0001_initial.sql:133-134`) back
the unique index enforcing one investment per adopted record. A developer reading
the registry cannot see that a query on `origin.recordId` is indexed.

**H2.9 · Production code imports a test fixture. Medium.**
`application/methodology/demonstrations.js:16,37,104` and `partc-demo-data.js:18`
require `tests/fixtures/fisheries.js`. The methodology statement — the artefact
described as the one from which the product could be rebuilt — is generated by
executing a fixture under `tests/`, making `tests/` a runtime dependency of the
deployed function.

---

## H3 — Contracts and types. Can a developer know the shape of the data?

> **Delivered — all eleven gaps closed.** The findings below stand as the
> record of what was found; each is answered here.
>
> **H3.1** Every one of the 157 operations documents its reply, and
> `tests/api-contract.test.js` calls every GET needing no path parameter and
> validates the body against what the document claims — so a wrong schema
> cannot survive. The count is pinned as an equality, not a threshold.
> **H3.2** The storage seam is typed, verb by verb. **H3.3** `strict: true`
> with `noImplicitAny` the single exception. **H3.4** All 23 reference files,
> the Carbon-Management bridge and the model's extraction output are held to a
> schema at load, and the process refuses to start on a bad one.
> **H3.5** `src/shared/models/entities.js` declares each core entity once and
> names the three unrelated "projects" apart; one PCAF data-quality table
> where there were two. **H3.6** One numeric guard, and a sweep refuses the
> raw coercion anywhere under `src/`. **H3.7** Every write carries a schema
> the router can read; no handler calls a Joi schema directly.
> **H3.8** One intensity screen, governed by the baseline registry.
> **H3.9** No placeholder remains; each model file declares a shape and a
> vocabulary. **H3.10** The worklist measures by adopting the pragma and
> running the tree's own check, so its counts are the real cost.
> **H3.11** `ui/js` and `tests` are inside the check, on three configurations
> so a server file cannot reach for `document` or `expect()` and pass.
>
> Two files crossed the 500-line cap and are split behind barrels
> (`gcf/`, `partc-registry/`), the pattern this repository already uses.

**H3.1 · The published contract types 13% of its replies. Critical.**
`docs/openapi.json`: 146 operations, 19 with a real response schema, 119 returning
`{"type":"object","additionalProperties":true}`, 8 with no content.
`POST /v1/pcaf/part-c/assess`, which produces the regulatory figure, documents its
success body as an object of unknown contents. The generator supports response
hints via `doc()`; three files use it. A bank generating a client can construct
every request and understand one reply in eight.

**H3.2 · The storage seam is untyped, including its arity. Critical.**
Compiler-emitted declarations for `src/platform/database/store.js`:
`export let get: (...args: any[]) => Promise<any>` — likewise `list` and `query`.
Every persisted entity enters the application as `any`.

**H3.3 · The green typecheck proves very little. Critical.**
`jsconfig.json` sets `strict: false`. Across 42,364 lines there are 395 `@param`,
81 `@returns` and 16 `@typedef`. Of 576 exported functions, 122 carry any
annotation. 80% of emitted signatures have every parameter typed `any`. The
structure test pins `checkJs: false` so configuration cannot drift; nothing pins
`strict` or measures annotation density.

**H3.4 · Nothing validates data on the way in except HTTP bodies. Critical.**
Unvalidated: the twelve factor tables (`JSON.parse` straight into the emissions
arithmetic), the Carbon-Management bridge (fields spread into API responses
untouched), Claude extraction output (`materials` array-checked, then
`mat.quantity * factorData.factor`), and everything read back from the store. The
22 JSON files under `data/` have no schema. `ajv` is a devDependency imported
nowhere.

**H3.5 · Core entities have no single declaration. High.**
A Part C assessment is declared once, as a 42-field object literal in
`partc-assessments.js:162`, and twice as an 18-field subset (the collections
registry and a SQL function). No Joi schema, no typedef. "Project" is three
unrelated entities sharing one word across lending, Part C and GCF.
`PCAF_DATA_QUALITY` is exported twice with different content and different key
names (`name:` vs `label:`); production reads one, a test asserts the other, and
neither matches the two authoritative option tables the engines use.

**H3.6 · Six cloned numeric guards, two of which are the original bug. High.**
There is no shared coercion helper. 330 `Number(`, 28 `parseFloat(`, 13
`parseInt(` call sites; 118 instances of `Number(x) || 0`. Six private helpers
with three different null policies. Two of them sit in
`partc-portfolio.js:42,82` — the module that computes the disclosed
premium-weighted data-quality score. The score itself is safe because
`_premiumWeighted` excludes unscored rows, but absence and a genuine zero are
indistinguishable at that boundary.

**H3.7 · Validation is placed four different ways. High.**
`validate()` middleware in most routes; inline `schema.validate()` in three;
Joi inside `domain/` for all of GCF, which has no `interface/schemas/` directory
at all; and none in `desk.js`, `assurance.js` and `agent/runs.js`. Because the
OpenAPI generator reads the `validate()` chain, 15 of 59 write operations ship
with no request schema.

**H3.8 · Two contradictory Sri Lanka band sets are both live. High.**
`TAXONOMY_SL` (520/780) serves `GET /v1/taxonomy`; `TAXONOMY_LK` (600/900) serves
`GET /v1/ndc-sdg/framework` and the SHA-256-hashed Green Loan Certificate. A
building at 560 kgCO2e/m² is Green from one endpoint and Transition from the
other. The constants file documents the conflict and rightly says the answer
belongs to CBSL — but the product ships both to a client with no stated answer.

**H3.9 · `src/shared/models/` is not a model layer. Medium.**
Seven files, 543 lines. Two are `module.exports = {}` placeholders citing build
steps 6 and 13. `src/shared/types.js` is 14 lines holding one typedef. That is the
entire shared type vocabulary for a 42,000-line system.

**H3.10 · The typecheck worklist counts are stale. Medium.**
The file list is exact (77 paths, diffs clean). The counts are not: 362 claimed
versus 428 actual, and `partc-methodology-doc.js` is listed at 0 errors when it
has 55 — the largest offender in the tree, presented as ready to adopt. The
structure test asserts only that each path appears, never reading the counts.

**H3.11 · 34,789 lines are outside the typecheck entirely. Medium.**
`jsconfig.json` includes `src`, `netlify/functions` and `scripts`. It excludes
`ui/js` (12,741) and `tests` (22,048). The frontend is the largest consumer of
these API responses and is exactly where four mechanical defects have shipped.

**H3.12 · The TypeScript decision — the facts. Informational.**
Pure CommonJS (858 requires, zero imports), so `module: "commonjs"` compiles it
without an ESM rewrite. `tsc` is wired; esbuild is already a runtime dependency
and transpiles TypeScript natively. Jest needs a transform and ESLint needs
`typescript-eslint`. Turning `strict` on today yields 2,482 errors, of which 2,437
are missing annotations and **only 56 are null-safety failures**. The logic is
sound; the gap is annotation. This is an incremental path, not a rewrite.

---

## H4 — Regulatory claims. The part that is the product.

**H4.1 · A PCAF clause is claimed and cannot execute. Critical.**
`partc-portfolio.js:218` weights data quality by ceded premium for treaty
reinsurance, citing Box 6-4, p.108. `cededPremium` appears in exactly three places
in the repository, all inside the function that reads it. No schema produces it,
no projection sets it, no test exercises it. `disclosed.ceded` is permanently
null, the report line at `sections.js:226` never renders, and `CLAUDE.md:441`
presents the substitution as delivered.

**H4.2 · The material constant is an unconfirmed placeholder. Critical.**
`data/factors/a5-defaults.json` sets site energy at 40 kgCO2e/m² and states in its
own `gap` field that this constant drives about 97% of the disclosure on the
default path. The grid factor is labelled "Sri Lanka grid placeholder". The factor
tables carry no version, no effective date, no checksum and no schema. This is the
opposite of the locked, traceable regional baseline the strategy section commits
to, and it is the commercial risk as much as the technical one.

**H4.3 · The conformance matrices prove citation, not behaviour. High.**
38 Part C rules and 32 GCF rules map clause → implementation → proving test. The
tests assert unique ids, `clause.length > 5`, `rule.length > 20`, and that the
cited file and test name resolve. Nothing asserts the rule is exercised or the
path reachable. This is how H4.1 survived, and it undercuts the "conformance
shown, not asserted" positioning.

**H4.4 · The GCF conformance test verifies almost nothing. High.**
`tests/gcf-conformance.test.js:50` builds its cited-file set with a regex over
`services|data|tests|config|models|routes|schemas|ui` — top-level directories that
the architecture test elsewhere asserts no longer exist. Measured: Part C checks
38 of 38 paths; GCF checks **3 of 32**. The test passes green. The corrected regex
is already in the Part C copy.

**H4.5 · Superseded regulatory logic is live in the browser. High.**
`ui/js/ndc-sdg.js:9` carries an SLGFT activity table with all three errors
`src/shared/constants.js:241` documents as wrong: `M1.1` for new construction at
600 kgCO2e/m² (it is M6.3, and the criterion is relative), `M6.1` labelled Clean
Transportation (M6.1 is renovation; electric rail is M6.7), and `A2.1` labelled
Flood-Resilient Construction (A2.1 is climate insurance). The sibling
`ui/js/taxonomy.js` was corrected. No sweep test reads `ui/`.

**H4.6 · The agents screen fabricates regulatory memos when the backend is down. High.**
`ui/js/agents.js:134` onward holds five full DEMO MODE memos with invented carbon
figures, benchmark percentiles, covenant packages and pricing (−18 bps). They
carry a `[DEMO MODE]` prefix, but this is the failure `src/shared/report-integrity.js`
and its whole test suite exist to prevent, surviving in the browser where nothing
sweeps.

**H4.7 · No golden-file test for the generated disclosure. High.**
2,730 lines of report code produce the regulated deliverable. Tests assert
content-model properties (`gaps.length > 5`, `reason.length > 30`). The only PDF
check is well-formedness. A table overflowing, a figure off-page or a section
silently dropped is invisible to CI.

**H4.8 · 143 prose fields are hardcoded in the engines. Medium.**
`note:` strings up to 227 characters, 7,712 characters in total, embedded in
domain source. There is no content layer, so a compliance officer changing wording
requires a developer and a deploy.

**H4.9 · Thresholds are named constants whose values are hardcoded in messages. Medium.**
`decision-constants.js:43,45` define the loan limits; `decision-engine.js` lines
169, 180, 267, 322 and 330 write "SGD 100M" into the prose. Change the constant
and five reasons a credit committee reads become false.

---

## H5 — The test net and the developer loop.

**H5.1 · 268 tests assert on the literal text of UI source. Critical (friction).**
Sixteen suites, 363 tests, 524 assertions are greps against source. The worst,
`desk-ui.test.js`, is 95% source-text assertions pinning UI labels, exact ternary
expressions and call-argument order. Renaming one tile label produced a failure
that printed 702 lines of terminal output — the entire module as the "received
string" — with no file, no line and no instruction. A team that hits three of
these in week one starts deleting assertions, and takes the good rules down with
the bad. The rules they encode are real and hard-won; the instrument is wrong.
Playwright already exists and every one of them is directly assertable there.

**H5.2 · The original lending route surface is at 0% function coverage. Critical.**
Thirteen files at zero, including `/v1/assess`, `/v1/covenant`, `/v1/score`,
`/v1/portfolio`, `/v1/webhook` and `platform/bridge/engine.js` — the top of the
product's own API table. `tests/assess.test.js` and `tests/extract.test.js` both
claim in a header comment that AI calls are mocked; neither contains a single
`jest.mock`. They exercise 401 and 400 only.

| Area | Statements | Functions |
|---|---|---|
| gcf | 96.9% | 95.5% |
| capital | 95.4% | 93.2% |
| pcaf-part-c | 91.1% | 90.4% |
| pcaf-part-a | 84.6% | 95.2% |
| **lending** | **58.1%** | **44.9%** |
| **platform/database** | **52.6%** | **54.5%** |
| **platform/bridge** | **15.2%** | **16.4%** |

Thresholds are global only, so a whole domain can sit at zero while the suite
passes. There is no `collectCoverageFrom`, so seven never-loaded files are absent
from the denominator entirely.

**H5.3 · No developer can run the second test suite. High.**
`package.json` defaults `TEST_DATABASE_URL` to port 54329. That port appears in
exactly one file in the repository: `package.json`. `docker-compose.yml` has no
postgres service. No provisioning script, no mention in any doc. The failure is a
raw `ECONNREFUSED` stack trace. So developers run the memory suite and learn about
foreign-key failures from CI — the exact loop `docs/DATA-LAYER.md` records as
having cost 27 test failures once already.

**H5.4 · `test:postgres` does not run the same suites on PostgreSQL. High.**
Fifteen of 101 suites pin themselves to memory at module scope, including the
entire GCF domain (7 suites, ~250 tests) whose `infrastructure/store.js` is a
storage adapter. `CLAUDE.md` and `docs/DATA-LAYER.md` both claim "the same 101
suites". `tests/jobs.test.js:13` already has the correct guard pattern.

**H5.5 · `tests/api-contract.test.js` is order-dependent. High.**
Two tests fail under `--randomize`; one reads a `clientId` another test created.
Every other suite survives. This is the shape that becomes "works on my machine"
once the team runs focused subsets.

**H5.6 · No shared test bootstrap. High.**
`UI_API_KEY` is set in 34 suites with 13 distinct literals. 25 suites define their
own `auth` helper. 45 require `../src/server` directly. 20 set `STORAGE_BACKEND`.
The entire helper layer is one PDF text extractor used by one suite. Any change to
auth or key format is a 34-file edit.

**H5.7 · The AI mocks do not match the SDK the code uses. Medium.**
Three suites mock `messages.create`; the production loop uses
`messages.stream().finalMessage()`. `platform/ai/agent.js` sits at 75% with the
multi-turn tool loop and `pause_turn` resumption uncovered. The SDK is on a caret
range, so a minor bump can change the response shape while every mock keeps
passing.

**H5.8 · `npm test` forces coverage, so running one file fails the build. Medium.**
`npm test tests/observability.test.js` passes 22 tests then exits non-zero on
global thresholds. This hits every developer many times a day and teaches them to
distrust exit codes.

**H5.9 · A test writes into `src/` and spawns a nested Jest run. Medium.**
`tests/structure.test.js:214` writes a probe file into `src/domains/gcf/domain/`,
shells out to Jest, then removes it in a `finally`. A `Ctrl-C` leaves a stray file
in the source tree.

**H5.10 · Worker schemas are never truncated between files on PostgreSQL. Medium.**
One schema per worker, migrated once, never cleaned. `'org1'` appears across five
suites and worker assignment is non-deterministic. Latent, and very hard to
diagnose when it fires.

**H5.11 · 45 suites never close their supertest servers. Medium.**
Cause of the "worker process failed to exit gracefully" warning, traced to an open
`Timeout` handle. Cosmetic today.

**H5.12 · Two determinism results worth keeping. Positive.**
The suite passes with the clock shifted to 2028. Zero `Math.random`, zero `.only`,
zero snapshots, no outbound network calls.

---

## H6 — Documentation and governance.

**H6.1 · Zero governance files. Critical.**
Missing: `CONTRIBUTING.md`, `CODEOWNERS`, `SECURITY.md`, `CHANGELOG.md`, a PR
template, an issue template, and any ADR directory. `.github/` contains two files.
A team of three cannot divide review, agree conventions, or receive a vulnerability
report.

**H6.2 · No developer-facing architecture documentation exists. Critical.**
8,142 lines across `docs/` and nothing that answers "what happens when a request
hits `POST /v1/pcaf/part-c/assess`" or "what are the tables and how do they
relate". `docs/ARCHITECTURE.md` is a March product-vision essay whose system
diagram names files in a different repository and five agents that do not match
the nine in `src/domains/*/agents/`. There is no ERD, no sequence diagram, and no
diagram of any kind anywhere in the repository.

**H6.3 · `CLAUDE.md` is doing the job of the missing docs and is the wrong shape for it. High.**
649 lines, 15,059 words, roughly 75 minutes of reading. 57% is domain narrative
written as retrospective essay. Code Conventions is 0.7% and Testing 0.5% — and
Code Conventions points at `schemas/` and `services/agents/`, neither of which
exists. Four falsifiable errors: Part A described as "planned, not built" over
3,115 routed lines; `services/` cited twice; five endpoints in the table that
return 404 (`POST /v1/score`, `GET /v1/taxonomy`, `POST /v1/pcaf`,
`POST /v1/covenant`, `POST /v1/webhook` — all are project-scoped or plural in the
router); and Firestore named throughout where the code calls
`admin.database()`, which is Realtime Database. In fairness, 131 of 132 cited file
paths resolve — the drift is in prose and tables, not references.

**H6.4 · `README.md` contradicts the code on six checkable claims. High.**
"26 tests across 6 suites" (actual: 101 suites, 2,149 tests); `M1.1` and `M4.1`
taught as valid activity codes when the source-fidelity work removed both; API
keys described as living in Firebase since migration 0002 moved them to
PostgreSQL; `JWT_SECRET` listed as required when it is read nowhere in `src/`;
"PCAF v3 financed emissions" on a file `CLAUDE.md` says must stop claiming to be
PCAF; and an endpoint table omitting ~120 of 146 routes. It also never mentions
the setup path that actually works.

**H6.5 · The local development stack is broken in two ways and models the wrong database. High.**
`docker-compose.yml:17` requires a `.env` a fresh clone does not have — `docker
compose config` fails outright. Line 28 runs `node --watch server.js`, a path that
has not existed since the `src/` move. The only backing service is a Firebase
emulator; there is no PostgreSQL. `Dockerfile` uses `npm ci --production`, so the
container cannot run any check.

**H6.6 · No glossary, and three different 1–5 scales. High.**
A newcomer meeting `A5.2`, `B7`, `IAE`, `CRS`, `SLGFT`, `Option 2b`, `BOQ`,
`MCI-1`, `EVIC`, `gifa_m2`, `countsInHeadline` or `FPIC` must reverse-engineer each
from scattered comments. Worse, Part C's option→score table, Part A's
per-asset-class table and GCF's four evidence tiers coexist and are documented as
non-interchangeable. A newcomer who assumes one scale produces a wrong regulatory
figure.

**H6.7 · A destructive command sits in the onboarding list with no guard. High.**
`npm run setup:seed-clear` calls `.remove()` on five Firebase paths with no
confirmation, no dry-run and no environment check, one keystroke from the
non-destructive `setup:seed`. `README.md:81` has just told the developer to put
real Firebase credentials in `.env`.

**H6.8 · `/health` and the boot banner report capabilities the deployment lacks. Medium.**
`npm run setup:env` writes literal placeholders. The server then prints
`Firebase: ✓ connected` and `AI: ✓ ready`, and `/health` returns all three
booleans true, while the same process logs that the service account is not valid
base64. `server.js:122` is a presence check, not a shape check — defeating the
stated purpose of the block. `ai-status.js` already has the shape check needed.

**H6.9 · Two comment cultures, split by vintage. Medium.**
Nine files still carry `Implementation: Step N` scaffold headers; the newer
domains are written in the essayistic style. Nothing tells a newcomer which to
write in.

**H6.10 · Nineteen underscore-private names cross module boundaries. Medium.**
Concentrated in the recent barrel splits: `reports.js` imports eight of them from
four parts, `pdf.js` takes `_humaniseKey` from the *sample-data* module, and
`gcf/application/cn-package.js` reaches into Part C's private PDF primitives — a
structural edge between two of the three scopes that must never merge. ESLint's
`varsIgnorePattern: '^_'` hides unused ones.

**H6.11 · Node is declared four times, inconsistently. Medium.**
`engines: >=18`, Dockerfile `node:18-alpine`, CI matrix `[20, 22]`, Netlify
`nodejs22.x`. No `.nvmrc`, no `.editorconfig`, no Prettier config.

**H6.12 · ESLint enforces almost nothing. Medium.**
`js.configs.recommended` plus four relaxations. No `max-len` (1,129 lines exceed
120 characters), no complexity limit, no import-order rule, no naming rule, and no
`no-restricted-syntax` guarding any documented invariant. `'use strict'` is missing
from 52 files. Every convention broken in this report is broken where no test
looks.

**H6.13 · Rounding is reimplemented twelve times. Medium.**
Three different null policies and four default precisions, including inside
`capital/`, whose `capital-math.js` exists to hold exactly this. `_num` has seven
definitions, `pct` six with different outputs.

**H6.14 · Five error-signalling mechanisms. Medium.**
`err.statusCode` in three sub-styles (63 sites), a `make()` factory used by two
files, direct `res.status(4xx).json()` bypassing the central handler (139 sites),
bare `throw new Error` becoming a 500 (33 sites), plus Joi and `return null`. AI
unavailability alone is detected three ways, including twelve hand-rolled copies of
`err.message.includes('ANTHROPIC_API_KEY')`.

**H6.15 · Agent tool schemas are pasted 2–7 times and have drifted. Medium.**
`check_taxonomy_alignment` has seven copies, none textually identical. The
`required` arrays still agree, so nothing is broken — and nothing keeps them in
sync with the single implementation in `tools.js`.

**H6.16 · Seven orphan files and 24 unused exports. Low.**
Three are empty placeholders citing build steps. `platform/ai/core-ai.js` (99
lines) describes calling a Netlify function that no longer exists.

**H6.17 · `platform/` carries Part C naming for generic infrastructure. Low.**
`store.js:3` is headed "PCAF Part C: Storage Layer" and delegates to
`fb.savePartCRecord` for every collection, including GCF records, the capital book,
jobs and API keys.

**H6.18 · The repository root holds 15 MB of PDFs and six competing briefs. Low.**
26,754 words of markdown at the root before `docs/` is opened, with no index
saying which is authoritative, and a personal-name-branded `.docx` beside the entry
point. The standards PDFs are load-bearing (one is checksummed by a test), so this
is a "put them somewhere and say so" problem.

---

## 4. What is strong, and must survive

State these to the incoming team before they form an opinion.

1. **Tenant isolation is structural.** `orgId` is a mandatory positional argument
   on every store verb, and the PostgreSQL adapter puts `org_id = $1` on every
   statement. No query path can return another organisation's data, and no store
   call anywhere passes a literal orgId. This is the strongest part of the system.
2. **No secrets have ever been committed.** All 3,315 objects across all branches
   were scanned for the usual patterns. Every hit is a placeholder or a fixture.
   Notable for a public repository.
3. **SQL injection is closed off.** Every dynamic identifier is regex-validated
   before interpolation; values are always parameterised.
4. **Migrations are sound.** Checksummed, ledgered, each in its own transaction
   under an advisory lock, with drift detection and working `down` sections. A
   failed migration aborts the build before the function deploys.
5. **The architecture test is real.** It parses requires, resolves targets, and
   enforces that no domain engine imports another, that the platform never imports
   a domain, and that no engine requires `pg`, `express` or the Anthropic SDK.
   "The engine does the arithmetic, never the model" is a property of the build.
6. **Generated documentation cannot rot silently.** `API-SCOPES.md`,
   `openapi.json` and both conformance matrices are generated and test-pinned.
7. **The domain engines are properly tested and deterministic** — 85–97% coverage,
   two stores, stable under a two-year clock shift.
8. **Scope enforcement is centrally reached** through a single `admit()` exit, so
   no authenticated route can skip authorization.
9. **The comment culture is a net asset.** 22% comment density sounds high, but the
   prose encodes regulatory reasoning a team cannot reconstruct from the code. The
   risk is rot, not volume, and the mitigation is ADRs, not deletion.

---

## 5. The plan

Seven phases. H0 is immediate; H1 and H2 must precede any bank's data; the rest
can run in parallel across a team.

| Phase | Theme | Effort | Priority |
|---|---|---|---|
| **H0** | Green the build, protect `main`, add a LICENSE | 1 day | Immediate |
| **H1** | Real authentication, per-user identity, RBAC on every route | 3 weeks | Critical |
| **H2** | One storage seam, real transactions, no silent write loss | 2–3 weeks | Critical |
| **H3** | Response contracts, entity types, validation at every boundary | 3–4 weeks | High |
| **H4** | Regulatory claim audit and baseline governance | 2 weeks | High |
| **H5** | Move UI sweeps to Playwright, cover lending, local PostgreSQL | 3 weeks | High |
| **H6** | Governance files, a code tour, a glossary, a working dev stack | 2 weeks | High |

**H0 — Green the build (1 day).**
Commit a placeholder `build-info.json` or add a type shim. Give the metrics test
an explicit timeout and hoist its require. Diagnose the Playwright report artifact.
Add the Apache-2.0 text. Turn on branch protection requiring `gate`.
*Exit criterion:* a green badge on `main`, and a merge that cannot land red.

**H1 — The perimeter (3 weeks).**
The client side is one chokepoint: 42 of 50 calls go through `CARBONIQ_fetch`, and
seven raw `fetch` calls in six files need changing. The server side sets identity
in four places across two files. Firebase Auth JWT verification already exists and
is correct. Replace the role picker with a real sign-in, derive `orgId` and role
from verified claims, put `authorize()` on the router rather than on seven files,
refuse unscoped keys after a cutover date, move rate limiting to a shared store,
and call `config.validate()` from the Netlify function.
*Exit criterion:* an anonymous request to every route returns 401, and a test
proves a credit officer cannot lock an assessment.

**H2 — The seam (2–3 weeks).**
Register lending's collections and route its writes through the store. Turn the
four backends into four adapters behind one interface and run one conformance
suite against all of them. Make `transaction()` refuse rather than silently
degrade where a caller needs atomicity. Fix the memory eviction to error rather
than drop. Pass factor overrides as an argument instead of a module global. Scope
`DATABASE_URL` per context and make the migrator refuse to run on a preview.
*Exit criterion:* `POST /v1/projects` returns 503 rather than 201 when it cannot
write, and the adapter conformance suite passes on all four backends.

**H3 — Contracts (3–4 weeks).**
Add a `response:` hint to every route so the OpenAPI document types its replies.
Declare each entity once and derive the literal, the projection and the SQL from
it. Validate the factor tables, the bridge and the agent output at their
boundaries. Consolidate the six numeric guards into one. Then decide TypeScript on
the evidence in H3.12: `noImplicitAny` first, directory by directory, on the
worklist discipline that already works.
*Exit criterion:* a generated client can type every response, and `strict` is on
for `src/platform` and `src/shared`.

**H4 — The claims (2 weeks).**
Make every conformance rule assert that its cited test exercises its cited
implementation, and delete or implement the ceded-premium path. Fix the GCF
conformance regex. Version the factor tables with an effective date and a
checksum, and put the baseline behind the same lock-and-restate discipline as an
assessment. Resolve or clearly present the two Sri Lanka band sets. Remove the
superseded taxonomy table from the browser and extend the sweeps to `ui/`. Replace
the fabricated demo memos with an honest empty state. Add a golden-file test for
the disclosure.
*Exit criterion:* every conformance rule is executed by its cited test, and no
regulatory constant is unversioned.

**H5 — The net (3 weeks).**
Move the eight UI sweep suites into Playwright, where their rules are directly
assertable. Build `tests/helpers/app.js` and delete 34 bootstraps. Add
`collectCoverageFrom` and per-directory thresholds. Cover the lending happy paths.
Add a postgres service to `docker-compose` on 54329 and make `globalSetup` print
the command on `ECONNREFUSED`. Split `test` from `test:ci` so coverage thresholds
stop failing single-file runs.
*Exit criterion:* a developer can run both suites from a clean clone, and no test
asserts on source text outside the architecture, observability and IP-surface
rules.

**H6 — The handover pack (2 weeks).**
`CONTRIBUTING.md`, `CODEOWNERS`, `SECURITY.md`, a PR template. `docs/CODE-TOUR.md`
with a request lifecycle, a module map, a mermaid ERD generated from
`collections.js`, and one sequence diagram. `docs/GLOSSARY.md`. Promote the
domain narrative from `CLAUDE.md` into `docs/adr/`, one decision per file, and
trim `CLAUDE.md` to operating rules. Regenerate the README's endpoint table from
`openapi.json`. Fix `docker-compose`. Guard `seed-clear`. Pin Node once.
*Exit criterion:* a developer who has never seen the repository can clone, run
both suites, find any module from the code tour, and open a correct PR — in under
two hours, without asking anyone.

---

## 6. What this costs and what it buys

Roughly 15–17 weeks of one developer, or 6–7 weeks for a team of three working
H1/H2 in sequence and H3–H6 in parallel. H0 is a day.

It does not touch the engines. No arithmetic changes, no factor changes, no
disclosure figure moves. Every phase above is perimeter, plumbing, contract,
proof or documentation — which is why this is a handover programme rather than a
rewrite, and why the answer to the question at the top is that the team should
take it on.
