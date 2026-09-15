# Recording real GCF projects

The GCF pipeline dashboard shows the **shipped illustrative pipeline** until an
organisation records something of its own. The moment it records one project,
the recorded book wins **entirely** and the sample is not read — the two are
never merged, and the payload says which is showing
(`src/domains/gcf/infrastructure/store.js`). This is how a real book and the
demonstration book stay apart.

This runbook covers **Phase 0** of the DFCC pipeline plan: putting a bank's
real projects in, and having them stay in.

## Prerequisite: a durable store

Recording needs a database. On a deployment with `DATABASE_URL` set (PostgreSQL,
e.g. Neon) a recorded project persists; on a serverless deployment with no
durable store the write is **refused with a 503** rather than accepted and lost.
Confirm the deployment can persist before recording:

```
GET /health   →   storage.mode should be "postgres" (not "none")
```

If it reads `none`, the operator must set `DATABASE_URL` on the deployment
first (see `docs/DATA-LAYER.md`, *Provisioning the database*).

## Two ways to record

**Through the dashboard.** The GCF Pipeline tab has an intake form. Signed in
with a `write` scope, a project typed there is recorded through the same
validated seam and shows immediately, with the sample pill switched off.

**As a book, in one command.** When several projects arrive together, record
them from one JSON file so the write is auditable and repeatable:

```
npm run gcf:record -- --org <orgId> --file data/gcf/real-projects.json --by "Your name"
```

- `--org` the institution's organisation id (e.g. `dfcc`). The preview
  organisation is refused — its only book is the shared sample.
- `--file` a JSON file: either `{ "projects": [ ... ] }` or a bare `[ ... ]`.
- `--by` who is recording these; stamped on every record's provenance, because
  a figure in a GCF submission is evidence and unattributed evidence is not.
- `--dry-run` validates every project and reports, but writes nothing. Run this
  first.
- `--yes` skips the confirmation prompt (for non-interactive use).

The book is validated **whole** before anything is written: if any project is
invalid the command names every problem and records nothing, so a book is fixed
in one pass. Recording an id that already exists **updates it in place** and
never duplicates; the original author is kept and the updater recorded beside.

## The template

`data/gcf/real-projects.template.json` is an annotated, fillable book with three
worked examples — one that passes every gate, one that is flagged, one that is
excluded — mirroring the walk-through in the GCF Pipeline Playbook. Every key
beginning with `_` is guidance the recorder ignores, so the `_help` notes and
the vocabulary reference can stay in the file while the real facts are filled in
around them. Copy it, replace the illustrative values, and record it.

The fields that need a GCF-literate answer — the evidence `tier` on each figure,
the `resultsArea` code, the `stream`, the mitigation `baseline.type`, the
`essCategory` — are each annotated in plain language in the template's
`_vocabularies` block.

## What the dashboard shows afterwards

Once a book is recorded for an organisation, that organisation's GCF Pipeline
dashboard shows the recorded projects on the ten-stage rail, in the gate
partition (eligible / flagged / excluded), and in the two rankings — every
figure one the portfolio route returned. The sample pill is gone. Nothing is
merged with the illustrative set.
