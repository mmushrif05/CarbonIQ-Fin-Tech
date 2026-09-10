# 0004 — Conformance is shown, not asserted

**Status:** accepted

## Context

"PCAF-conformant" is a claim. A claim a reviewer cannot check is worth very
little, and a claim that was true when it was written and has since rotted is
worse than none, because it still reads as current.

Two matrices map rule → implementation → proving test: 38 rules for PCAF
Part C, 32 for the GCF pipeline. For a while the tests over them checked that
the citations *resolved* — the file is on disk, the test name is really in it.

A rule citing code no path reaches satisfies that exactly as well as a rule
that works. It is how a Box 6-4 ceded-premium substitution stayed claimed for
a year with an input no schema ever produced. And the GCF half was checking
almost nothing: its cited-file regex named the top-level directories the tree
had before the domains split, so it resolved 3 of 38 paths and passed green.

## Decision

A conformance claim rests on **behaviour observed**, not on a citation that
resolves.

`npm run docs:conformance-evidence` runs each rule's own proving test under
coverage restricted to the files that rule cites, and records what executed.
A rule whose implementation runs no statement is reported unproven and the
build fails. The CI `gate` regenerates the document and fails on a diff.

Where a rule's claim is that **no path exists** — Part C does not compute
A1–A3, the Beyond-PCAF annex never reaches the roll-up — it declares
`evidence: 'absence'`, because a coverage figure would be the wrong evidence.

## Consequences

- A new rule is not done until its test executes its code.
- The methodology statement is extracted from an execution of the engine, so
  it cannot document an equation the engine does not run.
- `docs/CONFORMANCE-EVIDENCE.md` is generated and never written.
- A rule about dead code reads exactly like a rule about live code, so a second
  static check proves every cited module is on a path a composition root
  reaches.
