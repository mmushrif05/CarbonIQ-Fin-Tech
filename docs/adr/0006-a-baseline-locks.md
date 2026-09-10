# 0006 — A baseline locks, and changes only by recorded restatement

**Status:** accepted

## Context

The Sri Lanka Green Finance Taxonomy sets no absolute kgCO2e/m² threshold; a
full-text sweep of all 26 pages returns one figure per unit area and it is
unrelated. The construction criteria are relative or certification-based.

So the intensity bands a bank screens against are **regional judgement**, not a
published threshold — and this codebase carried two different sets of them.
520/780 screened `GET /v1/taxonomy` while 600/900 assigned the tier on the
SHA-256-hashed Green Loan Certificate, so a building at 560 kgCO2e/m² was Green
from one endpoint and Transition from the other: two answers to one question
about what a bank may call a green loan.

A baseline anyone can change without a recorded reason is worth nothing. If one
institution can move its number silently, every number in the market becomes
negotiable.

## Decision

Regional judgement lives in a governed registry (`src/domains/baseline/`).

Values are scoped **global → country → organisation**, and the most specific
*released* one wins. A baseline **locks**, and changes only through a recorded,
reasoned supersession above a stated threshold — the discipline the Part C
locked-assessment path already follows.

A country baseline needs the `admin` scope because it is the market's figure;
an organisation's own needs only that organisation's `lock`.

Where a published standard sets a figure, the standard's value wins and the
registry holds only the citation. Where no standard sets one, the figure
belongs here.

## Consequences

- The shipped set is **provisional** and says so on every screen that reads it,
  which is what lets a demonstration run before an operator has released
  anything. A released baseline replaces it entirely; the two are never merged.
- Every endpoint that screens against a band resolves it from the one registry
  and reports the version it used, so no two screens can disagree again.
- A certificate already issued stays valid: the audit hash covers the tier that
  was assigned, not the bands that assigned it.
- The same discipline now covers the factor tables — version, effective date,
  status derived from the rows, and a checksum over the set
  (`data/factors/MANIFEST.json`).
