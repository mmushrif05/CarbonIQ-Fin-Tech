# 0002 — Part A, Part C and GCF are three scopes that never merge

**Status:** accepted

## Context

Three bodies of work in this repository each produce a tonne of CO2e, and they
are not the same tonne.

**PCAF Part A** is financed emissions: what a lender attributes to itself from
a loan, against an outstanding-amount denominator. **PCAF Part C** is
insurance-associated emissions: what a re/insurer attributes to itself from a
policy, against a premium denominator. **The GCF pipeline** is project
mitigation against a counterfactual — not an attributed emission at all.

Summing any two of them produces a number no standard defines. Worse, the
three use overlapping vocabulary — options, scores, tiers — that reads as
interchangeable and is not:

- Part C's data-quality score is `(option) → score` from Table 5.3-2.
- Part A's is **`(asset class, option) → score`** — Option 2b is score 2 in one
  class and score 3 in another. Reusing Part C's `2b = 3` here would be wrong
  in some classes, silently.
- GCF's evidence tiers are **measured · modelled · benchmark · declared**,
  deliberately not numerals, so they cannot be quoted as PCAF scores.

Part A weights the disclosed score by outstanding amount (p.128); Part C
weights by premium (Box 6-3). The two engines must not share a weighting
function.

## Decision

Three domains — `src/domains/pcaf-part-a/`, `src/domains/pcaf-part-c/`,
`src/domains/gcf/` — whose `domain/` layers **never import one another**.

This is enforced structurally rather than by convention:
`tests/architecture.test.js` fails the build on an import between any two of
them, and the exit criterion of that phase was a test that writes such an
import, shows the check failing, and removes it.

## Consequences

- Shared code between them goes in `src/shared`, and only if it is genuinely
  the same thing. A weighting function is not.
- A composed view — the Fund Desk reads both the capital book and the GCF
  pipeline — lives in an `application/` or `desk/` layer, never in a `domain/`.
- Three roughly parallel implementations of "roll up a book" is a cost this
  accepts deliberately.
- No function anywhere returns a figure combining two carbon boundaries, and a
  test sweeps the roll-ups for one.
