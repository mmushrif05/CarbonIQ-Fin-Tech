# 0003 — Absence is an answer

**Status:** accepted

## Context

The portfolio reports emitted figures the system did not have, under the clause
numbers of standards that require them.

The scope 1/2/3 split was the financed-emissions total times 0.08 / 0.14 /
0.78, printed under GRI 305 and IFRS S2 §29. The TCFD section carried a board
meeting quarterly, a three-person ESG team reporting to the CRO, a $340M
pipeline and 12% of the book in flood zones — none of it from anywhere. The
CBSL disclosure asserted `'Compliant'` to the regulator that decides
compliance. The PCAF checklist hardcoded every item `met: true`, including the
scope breakdown that was only "present" because it had been invented.

A reader could not tell any of it from a measurement.

## Decision

A disclosure contains exactly three kinds of statement
(`src/shared/report-integrity.js`):

- **measured** — computed from data held here, and traceable to it;
- **declared** — a fact only the reporting entity can know, recorded by them;
- **absent** — required by the standard, and not available.

An absent item is reported with the clause that requires it and where the
figure actually comes from. Nothing is estimated to fill a gap, and nothing
defaults to zero.

Every report carries a `gaps` list of what it could not state and is never
called complete while an item is unmet. A report built without a portfolio is
stamped **SAMPLE DATA** on its face.

## Consequences

- A checklist can fail, and does. The GCF report's inventory item stays unmet
  even when every entity fact is recorded, because that report is one input to
  an SLFRS S2 disclosure rather than the disclosure.
- "This project delivers X% of Sri Lanka's NDC" is reported absent with what it
  needs, because the national BAU tonnage is not held here.
- A country with no released baseline is absent rather than defaulted.
- `tests/report-integrity.test.js` sweeps the source for the removed constants
  rather than trusting the paths a feature test happens to walk.
