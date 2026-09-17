// @ts-check
/**
 * The SLFRS S2 climate-related disclosure, in the order the standard reads.
 *
 * The body is the four pillars: the reporting entity and its basis of
 * preparation, then governance, strategy, risk management, and metrics and
 * targets — with financed emissions inside the fourth pillar as the scope 3
 * category 15 metric they are (S2 §29(a)(vi), B58–B63). What is still
 * outstanding and the statement of compliance close the body.
 *
 * Everything PCAF Part A Chapter 6 asks for around the financed-emissions
 * figure — the coverage of the book, the position by asset class, gases and
 * units, the method, data quality, recalculation, uncertainty — is the basis
 * of preparation for that one metric, and it is printed as such, in the
 * annexes (model.js), in full and unchanged. It used to open the document,
 * eight sections of it before the first pillar, so a reader filing an S2
 * disclosure held a PCAF document with S2 in the middle. No figure moved in
 * the reordering; the same blocks are built by the same functions.
 *
 * Every block reads facts and computes nothing.
 */

'use strict';

const { b, keep } = require('../../../../platform/reporting/report-standard/blocks');
const { entitySection } = require('../common-sections');
const { buildS2Sections } = require('./s2-sections');

const { fixed, moneyAnnotated } = require('../../../../shared/money');

const N = n => (n === null || n === undefined) ? '—'
  : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
/* Tonnes at three decimals with their separators — `12,038.240`. */
const T = n => fixed(n, 3);
const score = n => (n === null || n === undefined) ? 'not scored' : String(n);
const STATUS = { recorded: 'Reported', 'not-recorded': 'Not reported — nothing recorded', 'engine-only': 'Not reported — no register yet', 'not-built': 'Not reported — not built' };

// ---------------------------------------------------------------------------
// The body
// ---------------------------------------------------------------------------

/**
 * Section 1: who is reporting, on what basis, and how to read the document.
 * The entity table is the shared one every Part A document prints; what this
 * section adds is the scope statement and the map of the file.
 */
function basisSection(f) {
  const entity = entitySection(f);
  return {
    id: 'entity', title: 'Reporting entity and basis of preparation',
    blocks: keep([
      b.callout(f.scopeStatement, 'What this disclosure is'),
      ...entity.blocks,
      b.h2('How this document is arranged'),
      b.body('Sections 2 to 8 follow the four pillars of SLFRS S2 — governance, strategy, risk management, '
        + 'and metrics and targets — in the standard’s own order, and section 9 lists what the reporting '
        + 'entity has still to state before the disclosure is filed as complete. Financed emissions are '
        + 'measured under PCAF Part A, Third Edition; the position by asset class, the coverage of the book '
        + 'and the basis on which the figures were prepared are set out in Annexes A and B, with the factor '
        + 'sets, the exposure register and the completed PCAF disclosure checklist behind them. The SLFRS S2 '
        + 'index in Annex F names, for every paragraph of the standard, where in this document it is answered.'),
    ]),
  };
}

function limitationsSection(f) {
  const items = f.outstandingItems || [];
  return {
    id: 'limitations', title: 'What is still outstanding before filing',
    blocks: keep([
      b.body('The per-class documents carry the data checks and the improvement plan for each class — '
        + `${f.recorded.map(c => `${c.findings} finding(s) across ${c.label.toLowerCase()}`).join('; ') || 'no class recorded'}. `
        + 'What is listed here is what the disclosure itself still needs from the reporting entity before '
        + 'it can be filed as complete.'),
      items.length ? b.table({
        head: ['Outstanding', 'Why', 'Clause'],
        widths: [2.4, 2.6, 1], align: ['left', 'left', 'left'], zebra: true,
        rows: items.map(x => [x.what, x.why || 'Not stated by the reporting entity.', x.clause || '—']),
      }) : b.body('Nothing is outstanding: every fact the disclosure needs from the reporting entity has been stated.'),
    ]),
  };
}

function conformanceSection(f) {
  return {
    id: 'conformance', title: 'Statement of compliance',
    blocks: keep([
      b.body('This disclosure is prepared in accordance with SLFRS S2 Climate-related Disclosures, which is '
        + 'IFRS S2 as adopted in Sri Lanka. Each paragraph of the standard is indexed in Annex F to the section '
        + 'that answers it; a paragraph the reporting entity has not yet answered is printed as not stated with '
        + 'the paragraph beside it, and listed in section 9, rather than omitted.'),
      b.body(f.conformanceStatement),
      b.body('The financed-emissions figures state PCAF conformance. They do not claim that PCAF, or any other '
        + 'body, has approved, endorsed or certified the disclosure or the figures in it. Independent assurance '
        + 'of the figures, where obtained, is a separate exercise recorded on the cover.'),
      f.assuranceDetail ? b.body(f.assuranceDetail) : null,
    ]),
  };
}

/**
 * The body in the order it is read: the entity and its basis, the four S2
 * pillars, what is outstanding, and the statement of compliance.
 */
function buildSections(f) {
  return [
    basisSection(f),
    ...buildS2Sections(f),
    limitationsSection(f),
    conformanceSection(f),
  ];
}

// ---------------------------------------------------------------------------
// The financed-emissions basis of preparation — the blocks the annexes print
// ---------------------------------------------------------------------------

function coverageBlocks(f) {
  const c = f.coverage || {};
  return keep([
    b.body(`Reporting year ${f.reportingYear}. The position is taken at the fiscal year-end, which is how `
      + 'Part A accounts for financed emissions (Chapter 4). Every Part A asset class is listed: the '
      + 'ones reported with their outstanding and coverage, the ones not reported with the reason '
      + 'Chapter 6 asks for (p.162).'),
    b.table({
      head: ['Asset class', 'Section', 'Status', 'Exposures', 'Outstanding', 'Currency', 'Coverage'],
      widths: [2, 0.7, 1.9, 0.8, 1.3, 0.7, 0.8], align: ['left', 'left', 'left', 'right', 'right', 'left', 'right'], zebra: true,
      rows: f.classes.map(x => [x.label, x.section, STATUS[x.status] || x.status,
        x.status === 'recorded' ? String(x.exposures) : '—', x.status === 'recorded' ? N(x.outstanding) : '—',
        x.status === 'recorded' ? (x.currency || '—') : '—', x.status === 'recorded' && x.coveragePct !== null ? `${x.coveragePct.toFixed(2)}%` : '—']),
    }),
    b.h2('Coverage of the book'),
    b.figure({
      label: 'Share of total loans and investments assessed', value: c.sharePct === null || c.sharePct === undefined ? '—' : `${Number(c.sharePct).toFixed(2)}%`, unit: '',
      note: c.totalLoansAndInvestments
        ? `${moneyAnnotated(c.assessedOutstanding, c.currency)} of ${moneyAnnotated(c.totalLoansAndInvestments, c.currency)}${c.statedBy ? `, book total stated by ${c.statedBy}` : ''}`
        : 'Book total not yet stated',
    }),
    b.body(f.coverageStatement),
    c.excluded && c.excluded.length ? b.caption(`Excluded from the combined share, in their own currency: ${c.excluded.map(x => `${x.label} (${moneyAnnotated(x.outstanding, x.currency)})`).join('; ')}. `
      + 'Nothing here converts a currency at a rate the system does not hold.') : null,
    f.classes.some(x => x.status !== 'recorded') ? b.table({
      head: ['Asset class not reported', 'Section', 'Reason', 'Stated by'],
      widths: [1.9, 0.7, 3, 0.9], align: ['left', 'left', 'left', 'left'], zebra: true,
      rows: f.classes.filter(x => x.status !== 'recorded').map(x => [x.label, x.section, x.reason || 'Not stated', x.reasonStatedBy === 'entity' ? 'Reporting entity' : 'This system']),
    }) : null,
  ]);
}

function gasesBlocks(f) {
  const gwp = f.entity && f.entity.gwpBasis;
  return keep([
    b.body('Emissions are reported in tonnes of carbon dioxide equivalent (tCO2e), on '
      + (gwp ? `the 100-year global warming potentials of ${gwp}, as stated by the reporting entity. `
        : 'IPCC 100-year global warming potentials; the reporting entity has not stated which assessment report, and this document says so rather than assuming one. ')
      + 'Each class covers the seven Kyoto Protocol gases as its own section describes: a borrower’s '
      + 'inventory where reported, a national inventory for a sovereign, and whichever gases an '
      + 'emission factor covers where a figure is estimated.'),
    b.table({
      head: ['Gas', 'Formula', 'Where it arises'],
      widths: [1.6, 0.8, 3.6], align: ['left', 'left', 'left'], zebra: true,
      rows: f.KYOTO_GASES.map(g => [g.gas, g.formula, g.arises]),
    }),
    b.body('Biogenic carbon, where reported, is stated separately from the fossil inventory and never '
      + 'netted against it; land-use removals sit within a sovereign’s scope 1 including LULUCF and are '
      + 'never netted against its excluding figure.'),
  ]);
}

function absoluteBlocks(f) {
  const t = f.totals;
  return keep([
    b.figure({ label: 'Financed emissions across the classes reported — the headline', value: T(t.headline.value), unit: 'tCO2e',
      note: t.headline.basis }),
    b.figure({ label: 'Financed scope 3 across the classes — a separate line', value: T(t.scope3.value), unit: 'tCO2e', note: t.scope3.note }),
    /* The same figures drawn: one bar per class on its headline boundary,
       scope 3 apart beneath — the drawing scales the classes' own values and
       adds nothing up. */
    f.recorded.length ? b.bars({
      label: 'Financed emissions by asset class — the headline of each',
      rows: f.recorded.map(c => ({ label: `${c.label} (${c.section})`, value: c.headline.value })),
      unit: 'tCO2e, each class on the boundary its section reports', decimals: 3,
    }) : null,
    f.recorded.some(c => c.scope3 && c.scope3.value !== null) ? b.bars({
      label: 'Financed scope 3 by asset class — apart, never added to the headline',
      rows: f.recorded.map(c => ({ label: `${c.label} (${c.section})`, value: c.scope3 && c.scope3.value !== null ? c.scope3.value : null, color: '#9A9A9A' })),
      unit: 'tCO2e', decimals: 3,
    }) : null,
    b.table({
      head: ['Asset class', 'Headline', 'tCO2e', 'Scope 3 tCO2e', 'Data quality'],
      widths: [2, 2.2, 1.1, 1.1, 0.9], align: ['left', 'left', 'right', 'right', 'right'], zebra: true,
      rows: [
        ...f.recorded.map(c => [`${c.label} (${c.section})`, c.headline.label, T(c.headline.value), c.scope3 && c.scope3.value !== null ? T(c.scope3.value) : '—', score(c.dataQuality.score)]),
        Object.assign([`Total across ${f.recorded.length} class(es)`, 'Sum of the headlines above', T(t.headline.value), T(t.scope3.value), 'per class'], { _total: true }),
      ],
    }),
    b.caption(t.headline.note),
    f.recorded.some(c => c.scope1InclLULUCF && c.scope1InclLULUCF.value !== null)
      ? b.body(`Sovereign scope 1 including LULUCF, never added to the headline: ${f.recorded.filter(c => c.scope1InclLULUCF).map(c => `${T(c.scope1InclLULUCF.value)} tCO2e`).join('; ')}. ${f.recorded.find(c => c.scope1InclLULUCF).scope1InclLULUCF.note || ''}`)
      : null,
    f.recorded.some(c => c.financialSector) ? b.callout(
      f.recorded.filter(c => c.financialSector).map(c => `${c.label}: ${c.financialSector.exposures} exposure(s) to financial-sector borrowers, rolled up separately (§5.2, p.56).`).join(' '),
      'Financed emissions to the financial sector') : null,
  ]);
}

/* The attribution and estimation rule of each class, in its section's words. */
const METHOD = Object.freeze({
  'listed-equity-corporate-bonds': 'Listed equity and corporate bonds: the outstanding amount over the investee’s enterprise value including cash (EVIC), times the investee’s emissions, reported or estimated by option (§5.1, pp.41–44).',
  'business-loans-unlisted-equity': 'Business loans and unlisted equity: the outstanding amount over the borrower’s total equity plus debt (EVIC where listed), times the borrower’s emissions, reported or estimated by option (§5.2, p.57).',
  'project-finance': 'Project finance: the outstanding amount over the project’s total equity plus debt, times the project’s scope 1 and 2, reported or derived from generation and a named grid factor (§5.3).',
  'commercial-real-estate': 'Commercial real estate: the outstanding amount over the property value at origination, times the building’s operational scope 1 and 2 from metered energy or from statistics by floor area, the option set by how the energy is known (§5.4, p.79).',
  'mortgages': 'Mortgages: the outstanding amount over the property value at origination, times the dwelling’s operational scope 1 and 2 from metered energy or from statistics by floor area (§5.5).',
  'motor-vehicle-loans': 'Motor vehicle loans: the outstanding amount over the total value at origination (100 % where unknown), times the vehicles’ scope 1 and 2 from fuel consumed or from distance × efficiency × fuel factor, the option set per vehicle and the borrower carrying the lowest quality in the mix (§5.6, pp.91–94).',
  'sovereign-debt': 'Sovereign debt: the exposure in international USD over the sovereign’s PPP-adjusted GDP, times its territorial emissions on both LULUCF boundaries (§5.9, p.144).',
});

function methodologyBlocks(f) {
  return keep([
    b.body(`Each asset class is attributed on the rule its section of Part A sets. ${f.recorded.map(c => METHOD[c.assetClass]).filter(Boolean).join(' ')} `
      + 'The per-class documents carry each method in full; this disclosure lays their results side by side and computes nothing.'),
    b.body('The engine performs every arithmetic operation. Nothing in this disclosure is computed by a '
      + 'language model, and no figure here rests on one.'),
    ...f.releases.map(r => b.body(`${r.name[0].toUpperCase()}${r.name.slice(1)}: ${r.tables.map(t => `${t.table} v${t.version} (${t.status || (t.table === 'sectors' ? 'vocabulary' : 'released')})`).join(', ')}; `
      + `SHA-256 over the canonical form, ${r.checksum}.${r.provisionalTables && r.provisionalTables.length ? ` Provisional: ${r.provisionalTables.join(', ')}.` : ''}`)),
    f.band ? b.body(`Sector intensity bands (the plausibility check): ${f.band.basis}${f.band.provisional ? ' These are illustrative until a baseline is released.' : ''}`) : null,
  ]);
}

function dataQualityBlocks(f) {
  const dq = f.dataQuality;
  return keep([
    b.body(dq.note),
    b.body('1 is the highest quality, 5 the lowest; a score is a category, never a mark out of five. '
      + 'Within a class the score is weighted by outstanding amount (DCL p.128), and an exposure with no '
      + 'score is excluded from the weighting rather than counted as zero.'),
    b.table({
      head: ['Asset class', 'Weighted score', 'Scored on', 'Weighted by'],
      widths: [2.2, 1.2, 1.9, 1.2], align: ['left', 'right', 'left', 'left'], zebra: true,
      rows: dq.byClass.map(c => [`${c.label} (${c.section})`, score(c.score), c.table, c.weighting]),
    }),
    b.caption('No row combines two classes. The per-class documents show where each score sits by option.'),
  ]);
}

function recalculationBlocks(f) {
  const r = f.recalculation || { baseYear: null, significanceThresholdPct: null, triggers: [], policy: '' };
  return keep([
    b.body('A recalculation of the base year is a "shall" under Chapter 6 when the book, the method or '
      + 'a factor changes materially. The base year and the significance threshold belong to the '
      + 'reporting entity and apply to every class alike; where none has been set, this disclosure '
      + 'states so rather than implying the current year.'),
    b.table({
      head: ['Item', 'This reporting entity'], widths: [3.2, 2.8], align: ['left', 'left'],
      rows: [
        ['Inventory base year', r.baseYear ? String(r.baseYear) : 'Not yet stated for this reporting entity'],
        ['Significance threshold — triggers a recalculation of base-year emissions',
          r.significanceThresholdPct === null || r.significanceThresholdPct === undefined ? 'Not stated' : `${r.significanceThresholdPct}% movement in a reported figure`],
      ],
    }),
    b.h2('What triggers a recalculation'),
    r.triggers.length ? b.bullets(r.triggers) : b.body('No recalculation protocol has been stated for this reporting entity. Chapter 6 requires one.'),
    r.policy ? b.body(r.policy) : null,
    !r.baseYear ? b.callout('No base year is stated for this reporting entity. The disclosure says so rather than implying '
      + 'the current year, because a base year is a claim about history and belongs to the entity, not to its software.', 'Open item') : null,
  ]);
}

function intensityBlocks(f) {
  const i = f.intensity || {};
  return keep([
    b.figure({ label: 'Economic emission intensity across the classes in the book’s currency', value: i.value === null || i.value === undefined ? '—' : N(i.value),
      unit: i.unit || '', note: i.basis }),
    b.table({
      head: ['Asset class', 'Economic intensity', 'Unit'],
      widths: [2.4, 1.4, 2.2], align: ['left', 'right', 'left'], zebra: true,
      rows: f.recorded.map(c => [`${c.label} (${c.section})`, c.intensity && c.intensity.value !== null ? N(c.intensity.value) : '—', (c.intensity && c.intensity.unit) || '—']),
    }),
    b.body('Financed emissions per million of the currency outstanding (DCL p.127). A physical intensity '
      + 'is not reported at this level: each class holds a different physical denominator, and a '
      + 'sovereign’s production intensity is a country-level figure the §5.9 document carries.'),
  ]);
}

module.exports = {
  buildSections, N, T, score,
  coverageBlocks, gasesBlocks, absoluteBlocks, methodologyBlocks, dataQualityBlocks, recalculationBlocks, intensityBlocks,
};
