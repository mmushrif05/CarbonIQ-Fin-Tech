# 0008 — Conformance, never endorsement

**Status:** accepted

## Context

PCAF does not approve, endorse or certify software. Neither does the Green
Climate Fund approve a proposal on this system's reading of a checkbox, and
neither does the Central Bank of Sri Lanka delegate the finding of compliance.

Every one of those claims is easy to make by accident. A tier label read
`Green (CBSL Compliant)`; a report asserted `'Compliant'` to the regulator that
decides compliance; a certificate stamped a taxonomy version that does not
exist onto a document carrying a SHA-256 audit hash.

A good, true claim is discredited the moment it sits beside an implied one.

## Decision

Output states **conformance with a published method**, and never endorsement by
its publisher.

`containsForbiddenLanguage()` — declared once, in
`src/shared/report-integrity.js`, because it governs every artefact — blocks
"PCAF approved", "PCAF endorsed", "PCAF certified" and their by-PCAF forms,
while letting the permitted disclaimer ("*not* approved, endorsed or certified
by PCAF") through. A report containing one is blocked rather than rendered.

The content layer, which lets a deployment reword four standing statements,
applies the same guard to an override — so it cannot become the route by which
the claim returns to a page.

The mark on a rendered page is Datum's. The PCAF name appears only in the
conformance statement and in citations; the PCAF logo is never reproduced, and
the fonts are open-licensed faces chosen to resemble the observed system rather
than PCAF's licensed ones.

## Consequences

- If PCAF's provider registration is ever granted, the only new claim it
  permits is PCAF's **exact published listing term, stated verbatim and
  verifiable**. It means the tool is a recognised provider; it does not mean
  PCAF vouches for any institution's figure, and that distinction stays visible
  wherever the listing appears.
- "Registration underway" is the most that may be said before it is granted,
  and only if it has actually begun.
- `Green (CBSL Compliant)` is `Green (intensity screen)`.
- The conformance matrices disclaim endorsement on their own face, and a test
  asserts nothing in them claims approval.
