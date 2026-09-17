// @ts-check
/**
 * The SLFRS S2 sections of the consolidated disclosure, and the index that
 * makes the file readable as an S2 climate-related disclosure.
 *
 * Nothing was rewritten for S2. The financed-emissions blocks this document
 * has always printed answer S2 §29(a)(vi) and B58–B63 as they stand, and go
 * further than the standard asks; they are the basis of preparation for the
 * category 15 line and are printed in the annexes. What these sections add is
 * what S2 asks for that an emissions engine cannot compute — the four pillars,
 * the entity's own inventory, and the cross-industry and industry-based
 * metrics — plus the index naming where each paragraph is answered.
 *
 * Every block reads facts and computes nothing. An item the entity has not
 * stated prints as not stated with the paragraph that asks for it; an item
 * still equal to the illustrative pack prints marked as illustrative, because
 * a paragraph the tool provider wrote must never read as the bank's own.
 */

'use strict';

const { b, keep } = require('../../../../platform/reporting/report-standard/blocks');
const { N } = require('./s2-facts');

const PCT = n => (n === null || n === undefined) ? '—' : `${Number(n).toFixed(2)}%`;
const T = n => (n === null || n === undefined) ? '—' : Number(n).toFixed(3);

/** One statement of the entity's, with its paragraph and who made it. */
function statement(item, opts = {}) {
  if (!item) return [];
  if (item.state === 'absent') {
    return [
      b.h2(item.label),
      b.body(`Not stated by the reporting entity. ${item.paragraph} requires it${item.optional ? ' as additional information' : ''}.`),
    ];
  }
  const text = typeof item.value === 'string' ? item.value : String(item.value ?? '');
  return keep([
    b.h2(item.label),
    opts.lead ? b.body(opts.lead) : null,
    b.body(text),
    b.caption(`${item.paragraph} — ${item.provenance}`),
  ]);
}

/** The strip that opens every S2 section carrying illustrative content. */
function provenanceCallout(s2) {
  if (!s2.readiness.illustrative) return null;
  return b.callout(
    `${s2.readiness.illustrative} of the ${s2.readiness.total} statements the reporting entity makes in the `
    + 'climate-related sections below are illustrative content supplied with the tool, not statements by the '
    + 'reporting entity. Each is marked where it is printed. Replacing one with the entity’s own words marks it '
    + 'as the entity’s.',
    'Illustrative content in this disclosure');
}

// ---------------------------------------------------------------------------
// Governance · Strategy · Risk management
// ---------------------------------------------------------------------------

function governanceSection(f) {
  const s2 = f.s2, g = s2.governance;
  return {
    id: 's2Governance', title: 'Governance',
    blocks: keep([
      b.body('SLFRS S2 §5–7 ask for the governance processes, controls and procedures the reporting entity '
        + 'uses to monitor, manage and oversee climate-related risks and opportunities. What follows is the '
        + 'entity’s own statement; nothing in this section is derived from the register.'),
      provenanceCallout(s2),
      ...statement(g.body),
      g.frequency && g.frequency.state !== 'absent'
        ? b.figure({ label: 'How often the oversight body is informed', value: String(g.frequency.value), unit: '', note: `${g.frequency.paragraph} — ${g.frequency.provenance}` })
        : b.body(`How often the oversight body is informed: not stated. ${g.frequency ? g.frequency.paragraph : 'S2 §6(a)(ii)'} requires it.`),
      ...statement(g.oversight),
      ...statement(g.managementRole),
    ]),
  };
}

function strategySection(f) {
  const s = f.s2.strategy;
  const rows = (s.exposures && s.exposures.state !== 'absent' && Array.isArray(s.exposures.value)) ? s.exposures.value : [];
  return {
    id: 's2Strategy', title: 'Strategy',
    blocks: keep([
      b.body('SLFRS S2 §9–23 ask which climate-related risks and opportunities could reasonably be expected to '
        + 'affect the entity’s prospects, over what horizons, what effect they have on the business model and '
        + 'the financial statements, and how resilient the strategy is.'),
      ...statement(s.horizons),
      b.h2(s.exposures ? s.exposures.label : 'The climate-related risks and opportunities identified'),
      rows.length ? b.table({
        head: ['Risk or opportunity', 'Nature', 'Category', 'Horizon', 'How it could affect the entity'],
        widths: [1.6, 0.7, 1.3, 0.8, 2.6], align: ['left', 'left', 'left', 'left', 'left'], zebra: true,
        rows: rows.map(r => [r.title || '—', r.nature || '—', r.riskKind || '—', r.horizon || '—', r.description || '—']),
      }) : b.body(`Not stated by the reporting entity. ${s.exposures ? s.exposures.paragraph : 'S2 §10(a)–(c)'} requires it.`),
      rows.length ? b.caption(`${s.exposures.paragraph} — ${s.exposures.provenance} The horizons are the entity’s own, defined above.`) : null,
      ...statement(s.businessModel),
      ...statement(s.transitionPlan),
      ...statement(s.financialCurrent),
      ...statement(s.financialAnticipated),
      ...statement(s.resilience),
      ...statement(s.scenarios),
    ]),
  };
}

function riskManagementSection(f) {
  return {
    id: 's2RiskManagement', title: 'Risk management',
    blocks: keep([
      b.body('SLFRS S2 §24–26 ask for the processes by which climate-related risks and opportunities are '
        + 'identified, assessed, prioritised and monitored, and how those processes sit inside the entity’s '
        + 'overall risk management.'),
      ...f.s2.riskManagement.flatMap(i => statement(i)),
    ]),
  };
}

// ---------------------------------------------------------------------------
// Metrics: the inventory, the cross-industry metrics, the industry table
// ---------------------------------------------------------------------------

/** One row of the inventory table: the figure, how it was arrived at, who stated it. */
function inventoryRow(item, label) {
  if (!item || item.state === 'absent') {
    return [label, 'Not reported', '—', '—', `Not stated — ${item ? item.paragraph : 'S2 §29(a)'}`];
  }
  const v = item.value || {};
  return [label, v.display || 'Not reported', v.basis || '—', v.period || '—',
    v.absentReason ? `Reported absent: ${v.absentReason}` : item.provenance];
}

function inventorySection(f) {
  const inv = f.s2.inventory;
  return {
    id: 's2Inventory', title: 'Metrics and targets — greenhouse gas emissions',
    blocks: keep([
      b.body('SLFRS S2 §29(a) asks for the entity’s absolute gross scope 1, scope 2 and scope 3 emissions. '
        + 'Scope 1 and scope 2 are the entity’s own operations and only the entity can state them. Category 15 '
        + 'of scope 3 — financed emissions — is measured by this system from the exposure register; the figure '
        + 'below is that measurement, and Annex A is its position by asset class and its coverage of the book.'),
      b.figure({ label: 'Financed emissions — scope 3 category 15, scope 1 and 2 of the borrowers and investees', value: T(inv.category15.value), unit: 'tCO2e',
        note: `Measured from the exposure register for FY${f.reportingYear}; the position by asset class, the coverage and the data quality are in Annex A.` }),
      b.figure({ label: 'Financed scope 3 of the borrowers and investees — a separate line, never added to the figure above', value: T(inv.category15.scope3), unit: 'tCO2e',
        note: 'Reported apart, as PCAF Part A requires (p.126).' }),
      b.table({
        head: ['Line', 'Figure', 'Basis', 'Period', 'Stated by'],
        widths: [2.1, 1.3, 0.9, 0.8, 1.9], align: ['left', 'right', 'left', 'left', 'left'], zebra: true,
        rows: [
          inventoryRow(inv.scope1, 'Scope 1 — gross, direct'),
          inventoryRow(inv.scope2Location, 'Scope 2 — gross, location-based'),
          inventoryRow(inv.scope2Market, 'Scope 2 — gross, market-based (additional)'),
          inventoryRow(inv.scope3Other, 'Scope 3 — categories other than 15'),
          ['Scope 3 category 15 — financed emissions', `${T(inv.category15.value)} tCO2e`, 'Measured', `FY${f.reportingYear}`,
            'Measured by this system from the exposure register'],
        ],
      }),
      b.caption(inv.category15.note),
      b.body('No row above sums the others. S2 requires each scope to be disclosed separately, and a total that '
        + 'mixed a figure the entity stated with one this system measured would obscure which is which. The '
        + 'financed scope 3 of the investees themselves — '
        + `${T(inv.category15.scope3)} tCO2e — is reported on its own line above and in Annex A, and is not part of the category 15 figure.`),
      ...statement(inv.measurementApproach),
      f.s2.inventoryStated ? null : b.callout(
        'The entity’s own gross scope 1 and location-based scope 2 have not been stated, so this document remains '
        + 'the category 15 input to an S2 inventory rather than the inventory itself. Recording them completes it.',
        'Open item'),
    ]),
  };
}

/** One §29(b)–(d) band as a figure with the unassessed amount beside it. */
function bandBlocks(band, label, paragraph, currency) {
  const rows = [
    ['Amount vulnerable or aligned', `${N(band.amount)} ${currency || ''}`.trim()],
    ['Amount assessed and not vulnerable or not aligned', `${N(band.notAmount)} ${currency || ''}`.trim()],
    ['Amount not yet assessed', `${N(band.unassessedAmount)} ${currency || ''}`.trim()],
    ['Percentage of the amount assessed', PCT(band.sharePct)],
  ];
  return [
    b.h2(`${label} — ${paragraph}`),
    b.table({ head: ['Measure', 'Reporting year'], widths: [3.6, 2.4], align: ['left', 'right'], rows }),
  ];
}

function crossIndustrySection(f) {
  const s2 = f.s2, e = s2.exposure, c = s2.crossIndustry;
  const ccy = f.currency;
  const price = c.carbonPrice, rem = c.remuneration, cap = c.capitalDeployed;
  return {
    id: 's2CrossIndustry', title: 'Metrics and targets — cross-industry metrics',
    blocks: keep([
      b.body('SLFRS S2 §29(b)–(g) ask for the amount and percentage of assets vulnerable to transition risks, '
        + 'vulnerable to physical risks and aligned with climate-related opportunities, the capital deployed, '
        + 'any internal carbon price and any remuneration linked to climate. The three amounts are classified '
        + 'exposure by exposure by the reporting entity and summed here by the engine.'),
      b.body(e.transitionRisk.basis || ''),
      ...bandBlocks(e.transitionRisk, 'Assets vulnerable to climate-related transition risks', 'S2 §29(b)', ccy),
      ...bandBlocks(e.physicalRisk, 'Assets vulnerable to climate-related physical risks', 'S2 §29(c)', ccy),
      ...bandBlocks(e.opportunities, 'Assets aligned with climate-related opportunities', 'S2 §29(d)', ccy),
      e.transitionRisk.unassessedAmount > 0 ? b.caption(
        'The percentage is taken over the outstanding actually assessed; the amount not yet assessed is stated '
        + 'above rather than counted as not vulnerable, so a book that has not been classified reads as '
        + 'unclassified and never as safe.') : null,
      b.h2('Capital deployed, carbon price and remuneration'),
      b.table({
        head: ['Metric', 'Reporting year', 'Paragraph', 'Stated by'],
        widths: [1.8, 2.1, 0.9, 1.2], align: ['left', 'left', 'left', 'left'], zebra: true,
        rows: [
          ['Capital deployed towards climate-related risks and opportunities',
            cap && cap.state !== 'absent' ? (cap.value && cap.value.display) || 'Not reported' : 'Not stated',
            'S2 §29(e)', cap && cap.state !== 'absent' ? cap.provenance : '—'],
          ['Internal carbon price',
            price && price.state !== 'absent' ? (price.value && price.value.display) || 'Not reported' : 'Not stated',
            'S2 §29(f)', price && price.state !== 'absent' ? price.provenance : '—'],
          ['Remuneration linked to climate-related considerations',
            rem && rem.state !== 'absent' ? (rem.value && rem.value.display) || 'Not reported' : 'Not stated',
            'S2 §29(g)', rem && rem.state !== 'absent' ? rem.provenance : '—'],
        ],
      }),
      price && price.state !== 'absent' && price.value && price.value.appliedTo.length
        ? b.body(`The internal carbon price is applied to: ${price.value.appliedTo.join('; ')}.`) : null,
    ]),
  };
}

function industrySection(f) {
  const ind = f.s2.exposure.industries;
  const ccy = f.currency;
  return {
    id: 's2Industry', title: 'Metrics and targets — industry-based metrics',
    blocks: keep([
      b.body('The SLFRS S2 industry-based guidance for commercial banks asks for gross exposure and the '
        + 'associated financed emissions disaggregated by industry, and for lending to carbon-related industries '
        + 'to be identified. An industry is the sector recorded against an exposure from this system’s own '
        + 'vocabulary; the emissions column is the scope 1 and 2 each class reports on its headline, never mixed '
        + 'with scope 3.'),
      ind.rows.length ? b.table({
        head: ['Industry', 'Exposures', `Outstanding ${ccy || ''}`.trim(), 'Financed scope 1 and 2 tCO2e', 'Carbon-related'],
        widths: [2.1, 0.8, 1.4, 1.5, 1], align: ['left', 'right', 'right', 'right', 'left'], zebra: true,
        rows: ind.rows.map(r => [r.sector || 'Not recorded', String(r.exposures), N(r.outstanding), T(r.emissions), r.carbonRelated ? 'Yes' : '—']),
      }) : b.body('No exposure carries a sector, so no industry table can be given.'),
      b.figure({
        label: 'Outstanding to carbon-related industries', value: N(ind.carbonRelated.outstanding), unit: ccy || '',
        note: ind.carbonRelated.sharePct === null || ind.carbonRelated.sharePct === undefined
          ? 'A share cannot be stated: no exposure carries an outstanding amount.'
          : `${PCT(ind.carbonRelated.sharePct)} of the outstanding across every class reported.`,
      }),
      b.caption(ind.carbonRelated.basis || ''),
      ind.rows.some(r => !r.sectorKey) ? b.caption(
        'An industry row names a sector from this system’s own vocabulary. An exposure recorded without one is '
        + 'counted under "Industry not recorded" and sits outside the carbon-related subtotal: it is neither '
        + 'claimed to be carbon-related nor claimed not to be. Every asset class but business loans and unlisted '
        + 'equity keeps its own descriptor where a borrower’s sector stands — a building type, a dwelling type, a '
        + 'vehicle class — and none of those is an industry.') : null,
    ]),
  };
}

function targetsSection(f) {
  const t = f.s2.targets;
  const rows = (t.entries && t.entries.state !== 'absent' && Array.isArray(t.entries.value)) ? t.entries.value : [];
  return {
    id: 's2Targets', title: 'Metrics and targets — climate-related targets',
    blocks: keep([
      b.body('SLFRS S2 §33–36 ask for each climate-related target the entity has set or is required to meet, '
        + 'the metric and the part of the entity it covers, its base year and target year, whether it was '
        + 'validated by a third party, and performance against it.'),
      rows.length ? b.table({
        head: ['Target', 'Metric', 'Kind', 'Covers', 'Base year', 'Target year', 'Set by', 'Validation'],
        widths: [1.5, 1.1, 0.6, 1.1, 0.55, 0.6, 0.85, 0.75],
        align: ['left', 'left', 'left', 'left', 'right', 'right', 'left', 'left'], zebra: true,
        rows: rows.map(r => [r.name || '—', r.metric || '—', r.targetKind || '—', r.scopeCovered || '—',
          r.baseYear === null ? '—' : String(r.baseYear), r.targetYear === null ? '—' : String(r.targetYear),
          r.source || '—', r.validator ? `${r.validation} — ${r.validator}` : (r.validation || '—')]),
      }) : b.body(`No climate-related target is stated by the reporting entity. ${t.entries ? t.entries.paragraph : 'S2 §33–36'} requires each target to be disclosed.`),
      rows.length ? b.caption(`${t.entries.paragraph} — ${t.entries.provenance}`) : null,
      ...rows.filter(r => r.milestones || r.progress).map(r => b.body(
        `${r.name}: ${[r.milestones, r.progress].filter(Boolean).join(' ')}`)),
      ...statement(t.ghgBasis),
    ]),
  };
}

// ---------------------------------------------------------------------------
// The index
// ---------------------------------------------------------------------------

/**
 * One row per S2 paragraph, naming the section of this document that answers
 * it — which is what lets the file be read as an SLFRS S2 climate-related
 * disclosure without a figure having been rewritten for S2.
 */
function s2IndexAnnex(f, letter) {
  const where = new Map([
    ...(f.sectionTitles || []).map(s => [s.id, `Section ${s.number}. ${s.title}`]),
    ...(f.annexTitles || []).map(a => [a.id, `Annex ${a.letter}. ${a.title}`]),
  ]);
  return {
    id: 'annexS2Index', annex: letter, title: 'SLFRS S2 index — where each paragraph is answered',
    blocks: keep([
      b.body('SLFRS S2 is IFRS S2 as adopted in Sri Lanka. Each paragraph below names the section of this '
        + 'document that answers it, and whether it is answered. A paragraph answered No is one the reporting '
        + 'entity has not yet stated; the section still prints it as not stated with the paragraph beside it, '
        + 'so a reader can see what is missing rather than assume it is absent by choice.'),
      b.table({
        head: ['Paragraph', 'What it asks', 'Where in this document', 'Answered'],
        widths: [1, 2.5, 1.7, 0.7], align: ['left', 'left', 'left', 'left'], zebra: true,
        rows: f.s2.index.map(r => [r.paragraph, r.requirement, where.get(r.section) || r.section, r.answered ? 'Yes' : 'No']),
      }),
      b.caption(`${f.s2.answeredParagraphs} of ${f.s2.index.length} paragraphs are answered in this document. `
        + 'Governance, strategy, risk management and the entity’s own inventory are statements only the reporting '
        + 'entity can make; the financed-emissions paragraphs are measured from the exposure register and set out '
        + 'in the annexes.'),
    ]),
  };
}

const buildS2Sections = f => [
  governanceSection(f), strategySection(f), riskManagementSection(f),
  inventorySection(f), crossIndustrySection(f), industrySection(f), targetsSection(f),
];

module.exports = { buildS2Sections, s2IndexAnnex };
