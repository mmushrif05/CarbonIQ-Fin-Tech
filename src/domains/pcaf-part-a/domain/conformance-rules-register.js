// @ts-check
/**
 * PCAF Part A — the exposure register rules (A-REG-*): both halves kept, one loan once, the projected roll-up, recomputation, and one register across the built classes.
 *
 * One part of the §5.2 conformance matrix, kept in its own file so no rule
 * file passes five hundred lines; `conformance-rules.js` composes it into the
 * one list `conformance.js` computes over. Every rule maps a clause to the
 * code that enforces it and the test that proves it, and
 * `tests/pcaf-parta-conformance.test.js` fails the build if a citation does
 * not resolve.
 */

'use strict';

const REGISTER_RULES = [
  // ---- The exposure register --------------------------------------------
  {
    id: 'A-REG-01',
    clause: 'Register (migration 0008) — both halves kept',
    rule: 'A row holds the input the bank keyed and the result the engine computed, with the '
      + 'instant and the standard edition beside them; an exposure the standard refuses never '
      + 'reaches the book, and a change reruns the engine rather than editing a figure directly.',
    implementation: 'src/domains/pcaf-part-a/application/register.js — record() runs the engine and stores input and result together; a refusal is not written, and change() reruns rather than editing',
    test: 'tests/parta-register.test.js › an exposure is recorded with both halves and the standard it rests on',
    status: 'implemented',
  },
  {
    id: 'A-REG-02',
    clause: 'Register (migration 0009) — one loan, once',
    rule: 'The same facility reference in the same reporting year is refused, naming the existing '
      + 'exposure; uniqueness is on the loan, never the counterparty, and a loan with no reference '
      + 'carries no constraint. A partial unique index closes the race the service cannot.',
    implementation: 'src/domains/pcaf-part-a/application/register.js — a 409 DUPLICATE_LOAN naming the existing exposure, restated in the database by a partial unique index on (org, year, account_number)',
    test: 'tests/parta-register.test.js › the same facility reference in the same year is refused, naming the existing exposure',
    status: 'implemented',
  },
  {
    id: 'A-REG-03',
    clause: 'Register — a recomputation is a decision, not a read',
    rule: 'A recomputation reruns the engine over the stored input and reports what moved across all '
      + 'seven lines and both scores; nothing recomputes on read, and the note names the engine or a '
      + 'factor as the cause, never what the bank recorded.',
    implementation: 'src/domains/pcaf-part-a/application/register.js — recompute() compares every line and both scores with before, after and whether each moved; a plain read returns the stored result untouched',
    test: 'tests/parta-register.test.js › the movement carries all seven lines and the two scores, and the headline is still where it was',
    status: 'implemented',
  },
  {
    id: 'A-REG-04',
    clause: 'DCL Part A (p.124) — coverage over the whole book',
    rule: 'Coverage is the assessed outstanding over the entity’s stated total loans and '
      + 'investments; without a stated total it is absent with what it needs, a book of zero is '
      + 'refused rather than read as full coverage, and a year has one denominator.',
    implementation: 'src/domains/pcaf-part-a/application/register.js — the book total is a separate stated fact (parta_book); coverage is computed against it or reported absent, and a zero book is refused',
    test: 'tests/parta-register.test.js › without a stated book total it is absent with what it needs',
    status: 'implemented',
  },
  {
    id: 'A-REG-05',
    clause: 'Register — the roll-up reads a projection',
    rule: 'The reporting-year position is read from a stored projection computed at write time, and '
      + 'the projected roll-up equals the whole-record roll-up figure for figure; every projected '
      + 'field is a path into the record, never a shape of its own, so the in-memory store projects '
      + 'the same set with no column.',
    implementation: 'src/domains/pcaf-part-a/application/register.js — position() reads the projection; the field list is declared once in src/platform/database/collections.js and the SQL function and the registry name the same fields',
    test: 'tests/parta-register.test.js › the projected roll-up equals the whole-record roll-up, figure for figure',
    status: 'implemented',
  },
  {
    id: 'A-REG-06',
    clause: 'Register — the band is resolved at call time',
    rule: 'The sector intensity band comes from the baseline registry and is applied on the way into '
      + 'the engine, never written into the stored input; a released band changes what a '
      + 'recomputation reports, and a band supplied on the request stands over the registry and says so.',
    implementation: 'src/domains/pcaf-part-a/application/plausibility.js — withSectorBand() resolves the most specific released band and records the version on the finding; the band is never persisted into the input',
    test: 'tests/parta-register.test.js › a band the organisation releases changes what recompute reports, and the note says findings moved',
    status: 'implemented',
  },
  {
    id: 'A-REG-07',
    clause: 'Register — a half-built lifecycle is worse than none',
    rule: 'Nothing publishes from this register yet, so lock() refuses with a 501 naming the step '
      + 'that builds it rather than doing half of a lock-and-supersede.',
    implementation: 'src/domains/pcaf-part-a/application/register.js — lock() throws a 501 with the step that builds the lifecycle; the status column sits in migration 0008 so that step needs no migration',
    test: 'tests/parta-register.test.js › locking refuses with a 501 rather than doing half of it',
    status: 'partial',
    limitation: 'The lock-and-supersede lifecycle is a later release. It is an absent capability that refuses explicitly, not a disabled one, so nothing can publish from the register in the meantime.',
  },
  {
    id: 'A-REG-08',
    clause: 'Chapter 6 — recalculation and significance',
    rule: 'A recomputation reports whether the movement reaches the entity’s own significance '
      + 'threshold: a movement at or above it is a recalculation trigger that, once the '
      + 'lock-and-supersede lifecycle exists, requires a restatement with a recorded reason; '
      + 'below it, the movement is reported but is not a trigger. The threshold judged against '
      + 'is the one the disclosure publishes, not a figure hidden in code.',
    implementation: 'src/domains/pcaf-part-a/application/register.js — recompute() reads the entity settings and attaches a significance verdict using src/domains/pcaf-part-a/domain/recalculation.js significanceOf() against the stated threshold',
    test: 'tests/parta-register.test.js › a recomputation says whether the movement reaches the significance threshold',
    status: 'implemented',
  },
  {
    id: 'A-REG-09',
    clause: 'Chapter 6 — one position per asset class (DCL p.128; §5.1–§5.5 tables)',
    rule: 'One exposure register holds every built Part A class, and each row names the class whose '
      + 'engine computed it. The reporting-year position is rolled up per class, on that class’s own '
      + 'data-quality table, label and groupings, from one read of the projection; no total and no '
      + 'score is ever summed or averaged across classes, because the option-to-score tables differ '
      + 'between classes and a mean of two categories from two tables means nothing.',
    implementation: 'src/domains/pcaf-part-a/application/register-classes.js — each class’s engine, preparation and adapter onto the one register shape; src/domains/pcaf-part-a/application/register.js — position() filters the projection to one class and positions() rolls each class alone; src/domains/pcaf-part-a/domain/business-loans/portfolio.js — rollUp() bound per class through opts',
    test: 'tests/parta-register-classes.test.js › the position is per class, from one read, and a class the year holds nothing of is a 409 naming what it does hold',
    status: 'implemented',
  },
  {
    id: 'A-REG-10',
    clause: '§5.4 (p.79) / §5.5 — energy statistics per square metre of floor area',
    rule: 'A floor area arrives with the unit it was measured in and is converted to square metres once, '
      + 'in the engine, with the exact factor (1 ft = 0.3048 m); the trace carries the area as keyed '
      + 'beside the square metres it became. A land unit — perch, acre, hectare — is refused by name, '
      + 'because the intensity is per square metre of floor and the extent of the plot says nothing '
      + 'about the building on it. No conversion lives in the browser.',
    implementation: 'src/domains/pcaf-part-a/domain/real-estate/area.js — floorAreaM2(); src/domains/pcaf-part-a/domain/real-estate/index.js — the area resolved once and both forms refused together; src/domains/pcaf-part-a/domain/real-estate/energy.js — areaTrace() on the Option 2a/2b trace',
    test: 'tests/parta-register-classes.test.js › an office keyed at 10,763.91 ft² is the 1,000 m² office, figure for figure, and the option is derived',
    status: 'implemented',
  },
  {
    id: 'A-REG-11',
    clause: 'Chapter 6 — a document states the class it reports',
    rule: 'The per-exposure §5.2 document refuses a row of another class by name rather than printing '
      + 'it under §5.2 clauses; the row still reaches the consolidated disclosure and its register annex, '
      + 'which names each row’s class and section.',
    implementation: 'src/domains/pcaf-part-a/application/parta-report.js — exposureReport() refuses with REPORT_NOT_BUILT_FOR_CLASS; src/domains/pcaf-part-a/application/parta-consolidated.js — registerRows() over every register class',
    test: 'tests/parta-register-classes.test.js › the per-exposure §5.2 report refuses a row of another class by name; the consolidated register carries it',
    status: 'implemented',
  },

];

module.exports = { REGISTER_RULES };
