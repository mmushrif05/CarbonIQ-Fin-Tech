// @ts-check
/**
 * PCAF Part A §5.9 sovereign debt — the conformance matrix rules.
 *
 * Split from `conformance-rules.js` so neither file passes 500 lines
 * (tests/structure.test.js). `conformance-rules.js` spreads SOVEREIGN_RULES
 * into RULES, so the whole Part A matrix — §5.2 and §5.9 — is still one list
 * served at one route and proved by one evidence run.
 */

'use strict';

const SOVEREIGN_RULES = [
  {
    id: 'SOV-ATTR-01',
    clause: 'Part A §5.9 (p.144); Annex 10.3 (pp.201–204)',
    rule: 'The attribution factor is the exposure in international USD over the sovereign’s '
      + 'PPP-adjusted GDP in international USD — never equity plus debt. There is no cap, and a '
      + 'factor above 1 is refused as an input error: a single institution’s holding cannot exceed '
      + 'a nation’s output. Debt alone is a poor denominator (the 1,369× distortion), so output '
      + 'stands in for enterprise value.',
    implementation: 'src/domains/pcaf-part-a/domain/sovereign/attribution.js — sovereignAttributionFactor divides exposure by PPP-GDP and refuses a factor above 1',
    test: 'tests/parta-sovereign.test.js › the attribution factor is exposure ÷ PPP-adjusted GDP, not equity plus debt',
    status: 'implemented',
  },
  {
    id: 'SOV-ATTR-02',
    clause: 'Part A §5.9; Table 10.3-2 (p.202)',
    rule: 'The engine reproduces the standard’s own worked example: $1M of Singapore’s debt '
      + 'attributes 106 tCO2e and $1M of Hong Kong’s 91 tCO2e, from the excluding-LULUCF territorial '
      + 'emissions over PPP-GDP.',
    implementation: 'src/domains/pcaf-part-a/domain/sovereign/index.js — assessSovereign over data/pcaf-parta/sovereign/dataset.json',
    test: 'tests/parta-sovereign.test.js › $1M to Singapore attributes 106 tCO2e',
    status: 'implemented',
  },
  {
    id: 'SOV-LULUCF',
    clause: 'Part A §5.9 (p.141)',
    rule: 'Scope 1 is domestic territorial (production) emissions, reported both including and '
      + 'excluding LULUCF, and the two are never summed — they are the same emissions on two '
      + 'boundaries. The excluding-LULUCF line is the headline; where an including-LULUCF figure is '
      + 'not held it is reported absent, not assumed equal.',
    implementation: 'src/domains/pcaf-part-a/domain/sovereign/index.js and src/domains/pcaf-part-a/domain/sovereign/portfolio.js — scope 1 carried and rolled up on each boundary separately, the including-LULUCF sum partial with a held-count and never added to the excluding-LULUCF sum',
    test: 'tests/parta-sovereign-register.test.js › scope 1 is summed on both boundaries and never added together',
    status: 'implemented',
  },
  {
    id: 'SOV-SCOPE23',
    clause: 'Part A §5.9 (p.141)',
    rule: 'Scope 2 (imported grid energy) and scope 3 (non-energy imports) are §5.9 shoulds, '
      + 'reported absent rather than zero where not held; scope 3 is reported apart from scope 1 '
      + 'and 2 and never summed into it.',
    implementation: 'src/domains/pcaf-part-a/domain/sovereign/index.js — scope 2 and 3 returned as a stated absence when no figure is held, scope 3 kept as its own line',
    test: 'tests/parta-sovereign-report-golden.test.js › the whole disclosure matches the committed golden',
    status: 'implemented',
  },
  {
    id: 'SOV-DQ-TABLE',
    clause: 'Part A Table 5.9-6 (p.147)',
    rule: 'Data quality is scored from Table 5.9-6 alone — 1a→1, 1b→2, 2→3, 3a→4, 3b→5 — which '
      + 'has no Option 2b and no Option 3c. The sovereign table is held apart from every other '
      + 'class’s and cannot be substituted for one: the numerals mean different things.',
    implementation: 'src/domains/pcaf-part-a/domain/sovereign/options.js over data/pcaf-parta/dq-sovereign.json — the source basis maps to the option and the option to the score',
    test: 'tests/parta-sovereign-data.test.js › the option-to-score mapping is the sovereign table and no other',
    status: 'implemented',
  },
  {
    id: 'SOV-DQ-WEIGHT',
    clause: 'PCAF Disclosure Checklist Part A (p.128)',
    rule: 'The disclosed data-quality score is one score, weighted by outstanding amount — never '
      + 'Part C’s premium weighting. A holding carrying no score is excluded from the weighting, '
      + 'not counted as zero.',
    implementation: 'src/domains/pcaf-part-a/domain/sovereign/portfolio.js uses src/domains/pcaf-part-a/domain/data-quality.js weightedByOutstanding',
    test: 'tests/parta-sovereign-register.test.js › the disclosed score is weighted by outstanding amount',
    status: 'implemented',
  },
  {
    id: 'SOV-COVERAGE',
    clause: 'PCAF Disclosure Checklist Part A (p.124)',
    rule: 'Coverage is assessed outstanding over the reporting entity’s whole book, or reported '
      + 'absent with what it needs — never a percentage of a book nobody stated. The book total is '
      + 'the shared parta_book, not a sovereign-specific figure.',
    implementation: 'src/domains/pcaf-part-a/domain/sovereign/portfolio.js and src/domains/pcaf-part-a/application/sovereign-register.js — coverage against the shared book total or absent with a remedy',
    test: 'tests/parta-sovereign-register.test.js › coverage is a percentage of the stated book, or absent',
    status: 'implemented',
  },
  {
    id: 'SOV-CHECK-PROXY',
    clause: 'Part A Table 5.9-6 (p.147); CarbonIQ',
    rule: 'A figure resting on another country’s inventory (Option 3b, a proxy) raises a material '
      + 'finding — it refuses nothing and changes no figure, but a reader of the number is told the '
      + 'figure is a proxy.',
    implementation: 'src/domains/pcaf-part-a/domain/sovereign/checks.js — proxyCountry() fires from the resolved Option 3b',
    test: 'tests/parta-sovereign-checks.test.js › an Option 3b figure is flagged material as resting on another country',
    status: 'implemented',
  },
  {
    id: 'SOV-CHECK-LAG',
    clause: 'Part A ch.4 (p.31); Table 10.3-4 (pp.205–206); CarbonIQ threshold',
    rule: 'Where the emissions year sits at or beyond a threshold behind the reporting year a '
      + 'finding fires. PCAF permits the lag and EDGAR’s own series runs four years behind, so the '
      + 'threshold is CarbonIQ’s and says so on the finding; it is settable per request.',
    implementation: 'src/domains/pcaf-part-a/domain/sovereign/checks.js — emissionsLag() with a CarbonIQ-owned, settable threshold',
    test: 'tests/parta-sovereign-checks.test.js › Singapore raises the emissions-lag and one-sided-LULUCF findings',
    status: 'implemented',
  },
  {
    id: 'SOV-CHECK-INTENSITY',
    clause: 'Part A Annex 10.3 (pp.201–204); CarbonIQ threshold',
    rule: 'A production intensity (scope 1 excl LULUCF ÷ PPP-GDP) outside a plausible band raises a '
      + 'finding — the guardrail against the very distortion PPP-GDP exists to remove, where a '
      + 'denominator or the emissions are in the wrong units. The band is CarbonIQ’s and settable.',
    implementation: 'src/domains/pcaf-part-a/domain/sovereign/checks.js — intensityPlausibility() against a settable band',
    test: 'tests/parta-sovereign-checks.test.js › a denominator in the wrong units produces an implausible intensity',
    status: 'implemented',
  },
  {
    id: 'SOV-CHECK-INDEP',
    clause: 'CarbonIQ (the GCF independent-path rule)',
    rule: 'Where a second source is supplied the engine recomputes and reports the divergence '
      + 'rather than averaging it away; where none is supplied it says the cross-check could not '
      + 'run rather than passing silently.',
    implementation: 'src/domains/pcaf-part-a/domain/sovereign/checks.js — independentSource() reports SOVEREIGN_SOURCE_DIVERGENCE or SOVEREIGN_NO_INDEPENDENT_SOURCE',
    test: 'tests/parta-sovereign-checks.test.js › a diverging second source is reported, not averaged away',
    status: 'implemented',
  },
  {
    id: 'SOV-REGISTER',
    clause: 'CarbonIQ; the §5.2 register (migrations 0008/0009)',
    rule: 'The register keeps both the input keyed and the result computed and recomputes nothing '
      + 'on read; one bond is recorded once per year (a 409 and a partial unique index on the '
      + 'facility reference).',
    implementation: 'src/domains/pcaf-part-a/application/sovereign-register.js and migrations/0011_parta_sovereign_exposures.sql — a partial unique index on (org, year, account_number) and a 409 DUPLICATE_SOVEREIGN_HOLDING',
    test: 'tests/parta-sovereign-register.test.js › one bond once — a repeated reference in a year is a 409',
    status: 'implemented',
  },
  {
    id: 'SOV-PROJECTION',
    clause: 'CarbonIQ (the partc_assessments.rollup discipline)',
    rule: 'The roll-up reads a stored projection rather than the whole record, and the projected '
      + 'roll-up equals the whole-record roll-up figure for figure on either store.',
    implementation: 'src/domains/pcaf-part-a/application/sovereign-register.js and src/domains/pcaf-part-a/domain/sovereign/portfolio.js — the projection the position rolls up from',
    test: 'tests/parta-sovereign-register.test.js › the position rolled from the projection matches the whole-record roll-up figure for figure',
    status: 'implemented',
  },
  {
    id: 'SOV-EMPTY',
    clause: 'PCAF Disclosure Checklist Part A (p.124)',
    rule: 'A reporting year with no sovereign exposures is refused with a 409 rather than rendered '
      + 'as a position of zero — an empty book and an unmeasured one are different claims.',
    implementation: 'src/domains/pcaf-part-a/application/sovereign-register.js — position() throws EMPTY_SOVEREIGN_YEAR (409) on a year with no rows',
    test: 'tests/parta-sovereign-register.test.js › a reporting year with no exposures is a 409, not a position of zero',
    status: 'implemented',
  },
  {
    id: 'SOV-REPORT',
    clause: 'Part A Chapter 6 (pp.160–174); Annex 10.2 (pp.199–200)',
    rule: 'The §5.9 disclosure is one content model in the order Chapter 6 reads, rendered by the '
      + 'platform report standard, with scope 1 on both LULUCF boundaries never summed, the '
      + 'outstanding-weighted score, the Annex 10.2 table by sovereign, and the checklist answered '
      + 'from the report so it can fail.',
    implementation: 'src/domains/pcaf-part-a/reporting/sovereign/{facts,sections,model,checklist,report}.js — one document model over the sovereign position, rendered through src/platform/reporting/report-standard',
    test: 'tests/parta-sovereign-report-golden.test.js › the whole disclosure matches the committed golden',
    status: 'implemented',
  },
  {
    id: 'SOV-REPORT-INV',
    clause: 'Part A ch.6 (p.160); SLFRS S2 §29(a)',
    rule: 'The completed checklist can never reach a hundred per cent: the entity-inventory item is '
      + 'answered No with the reason, because this report covers the §5.9 asset class, one input to '
      + 'a Chapter 6 disclosure, not the disclosure.',
    implementation: 'src/domains/pcaf-part-a/reporting/sovereign/checklist.js — the INV-1 item is always answered No with its reason',
    test: 'tests/parta-sovereign-report-golden.test.js › the disclosure is a document, not an empty file',
    status: 'implemented',
  },
  {
    id: 'SOV-SCALE',
    clause: 'Part A Table 5.9-6 (p.147); docs/GLOSSARY.md §1',
    rule: 'A data-quality score is a category, not a mark out of five: the scale is stated wherever '
      + 'a score is shown, and no rendering writes "n / 5".',
    implementation: 'data/pcaf-parta/dq-sovereign.json states the scale, and src/domains/pcaf-part-a/reporting/sovereign/sections.js prints it beside every score',
    test: 'tests/parta-sovereign-data.test.js › the scale states 1 is the highest quality and is never a fraction',
    status: 'implemented',
  },
];

module.exports = { SOVEREIGN_RULES };
