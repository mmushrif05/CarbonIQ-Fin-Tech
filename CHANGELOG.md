# Changelog

Notable changes to the application. The API contract has its own record in
`docs/API-CHANGELOG.md`; this file covers everything else.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows [semantic versioning](https://semver.org/). Releases
are tagged after a deploy is confirmed, per `docs/RELEASE-AND-ROLLBACK.md`.

## [Unreleased]

### Added
- `LICENSE` — Apache-2.0, the licence `package.json` has always declared.
- `docs/RELEASE-AND-ROLLBACK.md` — how a release is cut and how to get back
  from a bad one, including the order to reverse code and schema in.
- `docs/HANDOVER-GAP-ANALYSIS.md` — the seven-phase register this work follows.

### Added — authentication (H1)
- Accounts and sessions in the database (migration `0004`), with scrypt
  passwords, revocable sessions on two clocks, and a first administrator
  created with `npm run user:create`.
- One authentication middleware taking either a session token or an API key,
  so a role now decides what every one of the 154 routes will do.
- `POST /v1/auth/login`, `logout`, `me`, `password`, and `admin`-scoped account
  administration under `/v1/auth/users`.
- A shared rate-limit counter where PostgreSQL is present, and `GET /health`
  saying which scope the limits actually have.
- `docs/AUTHENTICATION.md`, including what is deliberately not built yet.

### Added — one storage seam (H2)
- One adapter per store behind one interface (`src/platform/database/adapters/`),
  selected once by the resolved mode instead of branched on per verb.
- `tests/store-conformance.test.js` — the same contract run against every
  adapter this process can reach, with the deliberate differences between the
  stores stated rather than left to be discovered.
- Migration `0005`: `fintech_projects`, `fintech_monitoring`, `agent_runs`,
  `pipeline_runs` and `webhooks` — the five record types that were written past
  the seam.
- `tests/storage-seam.test.js` holds the phase's exit criterion and fails the
  build when a new record type reaches for the Firebase bridge.

### Changed — one storage seam (H2)
- `store.transaction(fn, { name, required: true })`. A durable store that
  cannot commit a group now refuses with 503 `NOT_TRANSACTIONAL` naming
  `DATABASE_URL`, rather than applying half of a lock-and-supersede on a real
  book. The three call sites that exist because they need atomicity say so.
- Client factor overrides are an argument to `runPartC(input, { overrides })`,
  scoped to that call, instead of a module global set and cleared around it.
- The Part C run store and the learning store go through the seam. Each used
  to choose between PostgreSQL, Firebase and a private `Map` of its own.
- The reference project moved from `tests/fixtures/fisheries.js` to
  `data/partc/fisheries-reference.js`; `tests/` is no longer a runtime
  dependency of the methodology statement.
- `src/platform/bridge/firebase.js` is 417 lines down to 176: the core engine
  read, and the driver behind the seam's Firebase adapter. Nothing else.
- The collections registry carries all nineteen generated columns, and the
  duplicate check in `POST /v1/desk/adopt` uses the origin index rather than
  reading the whole book.

### Fixed — one storage seam (H2)
- `POST /v1/projects` returned **201 Created** and stored nothing on a
  deployment holding its records anywhere but Firebase. The write went past the
  seam to a bridge function that returned quietly when Firebase was absent.
  Monitoring entries, agent runs, pipeline runs and webhook subscriptions had
  the same shape. All five are refused with a 503 naming `DATABASE_URL` where
  they cannot be kept.
- `STORAGE_BACKEND=memory` on a deployment with Firebase configured wrote to
  both and read back from Firebase. One adapter is chosen once, so it cannot.
- The in-process store dropped its oldest record past 5,000 without a word.
  It now refuses the write (507 `STORE_FULL`) rather than forgetting one.
- A monitoring entry was stored under the project id alone, with no
  organisation anywhere in the path, so two banks financing the same project
  wrote over each other.

### Changed
- The browser is handed no API key. `GET /v1/ui-config.js` serves the build
  stamp only, and the dashboard signs in.
- An API key issued before scopes existed is held to `read` rather than granted
  every scope on every route. `ALLOW_UNSCOPED_KEYS=true` is a migration window
  that production refuses.
- The serverless function refuses to serve a deployment `config.validate()`
  rejects, instead of listing the problems under `/health` and carrying on.
- A deploy preview no longer runs migrations, because it may share whatever
  `DATABASE_URL` is set at site scope.
- `X-Actor` from an integration is still believed and now recorded
  `actorVerified: false`, beside a name the server established.

### Fixed
- The type check could not pass on a clean checkout. `build-info.json` is a
  build artifact three files require, and TypeScript resolves that require
  statically; a `pretypecheck` step now stamps it first.
- The metrics test loaded the whole Express app inside its own test body,
  charging that cost to a five-second timer. On a loaded CI runner it took
  eleven seconds and failed both test jobs. The app is loaded once at module
  scope and the suite carries a thirty-second timeout.
- The Part C book set the page to 542px at a 430px viewport once the book had
  rows: its six tables render into bare containers, and the rule that keeps a
  wide table inside its own scroll box was opt-in by class. Any container of a
  known wide table now scrolls, so the guarantee no longer depends on whoever
  wrote the markup remembering it.
- `README.md` linked to `../LICENSE`, outside the repository root.
