# The data layer — PostgreSQL behind the seam

Phase E1 of `docs/ENTERPRISE-READINESS.md`. This is what was built, the rules
it holds, and how to run it.

## What changed, and what did not

Every service has always read and written through one interface,
`src/platform/database/store.js` — `put`, `get`, `list`, `patch`, `remove` on a
`(collection, orgId, id)` key. That seam now has a fourth backend, and it is
the first one that is a database rather than a place to keep JSON.

| | Firebase RTDB | Netlify Blobs | Memory | **PostgreSQL** |
|---|---|---|---|---|
| Durable | yes | yes | no | yes |
| Query on a field | full read, filter in code | full read, filter in code | — | **indexed** |
| Referential integrity | none | none | none | **foreign keys** |
| Transactions | none | none | none | **yes** |
| Schema versioning | none | none | none | **migrations, checksummed** |
| Pagination | first N | first N | first N | **keyset cursor** |
| Backup / restore | console export | none | — | **pg_dump / PITR** |
| Tamper-evident audit | no | no | no | **hash-chained, append-only** |

**No calculation code changed.** `src/domains/pcaf-part-c/domain/`, `src/domains/pcaf-part-a/domain/`,
`src/domains/gcf/domain/`, `services/capital-*` compute exactly as before. What changed
above the seam is three reads that used to fetch a collection and filter it
(`listAssessments`, `listRevisions`, `listPayments`) and now ask the store
for the rows they want; three operations that are now atomic; and one
roll-up that declares the fields it reads.

## Where it lives

```
src/platform/database/
  client.js          the pool, the only require('pg') in the tree; withTransaction()
  collections.js     collection → table, indexed keys, references, stored projections
  document-store.js  put/get/list/query/page/patch/remove/transaction over the tables
  migrate.js         numbered SQL migrations, applied once, checksummed, drift refused
  audit-chain.js     append-only, hash-chained audit events; verify()
  errors.js          PostgreSQL errors → statusCode / code / message / remedy
migrations/
  0001_initial.sql   every table, every key, every constraint; a -- down section
  0002_one_database.sql  API keys, Part C runs, learnings and benchmarks — the last
                     four records that lived only in Firebase
src/platform/auth/
  key-store.js       where API keys live: the api_keys table on PostgreSQL, else Firebase
scripts/
  db-migrate.js              npm run db:migrate | db:status | db:rollback
  migrate-to-postgres.js     npm run db:backfill -- --from=firebase|blobs [--commit]
  db-backup.js               npm run db:backup
  db-verify-audit.js         npm run db:verify-audit
```

A test sweeps the tree for a second `require('pg')` and for any service
requiring `platform/database` other than the seam, so the boundary cannot
lapse by convention.

## Configuration

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db?sslmode=require` |
| `DATABASE_SCHEMA` | schema to use; default `public` |
| `DATABASE_SSL` | `true` · `no-verify` · `false`. Unset: the URL's `sslmode` decides; a URL without one gets TLS with certificate verification for any host that is not local |
| `DATABASE_POOL_MAX` | connections per process; default 3 — a serverless function is one of many processes |
| `STORAGE_BACKEND` | `auto` (default) · `postgres` · `firebase` · `blobs` · `memory` |

**Precedence under `auto`:** PostgreSQL when `DATABASE_URL` is set, then
Firebase when configured, then memory for local development. Netlify Blobs is
**never chosen automatically**: the database belongs to the operator and is
provisioned apart from the hosting platform, so a deployed site that has not
been given one refuses writes (503) rather than quietly keeping records inside
Netlify. `STORAGE_BACKEND=blobs` still selects it, explicitly, for a trial.
Setting `DATABASE_URL` is a deliberate act, so it displaces a Firebase
configuration that may only have been left in place — and `/health` says so in
`storage.reason`. A forced backend that is unreachable refuses writes (503
`STORAGE_UNAVAILABLE`) rather than falling back.

**One database.** With `DATABASE_URL` set, PostgreSQL holds everything the
application persists — the registry, the capital book, the GCF pipeline, the
audit chain, and since migration `0002` the API keys, the Part C runs that
pause for a client, and the learning records and per-m² benchmarks a run
leaves behind. Nothing on such a deployment needs Firebase: the key middleware,
the key CLI (`npm run key:*`) and the run store all resolve their home from
the live store (`src/platform/auth/key-store.js`,
`partc-run-store.js`, `learning-store.js`). Without `DATABASE_URL` those four
records stay in Firebase, exactly where they were, and nothing moves.

`GET /health` → `storage` now also carries `transactional` (boolean),
`reachable` (boolean, PostgreSQL only) and `schema` (`applied`, `pending`,
`drifted` counts). "DATABASE_URL never took", "the database is down" and "a
migration was forgotten" are three different failures and they no longer look
the same from a browser.

## The schema

One table per collection, one spine: `(org_id, id)` primary key, the record
as `jsonb`, `version`, `created_at`, `updated_at`. The fields a query needs
are **generated columns** derived from the JSON, so the column and the
record cannot disagree, and a foreign key on the column is a foreign key on
the record.

| Table | Generated keys | References |
|---|---|---|
| `partc_clients` | | |
| `partc_projects` | `client_id` | clients |
| `partc_boq_revisions` | `project_id` | projects |
| `partc_assessments` | `project_id`, `policy_id`, `boq_revision_id`, `reporting_year`, `status` | projects, boq revisions |
| `capital_portfolios` | | |
| `capital_investments` | `portfolio_id`, `status`, `origin_system`, `origin_record_id` | portfolios |
| `capital_payments` | `portfolio_id`, `investment_id` | portfolios, investments |
| `gcf_projects` · `gcf_entity` · `partc_settings` · `assurance_declarations` | | |

`ON DELETE RESTRICT` throughout. A client with projects cannot be deleted; a
project with a bill of quantities cannot be deleted; a BOQ revision an
assessment binds to cannot be deleted. The refusal reaches the caller as a
409 that names the dependent record. Two unique indexes say in the database
what the services say in code: **one locked assessment per policy-year**, and
**one investment per adopted pipeline record**.

`partc_assessments.rollup` is a **stored projection**: the eighteen fields
the reporting-year roll-up reads, computed at write time by
`partc_assessment_rollup()`. A locked assessment is ten kilobytes, most of it
the data-quality trace; a book of ten thousand is a hundred megabytes to
serialise, and the serialisation — not the query, which takes 39 ms — is what
took the second. The field list is owned by `src/platform/database/collections.js`
and `tests/data-layer.test.js` holds the SQL function, the registry and the
roll-up's declaration to one another.

## Transactions

`store.transaction(fn)` runs `fn` on one connection inside `BEGIN … COMMIT`
and publishes that connection through `AsyncLocalStorage`, so every store call
in the call tree — in any module — lands on it. Three operations use it:

- **Lock and supersede** (`partc-assessments.changeStatus`): superseding the
  previously locked version and locking the new one commit together, and the
  unique index catches the race the code cannot (409 `LOCK_RACE`).
- **Revision and carry-forward** (`partc-boq.createRevision`): the project row
  is locked `FOR UPDATE`, so two tenders posted together become R1 and R2.
- **Adopt to book** (`desk/adopt.adoptCandidate`): the duplicate check and the
  write are one transaction, and the unique index on the origin catches the
  race (409 `ALREADY_ADOPTED`).

On the other backends `transaction(fn)` is a plain call and
`capability().transactional` is `false`.

## Migrations

Plain SQL, numbered, checked in. `npm run db:migrate` applies what is pending
under an advisory lock, each file in its own transaction, and records the
file's SHA-256 in `schema_migrations`. An applied migration whose file has
since changed is **drift**, and `db:migrate` refuses to run until a new
migration is written instead. `db:rollback` runs the last file's `-- down`
section. The Netlify build runs `db-migrate.js up --if-configured`, a no-op
without `DATABASE_URL`. Nothing migrates at request time.

## The audit chain

`audit_events` is append-only by trigger — UPDATE, DELETE and TRUNCATE are
refused — and every row's `hash` is the SHA-256 of the previous row's hash
and its own canonical content. `src/platform/observability/audit.js` appends every request
that could have changed a record (POST, PUT, PATCH, DELETE); a failed append
is written to stderr with its reason, never swallowed. `npm run db:verify-audit`
walks the chain and reports the first sequence number that fails, and why.
The integration test edits a row with triggers disabled and shows the
verifier finding it.

## Provisioning the database

The database is provisioned by the operator, on a host of the operator's
choosing, and is not part of the Netlify site. Any managed PostgreSQL 14+
works — RDS, Cloud SQL, Azure Database, Neon, Supabase, a self-hosted
instance — and the application asks nothing of it beyond one database, one
role that owns it, and TLS.

1. **Create the database and a role that owns it.** One database per
   deployment context (production, staging). Take the connection string the
   host gives, in the form
   `postgresql://user:password@host:5432/dbname?sslmode=require`. If the host's
   string carries no `sslmode`, the client still uses TLS with certificate
   verification for any non-local host; set `DATABASE_SSL=no-verify` only for
   a host whose certificate cannot be verified, and never on production.
   A connection pooler (PgBouncer, Neon's pooled endpoint, Supabase's pooler)
   is fine: the client sends no session-level startup options when the schema
   is `public`.
2. **Apply the schema from a machine that can reach it.**
   `DATABASE_URL=… npm run db:migrate`, then `npm run db:status`, which pings
   the database and prints the server version, the connected user, the
   round-trip latency, whether the connection is on TLS, and the migrations
   applied and pending. Both must say what you expect before the next step.
3. **Give the site the URL.** In the Netlify site's environment variables set
   `DATABASE_URL` on the context that should use it (and `DATABASE_SSL` if
   step 1 needed it). Leave `STORAGE_BACKEND` unset, or set it to `postgres`
   to refuse every fallback. Redeploy — an environment change does not
   restart a running function.
4. **Confirm from the site.** `GET /health` → `storage` must read
   `requested: auto|postgres`, `chosen: postgres`, `reachable: true`,
   `schema: { pending: 0, drifted: 0 }`, and `configured.problems` must be
   empty. `GET /v1/partc/storage` says the same in one line.
5. **Issue the keys against it.** `DATABASE_URL=… npm run key:create -- --org
   "Name" --name "Key" --scopes read,write` writes the key into the same
   database; `npm run key:list` reads it back. Keys issued into Firebase before
   this point are not moved by the schema step — reissue them, or backfill
   (below).
6. **Turn on the host's continuous backup** (point-in-time recovery) and
   record the RPO and RTO it gives in the deployment runbook.

## Moving an existing deployment

1. Provision PostgreSQL as above; set `DATABASE_URL` locally. Do **not** set
   it on the production context yet.
2. `npm run db:migrate` against it.
3. `npm run db:backfill -- --from=blobs` (or `firebase`). Dry run: reads,
   checks every reference, prints the count per collection per organisation,
   writes nothing. An orphan — a project whose client is not in the source —
   is listed by id and refused; `--allow-orphans` skips them and says how many.
4. `npm run db:backfill -- --from=blobs --commit`. Each organisation is one
   transaction; after writing, both sides are counted and a mismatch rolls that
   organisation back with exit 2.
5. Set `DATABASE_URL` on the production context. `/health` reports
   `mode: postgres, reachable: true, schema: { pending: 0 }`.
6. Leave the old store in place, read-only, for one reporting cycle.

## Backup, RPO and RTO

`npm run db:backup` writes a `pg_dump` custom-format archive and proves it
reads back with `pg_restore --list`. That is the manual path.

On managed PostgreSQL, enable continuous archiving and point-in-time
recovery on the instance — RDS, Cloud SQL, Neon and Supabase each expose it as
a setting. With it on: **RPO** is the archive interval (typically ≤ 5 minutes;
seconds on Neon), **RTO** is the restore time of the instance size (minutes
for a book this size). Record the values the chosen host gives in the
deployment's runbook; do not quote these until measured there.

## Testing

`npm test` runs against the in-memory store. `npm run test:postgres` runs the
**same 97 suites** against PostgreSQL — every test that touches storage runs
on the relational store, and each Jest worker gets its own schema
(`test_w1`, `test_w2` …) so suites stay parallel. `npm run test:scale` runs
the ten-thousand-row roll-up alone, in band, and enforces the second. CI runs
all three.

Measured on the development container: roll-up over 10,001 locked
assessments **832 ms** (best of three), indexed single-policy lookup **6 ms**,
SQL execution for the projected read **39 ms**. The parallel suite holds a
regression guard of three seconds for the same test, because a timing under
a dozen concurrent workers measures the workers.

## Why not Prisma

The readiness plan named Prisma. Plain SQL with `pg` was chosen instead, for
three reasons a bank's reviewer will recognise: the migration a DBA reviews is
the migration that runs, with nothing generated in between; there is no
client to generate or engine binary to ship into a serverless bundle; and
the seam's contract is a JSON document, which an ORM's typed model would have
to re-describe field by field for eleven collections and then keep in step.
A stored generated column and an immutable SQL function are the kind of thing
the schema needs and an ORM DSL cannot express.
