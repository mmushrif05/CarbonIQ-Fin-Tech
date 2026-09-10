# 0001 — The engine does every arithmetic operation

**Status:** accepted

## Context

The product is built around a language model, and the model is genuinely good
at the work it is given: reading a bill of quantities out of a multi-column
PDF, classifying a material against a factor table, mapping a line to a
lifecycle module, writing the narrative a disclosure needs.

It is also capable of arithmetic, and that is the problem. A figure a model
produced is not reproducible, not traceable, and not defensible to an auditor
who asks how it was derived. It cannot be re-run to the same value, and it
carries no equation, no inputs and no factors.

Every figure in this system ends up in a document a bank or an insurer files
under a standard's clause number.

## Decision

Claude classifies, extracts, maps and writes. **The engine does every
arithmetic operation.**

`extractionOutputSchema` in `src/domains/lending/application/extract.js` is
`unknown(false)` and does not admit `emissionFactor` or `totalKgCO2e`. A model
reply carrying either is refused with a 502 rather than passed through. The
factor and the total are then computed here, from the factor table, with the
tier and the source attached.

Every engine function returns a *traced* value: the figure, its equation, its
inputs, its factors with their data-quality tiers and named sources, and its
assumptions. The three registers and the data-quality score are derived from
that tree, so they cannot contradict the arithmetic.

## Consequences

- A model that improves does not change a disclosed figure. That is the point.
- The methodology statement can be extracted from an execution of the engine
  rather than transcribed beside it, so it cannot describe an equation the
  engine does not run.
- Adding a computed field means adding it to an engine, not to a prompt.
- `tests/assess.test.js` and `tests/extract.test.js` assert that the model's
  reply carries no factor and no total, and that every figure in the response
  is a number the engine produced.
