# Contributing

This is a measurement instrument before it is software. A figure it produces
ends up in a bank's or an insurer's regulatory disclosure, and the person
reading it will not be able to check it against anything else. Most of what
follows is downstream of that.

Start with **[docs/CODE-TOUR.md](docs/CODE-TOUR.md)** — what happens when a
request arrives, where each module lives, and what the tables are. Then
**[docs/GLOSSARY.md](docs/GLOSSARY.md)**, which is short and will save you from
the one mistake that produces a wrong regulatory figure: there are three
different 1–5 scales in this system and they are not interchangeable.

## Getting it running

```bash
nvm use                  # .nvmrc — Node 22
npm install
npm run setup:env        # writes .env from the template, with placeholders
npm test                 # the whole suite, in-memory store

npm run db:test-up       # PostgreSQL in Docker, migrated
npm run test:postgres    # the same suite on the real store
```

The two suites are not the same run. The in-memory store permits things a
foreign key does not, and the first PostgreSQL run this project ever did failed
27 tests for exactly that reason. **Run both before you open a pull request.**

`npm test <path>` runs one file without coverage, so its exit code means what
it says. `npm test` on its own is the whole suite, with the coverage floors.

The whole stack, with the database and the frontend:

```bash
docker compose -f docker/docker-compose.yml up
```

## The rules that are not negotiable

These are not style. Each is enforced by a test, and each is here because
breaking it produced a defect that reached a screen or a document.

**The engine does every arithmetic operation.** Claude classifies, extracts,
maps a BOQ line and writes narrative. An LLM must never compute a figure that
reaches a regulatory disclosure. `extractionOutputSchema` refuses a model reply
carrying an emission factor or a total, and the refusal is a 502 rather than a
pass-through.

**Dependencies point inward.** A `domain/` layer imports only its own domain,
`src/shared` and `data/`. The platform never imports a domain. PCAF Part A,
PCAF Part C and the GCF pipeline are three scopes that must never merge, and
`tests/architecture.test.js` fails the build on an import between them.

**Absence is an answer.** A figure this system does not hold is reported
absent, with the clause that requires it and where it actually comes from —
never estimated, never defaulted to zero. `src/shared/report-integrity.js`
exists because the reports once emitted invented figures under a standard's
clause number.

**Conformance is shown, not asserted.** A new rule in a conformance matrix
carries the code that enforces it and the test that proves it, and
`npm run docs:conformance-evidence` will report it unproven if that test never
executes the cited code.

**A regulatory constant carries its provenance.** Version, effective date,
status, and a checksum over the set. A value corrected without the version
moving, or a version moved without the value changing, are both defects.

**Output claims PCAF conformance, never endorsement.** PCAF does not approve,
endorse or certify software. `containsForbiddenLanguage()` blocks it across
every artefact, and the content layer refuses an override that would put it
back.

**`Number(null)` is 0, and 0 is finite.** Check absence before you check the
number. This has caused three separate defects in the capital book alone, and
every one reached a screen with its unit test passing.

## What a change looks like

1. **Branch** from `main`.
2. **Write the test first where you can.** A test that only knows what the code
   knows protects nothing — the NDC failure was a test asserting the same
   superseded figures the code produced.
3. **Keep files under 500 lines.** `tests/structure.test.js` enforces it. Split
   along a seam into sibling modules behind a barrel, the pattern this
   repository already uses in `report-standard/`, `theme/`, `gcf/`.
4. **Add `// @ts-check`** to any file you can make clean, and run
   `npm run typecheck`. A file joins by fixing its errors, never by pragma
   alone.
5. **Regenerate what is generated.** If you touched a route:
   `npm run docs:openapi && npm run docs:scopes`. A factor table:
   `npm run docs:factor-manifest`. A conformance rule:
   `npm run docs:conformance` or `docs:gcf-conformance`, then
   `docs:conformance-evidence`. Tests fail on drift, which is the point.
6. **Run the checks:** `npm test`, `npm run test:postgres`, `npm run lint`,
   `npm run typecheck`, and `npm run test:e2e` if you touched `ui/`.
7. **Open the pull request** against `main`, filling in the template. The
   `gate` status check has to be green.

## How to write a comment

The newer domains are written as prose that says **why**, and that is the house
style. A comment that restates the code earns nothing; a comment that records
the defect a line prevents is the most valuable thing in the file, because the
next person to simplify it will otherwise reintroduce the defect.

State the rule, then the failure it prevents. Nine older files still carry
`Implementation: Step N` scaffold headers from an earlier vintage — those are
the ones to rewrite when you next touch them, not a second style to match.

Do not name a model or a vendor in anything a user reads;
`tests/ui-tone.test.js` fails on it.

## What goes on a screen

State what the figure is, cite the standard that governs it, and stop. No copy
explaining why the screen is not blank, no arguing with an imagined objection,
no JSON field names in backticks. `tests/ui-tone.test.js` sweeps for six
shapes of this and will tell you which line.

## Reporting a vulnerability

Not in an issue — see [SECURITY.md](SECURITY.md).
