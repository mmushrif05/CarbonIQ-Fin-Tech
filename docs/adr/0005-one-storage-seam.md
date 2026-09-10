# 0005 — One storage seam, and a refusal rather than a lost write

**Status:** accepted

## Context

Five record types were written past the storage layer, straight to Firebase:
lending projects, their monitoring entries, agent runs, supervisor pipeline
runs and webhook subscriptions. Each writer opened
`const db = getDatabase(); if (!db) return;`.

On a deployment holding its records in PostgreSQL — which is every deployment —
`POST /v1/projects` answered **201 Created** and kept nothing.

The seam itself also decided per verb, asking `isDurable()` ("is Firebase
configured") rather than which store had been chosen, so `STORAGE_BACKEND=memory`
on a Firebase deployment wrote to both.

## Decision

One adapter per store behind one interface (`src/platform/database/adapters/`),
and `store.js` picks **one, once**, from the mode `capability()` resolved.

A write that cannot persist is **refused with a 503 naming `DATABASE_URL`**,
never accepted and lost. The in-process store refuses at its ceiling with a 507
rather than dropping its oldest record.

`store.transaction(fn, { required: true })` gives a real transaction on
PostgreSQL, refuses on a durable store that has none, and runs with a warning
in-process — because half of a lock-and-supersede on a real book is a position
nobody can reconcile.

## Consequences

- `tests/storage-seam.test.js` fails the build when a sixth record type reaches
  for the bridge. The bridge is 176 lines and does two things.
- `tests/store-conformance.test.js` runs one contract against every adapter and
  states the differences that are real, rather than leaving them to be found in
  production.
- `GET /health` reports the store that was **asked for** as well as the one
  running, because "the variable never took" and "the store is unreachable"
  look identical and the first is far more common.
- Under `auto`, Netlify Blobs is never chosen. The database belongs to the
  operator, and a site that quietly kept records inside Netlify would be
  holding a book nobody provisioned.
