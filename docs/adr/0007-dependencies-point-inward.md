# 0007 — Dependencies point inward, and a test enforces it

**Status:** accepted

## Context

This was two codebases wearing one directory convention: a newer half organised
by bounded context, and an older half of flat `services/`, `routes/`,
`models/`, `schemas/` directories that anything could import from anywhere.

A convention holds until the first Friday afternoon.

## Decision

```
src/domains/<name>/domain/         pure engines — import only their own domain,
                                   src/shared and data/. No HTTP, no database,
                                   no AI client, no other domain.
src/domains/<name>/application/    use cases; may import domain, shared,
… agents/ reporting/ desk/          platform, and other domains' non-interface
… infrastructure/                   layers.
src/domains/<name>/interface/      routes and schemas. Nothing imports these
                                   except the same domain's interface and the
                                   composition roots.
src/platform/                      never imports a domain.
src/shared/                        imports only src/shared.
```

Four composition roots are the exception, because mounting the domains is their
job: `src/server.js`, `src/jobs.js`, `platform/http/router.js`,
`platform/http/schemas.js`.

`tests/architecture.test.js` fails the build when an edge points the wrong way.
The checker is a function (`tests/helpers/architecture.js`), so the test that
proves it catches a violation passes it one synthetic edge rather than writing
a probe module into `src/` and running Jest inside Jest.

## Consequences

- A `domain/` engine cannot reach a database, so it is testable without one and
  cannot acquire a hidden dependency on the store.
- No source file is over 500 lines (`tests/structure.test.js`); the nine that
  were are split along their seams behind a barrel at the original path.
- Adding a route means adding it to a domain's `interface/` and mounting it in
  the router, not wiring it wherever it is convenient.
- An underscore-private name crossing a module boundary is a signal the seam is
  in the wrong place; `tests/module-boundaries.test.js` holds the ones that
  remain to a named list, and the list is meant to shrink.
