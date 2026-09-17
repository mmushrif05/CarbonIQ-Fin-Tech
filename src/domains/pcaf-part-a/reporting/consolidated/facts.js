// @ts-check
/**
 * The facts the consolidated Part A disclosure is built from — the bank's
 * whole financed-emissions book for one reporting year, every asset class
 * side by side.
 *
 * This is the document a bank files. It draws the same entity facts, the same
 * assurance position and the same identity discipline as the per-class
 * documents, and adds what only a consolidated view can say: the classes
 * reported and the classes not reported with their reasons (Chapter 6, p.162),
 * one coverage against the one book, and one headline with the boundary each
 * class contributed on named beside it.
 *
 * What it still is not: the reporting entity's own gross scope 1, 2 and 3
 * inventory (SLFRS S2 §29(a)). Financed emissions are Category 15 of that
 * inventory, and this document says so rather than letting a reader take the
 * financed book for the whole.
 */

'use strict';

const { faceStatement, resolve: resolveAssuranceMode } = require('../../../../shared/assurance-mode');
const { release: factorRelease } = require('../../domain/sector-factors');
const { release: datasetRelease } = require('../../domain/sovereign/dataset');
const { release: energyRelease } = require('../../domain/real-estate/dataset');
const { release: gridRelease } = require('../../domain/country-config');
const { release: vehicleRelease } = require('../../domain/motor-vehicles/dataset');
const { entityOf } = require('../entity');
const { identityOf } = require('../identity');
const { assuranceDetailOf, recalculationOf, factorRows, KYOTO_GASES } = require('../facts');
const { s2Facts } = require('./s2-facts');

const STANDARD = 'PCAF (2025). The Global GHG Accounting and Reporting Standard Part A: Financed '
  + 'Emissions. Third Edition — the built asset classes §5.2 (business loans and unlisted equity) '
  + 'and §5.9 (sovereign debt), and Chapter 6.';
const ENTITY_LABEL = 'Reporting entity';

const DEFAULT_ASSURANCE = (() => {
  const r = resolveAssuranceMode({});
  return { ...r, statement: faceStatement(r) };
})();

const num = v => typeof v === 'number' && Number.isFinite(v);

const SCOPE_BASE =
  'This is the reporting entity’s climate-related disclosure for the reporting year: the four SLFRS S2 '
  + 'pillars — governance, strategy, risk management, and metrics and targets — over a PCAF Part A '
  + 'financed-emissions position that reports every asset class side by side against one book total. '
  + 'Financed emissions are scope 3 Category 15 of the entity’s own inventory (S2 §29(a)(vi), B58–B63). ';

/**
 * The scope statement turns on one fact, so it can never say the inventory is
 * made elsewhere on a document that prints it.
 */
const scopeStatement = inventoryStated => SCOPE_BASE + (inventoryStated
  ? 'The entity’s own gross scope 1 and scope 2 are stated in the inventory section, so this document carries '
    + 'the whole of what S2 §29(a) asks and names the source of each line.'
  : 'The entity’s gross scope 1, 2 and 3 (S2 §29(a)(i)–(iv)) has not been stated, so this document remains the '
    + 'Category 15 input to that inventory rather than the inventory itself; the SLFRS S2 index names every '
    + 'paragraph and whether it is answered.');

function conformanceStatement(recorded) {
  const marks = recorded.map(c => c.section === '§5.2'
    ? 'business loans and unlisted equity (§5.2) carries the GHG Protocol’s "Built on" mark'
    : `${c.label.toLowerCase()} (${c.section}) is a Third Edition addition not reviewed by the GHG Protocol`);
  return 'The method in this disclosure conforms to PCAF’s Global GHG Accounting and Reporting '
    + 'Standard Part A (Third Edition, December 2025) for each asset class reported, and to Chapter 6 '
    + 'for the disclosure itself. PCAF sets the method; it does not approve, endorse or certify this '
    + 'disclosure or the figures in it. '
    + (marks.length ? `Of the classes reported: ${marks.join('; ')}.` : '');
}

/** The uncertainty statement reads a distribution by score; merged across classes by share of combinable outstanding. */
function distributionOf(classes) {
  const rows = classes.filter(c => c.status === 'recorded' && c.combinable);
  const total = rows.reduce((s, c) => s + (num(c.outstanding) ? c.outstanding : 0), 0);
  const m = new Map();
  for (const c of rows) {
    const dist = c.optionDistribution && c.optionDistribution.length
      ? c.optionDistribution.map(d => ({ score: d.score, outstanding: d.outstanding, exposures: d.exposures }))
      : (num(c.dataQuality.score) ? [{ score: Math.round(c.dataQuality.score), outstanding: c.outstanding, exposures: c.exposures }] : []);
    for (const d of dist) {
      const row = m.get(d.score) || { option: `score ${d.score}`, score: d.score, exposures: 0, outstanding: 0 };
      row.exposures += d.exposures || 0; row.outstanding += num(d.outstanding) ? d.outstanding : 0;
      m.set(d.score, row);
    }
  }
  return [...m.values()].map(x => ({ ...x, outstanding: +x.outstanding.toFixed(2), shareOfBook: total > 0 ? +(x.outstanding / total).toFixed(4) : null }))
    .sort((a, b) => a.score - b.score);
}

function regulatoryMappingOf(f) {
  const yes = 'Yes', no = 'No', elsewhere = 'Elsewhere';
  const anyDisagg = f.classes.some(c => c.status === 'recorded');
  return [
    { requirement: 'Absolute gross financed emissions — scope 1, 2 and 3 — by asset class and by industry', clause: 'SLFRS S2 §29(a)(vi); B61(a)', status: anyDisagg ? yes : no, where: 'Metrics and targets — greenhouse gas emissions; Annex A; Annex D' },
    { requirement: 'Gross exposure (outstanding) by asset class and industry', clause: 'SLFRS S2 B61(b)', status: anyDisagg ? yes : no, where: 'Annex A; Annex D' },
    { requirement: 'Percentage of gross exposure included in the financed-emissions calculation', clause: 'SLFRS S2 B61(c); DCL p.124', status: num(f.coverage.sharePct) ? yes : no, where: 'Annex A — coverage of the book' },
    { requirement: 'Methodology, inputs and assumptions per asset class, including the standard applied', clause: 'SLFRS S2 B61(d); §29(a)(iv)', status: yes, where: 'Annex B; Annex C' },
    /* Economic intensity is PCAF's disclosure requirement, not S2 §29(b): the
       S2 cross-industry metric at (b) is the amount and percentage of assets
       vulnerable to transition risk, which is the row beneath. The clause was
       wrong here and a reviewer following it would have found the wrong
       metric. */
    { requirement: 'Economic emission intensity', clause: 'PCAF DCL p.127; SLFRS S2 §37', status: num(f.intensity && f.intensity.value) ? yes : no, where: 'Annex A — emission intensity' },
    { requirement: 'Amount and percentage of assets vulnerable to transition risk, to physical risk, and aligned with opportunities', clause: 'SLFRS S2 §29(b)–(d)', status: num(f.s2.exposure.transitionRisk.sharePct) ? yes : no, where: 'Metrics and targets — cross-industry metrics' },
    { requirement: 'Exposure and financed emissions by industry, carbon-related lending identified', clause: 'SLFRS S2 §32; banking guidance', status: f.s2.exposure.industries.rows.length ? yes : no, where: 'Metrics and targets — industry-based metrics' },
    { requirement: 'Governance, strategy and risk management for climate-related risks and opportunities', clause: 'SLFRS S2 §5–7, §9–23, §24–26', status: f.s2.pillars.slice(0, 3).every(p => p.absent < p.total) ? yes : no, where: 'Sections 2 to 4; the SLFRS S2 index' },
    { requirement: 'Climate-related targets, their basis and performance against them', clause: 'SLFRS S2 §33–36', status: (f.s2.targets.entries && f.s2.targets.entries.state !== 'absent') ? yes : no, where: 'Metrics and targets — climate-related targets' },
    { requirement: 'Data-quality approach and score per asset class', clause: 'PCAF DCL p.128; SLFRS S2 B63', status: f.dataQuality.byClass.every(c => num(c.score)) && f.dataQuality.byClass.length ? yes : no, where: 'Annex B — data quality' },
    { requirement: 'Asset classes not reported, with the reason', clause: 'PCAF Part A ch.6 (p.162)', status: f.classes.filter(c => c.status !== 'recorded').every(c => Boolean(c.reason)) ? yes : no, where: 'Section 1; Annex A' },
    { requirement: 'The reporting entity’s own gross scope 1, 2 and 3 inventory', clause: 'SLFRS S2 §29(a)(i)–(iv)',
      status: f.s2.inventoryStated ? yes : no,
      where: f.s2.inventoryStated ? 'Metrics and targets — greenhouse gas emissions' : 'Not stated by the reporting entity: financed emissions are Category 15 of that inventory, and the rest is the entity’s to state' },
    { requirement: 'Sustainable-finance classification of the lending book under the SLGFT', clause: 'CBSL Direction No. 05 of 2022', status: elsewhere, where: 'The taxonomy screen and the Green Loan Certificate, not a financed-emissions document' },
  ];
}

function gapsOf(f) {
  const e = f.entity || {};
  const out = [...(e.gaps || []).map(g => ({ what: g.what, why: 'Not stated by the reporting entity.', clause: g.clause }))];
  if (!num(f.coverage.sharePct)) out.push({ what: 'Coverage as a percentage of total loans and investments', why: f.coverage.remedy || 'Not statable.', clause: 'DCL p.124' });
  for (const x of f.coverage.excluded || []) out.push({ what: `${x.label} in the combined coverage share`, why: `Denominated in ${x.currency}; the book total is in ${f.currency}. Excluded rather than converted at a rate this system does not hold.`, clause: 'DCL p.124' });
  for (const c of f.classes.filter(x => x.status !== 'recorded')) {
    out.push({ what: `${c.label} (${c.section})`, why: `${c.reason}${c.reasonStatedBy === 'entity' ? ' (stated by the reporting entity)' : ''}`, clause: 'Part A ch.6 (p.162)' });
  }
  if (!f.recalculation.baseYear) out.push({ what: 'The inventory base year', why: 'Not stated by the reporting entity.', clause: 'Part A ch.6 (p.164)' });
  out.push({ what: 'Prior-year comparatives and restatements', why: 'No register holds a locked prior position yet; nothing can be restated until the lock-and-supersede lifecycle exists.', clause: 'Part A ch.6 (p.164)' });
  for (const rel of f.releases.filter(r => r.provisionalTables && r.provisionalTables.length)) {
    out.push({ what: `A released ${rel.name}`, why: `The set in use is provisional (${rel.provisionalTables.join(', ')}); every provisional row carries the gap it stands in for.`, clause: 'Part A Box 6.1-5 (p.167)' });
  }
  if (!f.s2.inventoryStated) {
    out.push({ what: 'The reporting entity’s own gross scope 1 and scope 2 emissions',
      why: 'Financed emissions are Category 15 of the inventory; scope 1 and scope 2 are the entity’s own operations and only the entity can state them.',
      clause: 'SLFRS S2 §29(a)(i)–(ii); Part A ch.6 (p.160)' });
  }
  /* One row per S2 pillar that is not complete, not one per paragraph: the
     index annex already names every paragraph and whether it is answered, and
     twenty rows here would bury the handful of Chapter 6 items beside them.
     The count names how much is outstanding and the pillar names where. */
  for (const p of f.s2.pillars.filter(x => x.absent > 0)) {
    out.push({ what: `State the ${p.absent} SLFRS S2 ${p.label.toLowerCase()} fact(s) not yet recorded`,
      why: 'Governance, strategy, risk management and the entity’s own metrics are statements only the reporting entity can make; the SLFRS S2 index names each paragraph and whether it is answered.',
      clause: p.paragraphs });
  }
  if (f.s2.readiness.illustrative > 0) {
    out.push({ what: `Replace ${f.s2.readiness.illustrative} illustrative climate statement(s) with the reporting entity’s own words`,
      why: 'Illustrative content is supplied with the tool so a disclosure can be read whole from the first day; it is marked wherever it is printed and is not a statement by the reporting entity.',
      clause: 'SLFRS S2 §5–37' });
  }
  return out;
}

/**
 * @param {object} input
 * @param {any} input.position      the consolidated position
 * @param {any[]} input.rows        the combined register rows
 * @param {string|number} input.reportingYear
 * @param {string} [input.insurer]
 * @param {string} [input.currency]
 * @param {any} [input.assurance]
 * @param {any} [input.assuranceDeclaration]
 * @param {any} [input.band]
 * @param {any} [input.recalculation]  the entity's settings
 * @param {object} [input.meta]
 */
function disclosureFacts(input) {
  const pos = input.position;
  const assurance = input.assurance || DEFAULT_ASSURANCE;
  const currency = input.currency || pos.currency || 'LKR';
  const entity = entityOf(input.recalculation, input.reportingYear, input.insurer);
  const classes = pos.classes || [];
  const recorded = classes.filter(c => c.status === 'recorded');

  const bl = recorded.find(c => c.assetClass === 'business-loans-unlisted-equity');
  const sv = recorded.find(c => c.assetClass === 'sovereign-debt');

  /* One release per recorded class, in section order — the set that class's
     figures rest on, named with its checksum. The methodology checklist item
     holds the count to the recorded classes, so a class that names no set
     answers No rather than passing on another class's. */
  const RELEASE = {
    'listed-equity-corporate-bonds': () => ({ name: 'regional sector factor set (§5.1 estimates)', ...factorRelease(), rows: factorRows() }),
    'business-loans-unlisted-equity': () => ({ name: 'regional sector factor set', ...factorRelease(), rows: factorRows() }),
    'project-finance': () => ({ name: 'country grid factor set', ...gridRelease(), rows: [] }),
    'commercial-real-estate': () => ({ name: 'real-estate energy statistics', ...energyRelease(), rows: [] }),
    'mortgages': () => ({ name: 'real-estate energy statistics (§5.5)', ...energyRelease(), rows: [] }),
    'motor-vehicle-loans': () => ({ name: 'vehicle statistics', ...vehicleRelease(), rows: [] }),
    'sovereign-debt': () => ({ name: 'sovereign dataset', ...datasetRelease(), rows: [] }),
  };
  const releases = recorded.filter(c => RELEASE[c.assetClass]).map(c => RELEASE[c.assetClass]());

  const f = {
    kind: 'consolidated',
    standard: STANDARD,
    assetClassLabel: recorded.map(c => `${c.label} (${c.section})`).join('; ') || 'No asset class recorded',
    entityLabel: ENTITY_LABEL,
    title: 'SLFRS S2 climate-related disclosure',
    subtitle: `Reporting year ${input.reportingYear} — governance, strategy, risk management, metrics and targets; financed emissions measured under PCAF Part A`,
    insurer: entity.name || 'Reporting entity not stated',
    entity,
    responsibleParty: entity.responsibleParty,
    reportingYear: input.reportingYear,
    currency,
    publishedAt: (input.meta && input.meta.publishedAt) || new Date().toISOString(),
    reportId: (input.meta && input.meta.reportId) || null,
    url: (input.meta && input.meta.url) || null,
    preparedBy: 'Prepared with CarbonIQ FinTech',

    exposures: pos.exposures,
    classes,
    recorded,
    totals: pos.totals,
    coverage: pos.coverage,
    book: pos.book,
    intensity: pos.intensity,
    dataQuality: pos.dataQuality,
    optionDistribution: distributionOf(classes),
    outstandingItems: pos.outstandingItems || [],
    approval: pos.approval || null,
    undrawnCommitments: pos.undrawnCommitments || null,
    numeratorBasis: pos.numeratorBasis || null,
    exposureRegister: input.rows || [],
    bySector: bl ? Object.entries(bl.bySector || {}).map(([sector, g]) => ({
      sector, exposures: g.exposures, outstanding: g.outstanding,
      headline: g.lines && g.lines.scope1And2 && num(g.lines.scope1And2.value) ? g.lines.scope1And2.value : null,
      scope3: g.lines && g.lines.scope3 && num(g.lines.scope3.value) ? g.lines.scope3.value : null,
      dataQuality: g.dataQuality && g.dataQuality.scope1And2 ? g.dataQuality.scope1And2.score : null,
    })).sort((a, b) => (b.headline || 0) - (a.headline || 0)) : [],
    bySovereign: sv ? sv.bySovereign : [],
    releases,
    band: input.band || null,
    recalculation: recalculationOf(input.recalculation),

    assurance,
    assuranceDetail: assuranceDetailOf(input.assuranceDeclaration),
    conformanceStatement: conformanceStatement(recorded),
    coverageStatement: num(pos.coverage.sharePct)
      ? `Coverage is the assessed outstanding amount of the classes in the book’s currency over the reporting entity’s total loans and investments for the year, ${pos.coverage.sharePct.toFixed(2)}% (DCL p.124).`
      : 'Coverage cannot be stated as a percentage: ' + (pos.coverage.remedy || 'the book total or a class in its currency is missing.'),
    KYOTO_GASES,
  };
  /* Built after the position facts and before the gaps and the regulatory
     mapping, because both read it: what the entity has stated decides what is
     outstanding, and one fact read once cannot make the two disagree. */
  f.s2 = s2Facts(f, input.recalculation || {}, pos.climateExposure);
  f.scopeStatement = scopeStatement(f.s2.inventoryStated);
  f.gaps = gapsOf(f);
  f.regulatoryMapping = regulatoryMappingOf(f);
  f.identity = identityOf(f, 'PA');
  f.reportId = f.reportId || f.identity.reference;
  return f;
}

module.exports = { disclosureFacts, STANDARD, ENTITY_LABEL };
