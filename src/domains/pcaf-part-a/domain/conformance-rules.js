// @ts-check
/**
 * PCAF Part A §5.2 — the conformance matrix rules.
 *
 * The rule list is a large, flat data structure, so it lives in its own file
 * rather than swelling the module that computes over it: `conformance.js`
 * requires it and adds the summary, the matrix wrapper and the evidence
 * vocabulary. Every rule maps a clause to the code that enforces it and the
 * test that proves it; `tests/pcaf-parta-conformance.test.js` fails the build
 * if a citation does not resolve, and `scripts/conformance-evidence.js`
 * re-proves each one by execution.
 */

'use strict';

const RULES = [
  // ---- Scope ------------------------------------------------------------
  {
    id: 'A-SCOPE-01',
    clause: 'Part A §5.2 (p.55)',
    rule: 'The class is on-balance-sheet loans and lines of credit to businesses and equity in '
      + 'unlisted companies. What is not this class — a loan to a government, a known use of '
      + 'proceeds, an off-balance-sheet line, a private-equity fund — is redirected by name to '
      + 'the section that owns it, never assessed here by default.',
    implementation: 'src/domains/pcaf-part-a/domain/business-loans/classify.js — the Figure 5-1 gate redirects sovereign, use-of-proceeds, off-balance-sheet and fund exposures, each carrying the footnote that governs it',
    test: 'tests/parta-business-loans.test.js › the gate (Figure 5-1 and p.55)',
    status: 'implemented',
  },
  {
    id: 'A-SCOPE-02',
    clause: 'Part A §5.2 (p.56)',
    rule: 'The borrower’s scope 3 is reported and is disclosed separately from its scope 1 and 2; '
      + 'the two are never summed into one figure.',
    implementation: 'src/domains/pcaf-part-a/domain/business-loans/lines.js — six reporting lines with scope 3 as its own line; no code path sums it with scope 1 and 2',
    test: 'tests/parta-business-loans.test.js › no line is netted against another and none is summed across lines',
    status: 'implemented',
  },
  {
    id: 'A-SCOPE-03',
    clause: 'Part A p.126',
    rule: 'Removals and emission credits are reported on their own lines and netted against nothing; '
      + 'the inventory total never absorbs a credit.',
    implementation: 'src/domains/pcaf-part-a/domain/business-loans/lines.js — removals, credits generated and credits retired are distinct lines, never subtracted from the scope lines',
    test: 'tests/parta-business-loans.test.js › no line is netted against another and none is summed across lines',
    status: 'implemented',
  },
  {
    id: 'A-SCOPE-04',
    clause: 'Three scopes never merge (architecture)',
    rule: 'Part A, Part C and the GCF pipeline are three domains whose engines never import one '
      + 'another. The option-to-score numerals are not interchangeable across them, so a shared '
      + 'import is the route by which one scope’s scale is quoted as another’s.',
    implementation: 'src/domains/pcaf-part-a/domain/business-loans/index.js — the §5.2 engine imports only its own domain, src/shared and data/; it has no import path into the Part C or GCF engines',
    test: 'tests/architecture.test.js › PCAF Part A, Part C and the GCF pipeline are three domains that never import one another',
    status: 'implemented',
    evidence: 'absence',
  },
  {
    id: 'A-SCOPE-05',
    clause: 'Part A §5.2; GHG Protocol "Built on" mark',
    rule: 'The report claims PCAF conformance and never endorsement, and does not blur the six '
      + 'original asset classes’ GHG-Protocol review with the Third Edition additions.',
    implementation: 'src/domains/pcaf-part-a/reporting/facts.js — conformanceStatement() states PCAF-conformant, records that PCAF does not approve or certify, and carries the "Built on" mark for this class; report-integrity refuses endorsement language at build',
    test: 'tests/parta-report.test.js › a report with endorsement language is refused',
    status: 'implemented',
  },

  // ---- Classification and attribution -----------------------------------
  {
    id: 'A-CLASS-01',
    clause: 'Part A §5.2, footnote 86 (p.55)',
    rule: 'A loan to a listed company is attributed on EVIC; unlisted equity never reaches the '
      + 'EVIC branch. Listed equity and corporate bonds are sent to §5.1 even where the '
      + 'denominator is identical.',
    implementation: 'src/domains/pcaf-part-a/domain/business-loans/classify.js — the gate selects the EVIC denominator for a listed borrower on a loan, keeps unlisted equity on total equity plus debt, and redirects listed equity and bonds to §5.1',
    test: 'tests/parta-business-loans.test.js › a loan to a listed company is attributed on EVIC (footnote 86)',
    status: 'implemented',
  },
  {
    id: 'A-ATTR-01',
    clause: 'Part A §5.2 (p.56)',
    rule: 'The numerator is defined twice: a business loan is disbursed debt less repayments; '
      + 'unlisted equity is the share of the investee. A balance that disagrees with disbursed '
      + 'less repayments is refused rather than chosen between.',
    implementation: 'src/domains/pcaf-part-a/domain/business-loans/numerator.js — the two definitions, each recording its operands; a stated balance inconsistent with disbursed less repayments raises a refusal',
    test: 'tests/parta-business-loans.test.js › a balance that disagrees with disbursed less repayments is refused, not picked between',
    status: 'implemented',
  },
  {
    id: 'A-ATTR-02',
    clause: 'Part A §5.2 — attribution factor',
    rule: 'The attribution factor is the numerator over the denominator and cannot exceed 1: a '
      + 'holding larger than the company, or an attribution factor above 1, is refused rather '
      + 'than capped; a numerator and denominator on different dates is not an attribution factor.',
    implementation: 'src/domains/pcaf-part-a/domain/corporate/denominator.js and business-loans/denominator.js — the denominator per instrument, with the coherence guards that refuse an out-of-range or date-mismatched factor',
    test: 'tests/parta-business-loans.test.js › an attribution factor above 1 is refused rather than capped',
    status: 'implemented',
  },

  // ---- Data quality: the option-to-score mapping ------------------------
  {
    id: 'A-OPT-01',
    clause: 'Part A §5.2, Table 5.2-1 (p.60)',
    rule: 'Data quality is scored by the option used to estimate the emissions, read from Table '
      + '5.2-1, and this table belongs to this asset class alone — it is a different table object '
      + 'from §5.1’s even though the two carry the same labels at the same scores.',
    implementation: 'src/domains/pcaf-part-a/domain/business-loans/options.js binds src/domains/pcaf-part-a/domain/corporate/options.js to Table 5.2-1 (data/pcaf-parta/dq-business-loans-unlisted-equity.json); the machinery is shared and the table is not, so asking §5.1’s table here is impossible rather than discouraged',
    test: 'tests/parta-business-loans.test.js › the option-to-score mapping is the one printed on p.60',
    status: 'implemented',
  },
  {
    id: 'A-OPT-02',
    clause: 'Part A §5.2 fn 87 (p.61)',
    rule: 'The option is read from the basis of the emissions figure, never chosen from a list; a '
      + 'figure relayed by a data provider is Option 1 only where the provider is relaying what the '
      + 'company reported. A better option than the evidence supports needs a justification, which '
      + 'is recorded beside the score.',
    implementation: 'src/domains/pcaf-part-a/domain/corporate/options.js — deriveOptions() maps each scope’s basis to an option; reconcileClaim() records a claimed override with its justification and refuses one with none',
    test: 'tests/parta-business-loans.test.js › a better option than the evidence supports needs a justification, and is then recorded',
    status: 'implemented',
  },
  {
    id: 'A-OPT-03',
    clause: 'Data-quality rendering (the scale has a direction)',
    rule: 'A score is a category, never a mark out of five: 1 is the highest quality and 5 the '
      + 'lowest, and it is rendered with the scale beside it, never as a fraction.',
    implementation: 'src/domains/pcaf-part-a/domain/business-loans/lines.js and reporting/sections.js render the score as a category with the scale stated; tests/dq-rendering.test.js sweeps the tree for the inverted form',
    test: 'tests/parta-business-loans.test.js › a score renders as a category with the scale beside it, never as a fraction',
    status: 'implemented',
  },

  // ---- Estimation and the sector factor library -------------------------
  {
    id: 'A-EST-01',
    clause: 'Part A §5.2 (p.62)',
    rule: 'Option 3 with no factor supplied takes the held sector factor for the counterparty’s '
      + 'sector — per unit of revenue for 3a and 3c, per unit of assets for 3b — and the result '
      + 'names the release it rests on. A factor supplied on the request stands and names no held set.',
    implementation: 'src/domains/pcaf-part-a/domain/sector-factors.js resolves the held factor per basis; src/domains/pcaf-part-a/domain/business-loans/estimate.js applies it and records factorRelease (table, version, rows, checksum)',
    test: 'tests/parta-business-loans.test.js › Option 3b with no factor supplied takes the held factor per unit of assets, and the result names the set',
    status: 'implemented',
  },
  {
    id: 'A-EST-02',
    clause: 'Part A §5.2 (p.62)',
    rule: 'A sector not held is a refusal naming the vocabulary and the two ways forward, never the '
      + 'nearest sector; a factor held in one currency is never applied to an exposure in another; '
      + 'a free-text sector mapped by name records the mapping on the trace rather than silently.',
    implementation: 'src/domains/pcaf-part-a/domain/sector-factors.js — a closed ISIC-based vocabulary; an unheld sector refuses, a currency mismatch refuses, and a name match is recorded on the trace',
    test: 'tests/parta-business-loans.test.js › a sector that is not held is a refusal naming the two ways forward, never the nearest sector',
    status: 'implemented',
  },
  {
    id: 'A-EST-03',
    clause: 'Part A Box 6.1-5 (p.167)',
    rule: 'An economic factor whose vintage sits at or beyond the threshold behind the reporting '
      + 'year, applied without a deflator, is a finding; with a deflator applied it is not.',
    implementation: 'src/domains/pcaf-part-a/domain/business-loans/checks.js — factorVintage() raises FACTOR_VINTAGE_STALE where the vintage is stale and no inflation was applied, and the threshold is settable per request',
    test: 'tests/parta-business-loans.test.js › an economic factor four years old, applied without a deflator, is a finding; with a deflator it is not',
    status: 'implemented',
  },

  // ---- The six reporting lines ------------------------------------------
  {
    id: 'A-LINE-01',
    clause: 'Part A §5.2, Tables 5.2-2/5.2-3 (p.63)',
    rule: 'The engine reproduces the standard’s own worked example across the six lines, and each '
      + 'attribution factor is the share the table states.',
    implementation: 'src/domains/pcaf-part-a/domain/corporate/lines.js and business-loans/lines.js — the six lines, computed from attribution × the borrower’s reported or estimated emissions',
    test: 'tests/parta-business-loans.test.js › the six portfolio lines reproduce Table 5.2-3 exactly',
    status: 'implemented',
  },

  // ---- The third verdict, and the checks a standard cannot give ---------
  {
    id: 'A-FIND-01',
    clause: 'CarbonIQ — the engine blocks a claim, not a number',
    rule: 'A correct figure at a correctly lower score is a finding, not a refusal: it changes no '
      + 'figure, stops nothing and travels into the report. With no financial data at all, Option '
      + '3b still produces a figure at score 5. Every finding names what would clear it.',
    implementation: 'src/domains/pcaf-part-a/domain/corporate/findings.js — the material/advisory finding, refused at construction if it names no remedy; the refusal is reserved for an input that makes the arithmetic wrong or the figure uncitable',
    test: 'tests/parta-business-loans.test.js › with no financial data at all, Option 3b still produces a figure at score 5',
    status: 'implemented',
  },
  {
    id: 'A-FIND-02',
    clause: 'Part A footnote 71 (year-end balance)',
    rule: 'Only the year-end balance counts, which is the rule; but a revolving facility far from '
      + 'its own annual average reports less than the bank financed, so it raises footnote 71 and '
      + 'still assesses. Where no average is held the check says it did not run rather than passing.',
    implementation: 'src/domains/pcaf-part-a/domain/business-loans/checks.js — yearEndFluctuation() raises FN71_YEAR_END_FLUCTUATION for a revolving facility away from its average and FN71_AVERAGE_NOT_HELD where the average is absent',
    test: 'tests/parta-business-loans.test.js › a revolving facility far from its own average raises footnote 71 and still assesses',
    status: 'implemented',
  },
  {
    id: 'A-FIND-03',
    clause: 'CarbonIQ — a check that had nothing to check does not pass',
    rule: 'The intensity plausibility check compares against the sector band; a thousand-fold '
      + 'divergence is material and the figure still stands, and where no band is held the check '
      + 'says so rather than passing silently. The finding cites the band version it was checked against.',
    implementation: 'src/domains/pcaf-part-a/domain/business-loans/checks.js — intensityPlausibility() raises INTENSITY_OUTSIDE_SECTOR_BAND when a band is held and INTENSITY_BAND_NOT_HELD when it is not, and cites the band version on the finding (the band’s resolution from the baseline registry is A-REG-06)',
    test: 'tests/parta-business-loans.test.js › the intensity finding cites the band it was checked against',
    status: 'implemented',
  },
  {
    id: 'A-FIND-04',
    clause: 'CarbonIQ thresholds (stated on the finding, settable per request)',
    rule: 'An emissions figure years behind the reporting year is reported, not rejected, with the '
      + 'lag as a finding; a denominator larger than the balance sheet it came from is a finding; a '
      + 'missing scope 3 is material and never reported as zero.',
    implementation: 'src/domains/pcaf-part-a/domain/business-loans/checks.js — emissionsLag(), denominatorCoherence() and the scope-3 absence finding, each carrying the CarbonIQ threshold it used',
    test: 'tests/parta-business-loans.test.js › a missing scope 3 is material and is never reported as zero',
    status: 'implemented',
  },

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

  // ---- Recalculation protocol (Chapter 6) -------------------------------
  {
    id: 'A-RECALC-01',
    clause: 'Chapter 6 — recalculation and significance',
    rule: 'The reporting entity’s recalculation protocol — a base year, a significance threshold '
      + 'and the triggers that force a recalculation — is a "shall". It is held as the entity’s '
      + 'own settings, and the base year is null until the entity sets one, because a base year '
      + 'is a claim about history and belongs to the entity, not to its software.',
    implementation: 'src/domains/pcaf-part-a/application/parta-settings.js — getSettings()/saveSettings() over an org-wide parta_settings record (re-exported through register.js); src/domains/pcaf-part-a/domain/recalculation.js holds the default triggers and the significance test',
    test: 'tests/parta-register.test.js › the recalculation protocol is the entity’s own settings, base year null until set',
    status: 'implemented',
  },

  // ---- The disclosed data-quality score and the improvement plan --------
  {
    id: 'A-DQ-01',
    clause: 'Part A Box 6.1-6 (pp.167–168), p.128',
    rule: 'The disclosed data-quality score is weighted by outstanding amount, with scope 3 weighted '
      + 'separately from scope 1 and 2. This is not how Part C weights it (by premium), so the two '
      + 'engines never share a weighting function.',
    implementation: 'src/domains/pcaf-part-a/domain/business-loans/portfolio.js — the disclosed score is Σ(outstanding × score) ÷ Σ(outstanding), scope 3 apart, and names its basis',
    test: 'tests/parta-business-loans.test.js › the disclosed score is weighted by outstanding amount and names its basis',
    status: 'implemented',
  },
  {
    id: 'A-DQ-02',
    clause: 'Part A (p.56)',
    rule: 'Financial-sector borrowers are rolled up separately from the rest of the book, as PCAF '
      + 'recommends.',
    implementation: 'src/domains/pcaf-part-a/domain/business-loans/portfolio.js — financial-sector borrowers form their own group in the roll-up',
    test: 'tests/parta-business-loans.test.js › financial-sector borrowers are rolled up apart, as PCAF recommends',
    status: 'implemented',
  },
  {
    id: 'A-DQ-03',
    clause: 'CarbonIQ — a score is a measurement, a plan is a task list',
    rule: 'The improvement plan is ordered by what each step is worth — outstanding × score points '
      + 'above the target — not by how many rows it touches, and every projected figure is a '
      + 'scenario run through the disclosure’s own weighting and never presented as the reported score.',
    implementation: 'src/domains/pcaf-part-a/domain/business-loans/portfolio.js — the plan groups findings by the sentence that clears them and orders option bands by outstanding × points above target; scenario figures are marked as scenarios',
    test: 'tests/parta-business-loans.test.js › the plan is ordered by what each step is worth, not by how many rows it touches',
    status: 'implemented',
  },
  {
    id: 'A-DQ-04',
    clause: 'Comparability — a position of zero is a different claim',
    rule: 'An empty book is refused rather than rendered as a position of zero: "we measured '
      + 'nothing carbon-intensive" is a different claim from "we have not measured yet". The '
      + 'register makes the same refusal for a reporting year with no exposures, and the '
      + 'disclosure route answers it as a 409 (A-REPORT-09).',
    implementation: 'src/domains/pcaf-part-a/domain/business-loans/portfolio.js — rollUp() refuses an empty book rather than returning a total of zero',
    test: 'tests/parta-business-loans.test.js › an empty book is refused rather than rendered as a position of zero',
    status: 'implemented',
  },

  // ---- The disclosure and the per-exposure report -----------------------
  {
    id: 'A-REPORT-01',
    clause: 'Part A Chapter 6 (pp.160–174)',
    rule: 'The disclosure is built from one content model in the order Chapter 6 reads, rendered to '
      + 'PDF and Word by one renderer shared with Part C without either domain importing the other.',
    implementation: 'src/domains/pcaf-part-a/reporting/sections.js builds the content model; src/platform/reporting/report-standard/ renders it, theme injected as a parameter so Part C’s output stays byte-identical',
    test: 'tests/parta-report.test.js › the annual disclosure reads in Chapter 6 order',
    status: 'implemented',
  },
  {
    id: 'A-REPORT-02',
    clause: 'Part A §5.2 (p.56); p.126',
    rule: 'In the disclosure, scope 3 is a separate line from scope 1 and 2 and is never summed with '
      + 'it, and removals and credits are netted against nothing.',
    implementation: 'src/domains/pcaf-part-a/reporting/sections.js — the absolute-emissions section carries scope 3 as its own line and states that no row nets a credit or a removal and no row sums scope 1 and 2 with scope 3',
    test: 'tests/parta-report.test.js › scope 3 is a separate line and nothing is netted',
    status: 'implemented',
  },
  {
    id: 'A-REPORT-03',
    clause: 'DCL Part A (p.124)',
    rule: 'Coverage is the assessed outstanding over the entity’s stated total loans and '
      + 'investments; where the total is unstated it is reported absent, not assumed.',
    implementation: 'src/domains/pcaf-part-a/reporting/facts.js — coverageStatement() states the percentage against the whole book or reports it absent with what it needs',
    test: 'tests/parta-report.test.js › coverage is a percentage of the stated book, or absent',
    status: 'implemented',
  },
  {
    id: 'A-REPORT-04',
    clause: 'Part A Box 6.1-6 (pp.167–168)',
    rule: 'The disclosed data-quality score is rendered as a category with the 1–5 scale and its '
      + 'direction stated, scope 3 apart, and never as a fraction.',
    implementation: 'src/domains/pcaf-part-a/reporting/sections.js — the data-quality section states that 1 is the highest quality and 5 the lowest and renders no score as a mark out of five',
    test: 'tests/parta-report.test.js › the weighted score is a category with the scale stated',
    status: 'implemented',
  },
  {
    id: 'A-REPORT-05',
    clause: 'Part A §5.2 (p.57); factor manifest',
    rule: 'The factor set the figures rest on is named in the report with a version, a status and a '
      + 'checksum; a provisional table says so.',
    implementation: 'src/domains/pcaf-part-a/reporting/model.js — Annex A prints the factorRelease from src/domains/pcaf-part-a/domain/sector-factors.js: table, version, rows used and SHA-256',
    test: 'tests/parta-report.test.js › the factor set is named with a checksum',
    status: 'implemented',
  },
  {
    id: 'A-REPORT-06',
    clause: 'Part A Chapter 6 (p.160); SLFRS S2 §29(a)',
    rule: 'The completed checklist is answered from the report and covers the §5.2 asset class only, '
      + 'so it can fail and can never reach a hundred per cent — this report is one input to a '
      + 'Chapter 6 disclosure, not the entity’s own gross scope 1/2/3 inventory.',
    implementation: 'src/domains/pcaf-part-a/reporting/checklist.js — completeChecklist() answers each item from the report and holds the entity-inventory item (INV-1) to No by rule, so the checklist cannot be complete',
    test: 'tests/parta-report.test.js › the checklist is answered from the report and cannot reach 100%',
    status: 'implemented',
  },
  {
    id: 'A-REPORT-07',
    clause: 'report-integrity; PCAF conformance language',
    rule: 'The document claims PCAF conformance and never endorsement; a report carrying forbidden '
      + 'language is refused at build.',
    implementation: 'src/domains/pcaf-part-a/reporting/model.js — buildStandardModel() scans for endorsement language via src/shared/report-integrity.js and throws before a document can be built',
    test: 'tests/parta-report.test.js › a report with endorsement language is refused',
    status: 'implemented',
  },
  {
    id: 'A-REPORT-08',
    clause: 'The engine does every arithmetic operation',
    rule: 'The report reads figures the register already holds and recomputes none of them; no '
      + 'language model computes a figure that reaches the document.',
    implementation: 'src/domains/pcaf-part-a/application/parta-report.js — annualDisclosure() and exposureReport() read the register’s stored position and result and arrange them; no arithmetic path runs here',
    test: 'tests/parta-report.test.js › every figure is one the register returned',
    status: 'implemented',
  },
  {
    id: 'A-REPORT-09',
    clause: 'pdf-response; delivery',
    rule: 'A document is collected in full and checked to be a well-formed PDF before it is sent, '
      + 'and a reporting year with no exposures is a 409, never a document of zeros.',
    implementation: 'src/domains/pcaf-part-a/interface/routes/register.js delivers via src/platform/reporting/pdf-response.js; annualDisclosure refuses an empty year with a 409',
    test: 'tests/parta-report-api.test.js › a well-formed PDF is delivered and an empty year is a 409',
    status: 'implemented',
  },
  {
    id: 'A-REPORT-10',
    clause: 'Chapter 6 — recalculation and significance',
    rule: 'The disclosure prints the entity’s recalculation protocol — base year, significance '
      + 'threshold and triggers — from its settings, and where no base year is set it says so on '
      + 'the page rather than implying the current year.',
    implementation: 'src/domains/pcaf-part-a/reporting/sections.js — recalculationSection() prints the base year (or "Not yet stated"), the threshold and the triggers, with an Open item callout when no base year is set',
    test: 'tests/parta-report.test.js › the recalculation section prints the entity’s protocol and says so when no base year is set',
    status: 'implemented',
  },
];

module.exports = { RULES };
