## What this changes

<!-- One or two sentences. What is different after this lands. -->

## Why

<!-- The defect, the requirement, or the gap. If it is a defect, say how it
     showed up — a screen, a document, a test that could not have caught it. -->

## Does a disclosed figure move?

<!-- Yes / No. If yes: which figure, by how much, and what makes the new value
     right. A change that moves a regulatory number is reviewed differently
     from one that does not. -->

## Checks

- [ ] `npm test` (in-memory store)
- [ ] `npm run test:postgres` (the real store — not the same run)
- [ ] `npm run lint` · `npm run typecheck`
- [ ] `npm run test:e2e` (if `ui/` changed)
- [ ] Generated artefacts regenerated (`docs:openapi`, `docs:scopes`,
      `docs:factor-manifest`, `docs:conformance*` — whichever applies)

## Rules this touches

<!-- Delete the ones that do not apply. -->

- [ ] The engine still does every arithmetic operation; no model output reaches
      a figure.
- [ ] Dependencies still point inward; no import between Part A, Part C and GCF.
- [ ] Anything this cannot state is reported **absent**, not estimated.
- [ ] Any new conformance rule cites code and a test that executes it.
- [ ] Any changed regulatory constant carries a version, a date and a checksum.
- [ ] No artefact claims PCAF endorsement.

## Anything a reviewer should look at twice

<!-- The part you are least sure about. -->
