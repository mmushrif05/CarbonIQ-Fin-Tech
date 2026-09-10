# Architecture decision records

One decision per file, in the order they were taken. Each says what was
decided, what it rules out, and — the part that matters most here — **what
went wrong that made the decision necessary**.

Most of these were made because something reached a screen or a document and
was wrong. A record that omits that is a record the next person will overturn,
because the reasoning looks like taste until you know what it cost.

## Format

```
docs/adr/NNNN-a-short-title.md
```

- **Status** — accepted · superseded by NNNN · reversed
- **Context** — what was true, and what went wrong
- **Decision** — what is now the case
- **Consequences** — what this makes hard, and what enforces it

A record is never edited to say something different. It is superseded by a new
one, and the old one gains a line pointing at it. That is the same discipline
the product applies to a locked assessment, and for the same reason.

## The records

| # | Decision |
|---|---|
| [0001](0001-the-engine-does-every-arithmetic-operation.md) | The engine does every arithmetic operation |
| [0002](0002-three-scopes-that-never-merge.md) | Part A, Part C and GCF are three scopes that never merge |
| [0003](0003-absence-is-an-answer.md) | Absence is an answer |
| [0004](0004-conformance-is-shown-not-asserted.md) | Conformance is shown, not asserted |
| [0005](0005-one-storage-seam.md) | One storage seam, and a refusal rather than a lost write |
| [0006](0006-a-baseline-locks.md) | A baseline locks, and changes only by recorded restatement |
| [0007](0007-dependencies-point-inward.md) | Dependencies point inward, and a test enforces it |
| [0008](0008-conformance-language.md) | Conformance, never endorsement |
