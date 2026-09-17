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
    clause: 'Register — one version of an approved row, never two',
    rule: 'There is no supersede on this register: an approved exposure has exactly one version, a change to '
      + 'it is refused rather than versioned, and reopening it records the reason on the same row. The stub that '
      + 'once refused with a 501 is gone with the lifecycle that replaced it.',
    implementation: 'src/domains/pcaf-part-a/application/register-lifecycle.js — assertNotApproved(); src/domains/pcaf-part-a/application/register.js — update(), recompute() and remove() refuse an approved exposure, and no supersede path exists',
    test: 'tests/parta-approval.test.js › an approved exposure is frozen until reopened, and the consolidated position and checklist say how many stand approved',
    status: 'implemented',
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
  {
    id: 'A-REG-12',
    clause: 'ISAE 3000 §12(a); ISO 14064-3 §5.2 — the responsible party stands behind the figures',
    rule: 'An exposure moves recorded → under review → approved through one state machine, one step at a time; '
      + 'approving needs the lock scope, a different authority from recording; every move is dated and attributed '
      + 'on the exposure’s own trail; reopening an approved exposure requires a recorded reason.',
    implementation: 'src/domains/pcaf-part-a/application/register-lifecycle.js — move(), TRANSITIONS, withMove(); src/domains/pcaf-part-a/application/register.js — setStatus(); src/platform/auth/scopes.js — a status of approved resolves to the lock scope',
    test: 'tests/parta-approval.test.js › an exposure moves recorded → under review → approved, attributed and dated, and reopening needs a reason',
    status: 'implemented',
  },
  {
    id: 'A-REG-13',
    clause: 'ISAE 3000 §12(a) — a figure the entity has stood behind does not move underneath the disclosure',
    rule: 'An approved exposure is frozen: it cannot be changed, recomputed or removed until it is reopened, and a '
      + 'changed input restarts review. The consolidated position counts approval per class and in total, names '
      + 'what is still unapproved among the items outstanding, and the checklist answers No while any exposure is unapproved.',
    implementation: 'src/domains/pcaf-part-a/application/register-lifecycle.js — assertNotApproved(), approvalOf(); src/domains/pcaf-part-a/application/register.js — update(), recompute() and remove() refuse an approved exposure; src/domains/pcaf-part-a/application/parta-consolidated.js — approval per class and in total; src/domains/pcaf-part-a/reporting/consolidated/checklist.js — APR-1',
    test: 'tests/parta-approval.test.js › an approved exposure is frozen until reopened, and the consolidated position and checklist say how many stand approved',
    status: 'implemented',
  },
  {
    id: 'A-REG-14',
    clause: 'Table 5.2-1 (p.60) — the option earned decides the score; Options 1 and 2 are preferred over Option 3',
    rule: 'Before an exposure is recorded the engine’s answer is available over the same body, through the same '
      + 'preparation, engine and adapter, with nothing written and no id issued — the option and score the data '
      + 'earns, the factor set an estimated figure rests on, the findings — and, for a business loan, what would '
      + 'raise the score: every better option of Table 5.2-1, nearest first, with what it needs. A refusal answers '
      + 'with its clause exactly as recording would.',
    implementation: 'src/domains/pcaf-part-a/application/register.js — preview(); src/domains/pcaf-part-a/domain/business-loans/raise.js — waysToRaise()',
    test: 'tests/parta-preview.test.js › is a read: the engine answers, nothing is written, and the same body twice gives the same answer',
    status: 'implemented',
  },
  {
    id: 'A-FAC-01',
    clause: '§5.2 p.56 (outstanding amount: disbursed debt minus repayments, adjusted annually to 0 at maturity); p.33 (a fixed point in time)',
    rule: 'The numerator is the debt owed at the fiscal year-end, never the amount sanctioned: the facility’s commitment, drawn '
      + 'amount, dates and repayment profile are recorded beside it and the engine schedules the balance at the position date; '
      + 'a balance above the commitment or the drawn amount is refused, a balance taken from the schedule rather than the ledger '
      + 'carries a material finding until the ledger’s replaces it, and a keyed balance far from the schedule is told to the reader. '
      + 'The facility changes no figure and no score.',
    implementation: 'src/domains/pcaf-part-a/domain/facility/schedule.js — outstandingAt(); src/domains/pcaf-part-a/domain/facility/checks.js — refusals(), findings()',
    test: 'tests/parta-facility.test.js › a scheduled year-end balance is accepted and carries a material finding; the ledger’s balance carries none; the figures are the same',
    status: 'implemented',
  },
  {
    id: 'A-FAC-02',
    clause: '§6.2 pp.169–173 (undrawn loan commitments: total loan commitment − drawn amount, the same denominator; unweighted shall, weighted may; never aggregated with drawn, p.170)',
    rule: 'The undrawn commitment is attributed on the same denominator as the drawn part and reported apart: an unweighted figure that shall '
      + 'be reported, a weighted one only beside it where the institution records a utilisation factor, and absent with the reason where '
      + 'the drawn part earned no attribution factor. No key holds the drawn and undrawn figures together, and the position sums the '
      + 'line on its own, never into a headline.',
    implementation: 'src/domains/pcaf-part-a/domain/facility/undrawn.js — undrawnLine(); src/domains/pcaf-part-a/application/register-facility.js — undrawnOf()',
    test: 'tests/parta-facility.test.js › the position sums the undrawn commitment apart and counts the numerators by basis',
    status: 'implemented',
  },
  {
    id: 'A-FAC-03',
    clause: '§5.2 p.56 (the attribution declines to 0 when the loan is fully repaid); ch.6 — a disclosed figure is the reporting year’s',
    rule: 'The life of the loan is a projection: one row per year-end from origination to maturity, the balance scheduled and the '
      + 'denominator and borrower emissions held, every row marked as a projection with the assumptions beside it, declining to nought '
      + 'at maturity — and it never enters the reporting-year position.',
    implementation: 'src/domains/pcaf-part-a/domain/facility/lifetime.js — projection()',
    test: 'tests/parta-facility.test.js › the life of the loan is a projection on every row, declines to nought at maturity, and is not in the position',
    status: 'implemented',
  },
  {
    id: 'A-FAC-04',
    clause: '§5.3 pp.68–69; §5.4 fn 124; §5.5; §5.6 p.91 — the same outstanding-amount rule in every loan class',
    rule: 'The facility applies to every loan class through the register’s one shape — the property, vehicle and project engines are '
      + 'read the same way as §5.2 — and to no holding: a listed share or bond is held, not drawn down, and the schema never offers it a facility.',
    implementation: 'src/domains/pcaf-part-a/application/register-classes.js — withFacility(); src/domains/pcaf-part-a/interface/schemas/register.js',
    test: 'tests/parta-facility.test.js › the same principle on a property loan: the numerator is the year-end balance, the facility schedules it and the undrawn line rests on the origination value',
    status: 'implemented',
  },

];

module.exports = { REGISTER_RULES };
