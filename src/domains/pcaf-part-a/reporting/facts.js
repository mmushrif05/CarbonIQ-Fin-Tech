// @ts-check
/**
 * The facts a PCAF Part A §5.2 disclosure is built from — one reporting year
 * of the exposure register, and, for the per-exposure report, one exposure.
 *
 * Nothing here computes an emission. Every figure arrives from the register's
 * roll-up (which itself reads the engine's stored results) or from an engine
 * result handed in; this module arranges them in the order Chapter 6 reads and
 * says where each came from. The checklist is answered from the same facts, so
 * it cannot say Yes to something the document does not contain.
 *
 * One rule shapes the whole document. This report covers the **§5.2 asset
 * class** — business loans and unlisted equity — which is one input to a
 * bank's Chapter 6 financed-emissions disclosure, not the disclosure. The
 * entity's own gross scope 1/2/3 inventory (SLFRS S2 §29(a)) is a different,
 * larger claim, and this document says so on its face rather than letting a
 * reader take one asset class for the whole book.
 *
 * What a verifier reads first is also here: the reporting entity and its
 * boundary (from the entity's own settings, never defaulted), the responsible
 * party, the document's identity, the uncertainty by score, the list of what
 * the document does not contain, and one row per exposure so every total can
 * be followed back to the register.
 */

'use strict';

const { faceStatement, resolve: resolveAssuranceMode } = require('../../../shared/assurance-mode');
const { release: factorRelease, table: factorTable } = require('../domain/sector-factors');
const { entityOf } = require('./entity');
const { identityOf } = require('./identity');

const STANDARD = 'PCAF (2025). The Global GHG Accounting and Reporting Standard '
  + 'Part A: Financed Emissions. Third Edition, §5.2 and Chapter 6.';

const ASSET_CLASS_LABEL = 'Business loans and unlisted equity (§5.2)';
const ENTITY_LABEL = 'Reporting entity';

/* The seven Kyoto gases, named individually because Chapter 6 asks for the
   seven and not for "greenhouse gases", and where each can arise for a
   lending book. */
const KYOTO_GASES = [
  { gas: 'Carbon dioxide', formula: 'CO2', arises: 'The dominant gas in every borrower inventory: fuel combustion, process emissions and purchased electricity.' },
  { gas: 'Methane', formula: 'CH4', arises: 'Fossil-fuel supply chains, agriculture and waste in the borrowers financed.' },
  { gas: 'Nitrous oxide', formula: 'N2O', arises: 'Combustion and, for agricultural borrowers, fertiliser use.' },
  { gas: 'Hydrofluorocarbons', formula: 'HFCs', arises: 'Refrigeration and cooling in a borrower’s operations.' },
  { gas: 'Perfluorocarbons', formula: 'PFCs', arises: 'Aluminium smelting and some electronics manufacture.' },
  { gas: 'Sulphur hexafluoride', formula: 'SF6', arises: 'Electrical switchgear at industrial and utility borrowers.' },
  { gas: 'Nitrogen trifluoride', formula: 'NF3', arises: 'Electronics manufacture; accounted for where a borrower reports it.' }
];

/* A document built without an assurance position falls back to the honest
   default rather than to silence — absent the check, nothing has been
   checked, and printing nothing reads as the stronger claim. */
const DEFAULT_ASSURANCE = (() => {
  const r = resolveAssuranceMode({});
  return { ...r, statement: faceStatement(r) };
})();

const tval = line => (line && Number.isFinite(line.value) ? line.value : null);
const num = v => typeof v === 'number' && Number.isFinite(v);

/* Instruments whose year-end balance can differ from what the bank financed
   over the year — the footnote 71 fluctuation question. */
const REVOLVING = new Set(['overdraft', 'revolving-credit', 'revolving', 'credit-line', 'line-of-credit']);

/**
 * The entity's recalculation protocol, normalised for the section that prints
 * it. A missing settings object is not an error — it means the entity has not
 * stated a base year, which the report says rather than implying the current
 * year.
 */
function recalculationOf(r) {
  const s = r || {};
  return {
    baseYear: (s.baseYear === null || s.baseYear === undefined) ? null : s.baseYear,
    significanceThresholdPct: Number.isFinite(Number(s.significanceThresholdPct)) ? Number(s.significanceThresholdPct) : null,
    triggers: Array.isArray(s.recalculationTriggers) ? s.recalculationTriggers : [],
    policy: s.recalculationPolicy || '',
  };
}

/**
 * The reporting lines from a roll-up total, as tonnes, with the count of
 * exposures that carried each. Scope 1 and scope 2 are carried apart as well
 * as combined — SLFRS S2 asks for them apart — and scope 3 stays a separate
 * line that §5.2 never sums with them (p.56).
 */
function lines(total) {
  const L = total.lines || {};
  const counted = k => (L[k] && L[k].counted) || 0;
  const absent = k => (L[k] && L[k].absent) || 0;
  return {
    scope1: tval(L.scope1), scope1Counted: counted('scope1'),
    scope2: tval(L.scope2), scope2Counted: counted('scope2'),
    scope1And2: tval(L.scope1And2),
    scope3: tval(L.scope3), scope3Counted: counted('scope3'), scope3Absent: absent('scope3'),
    removals: tval(L.removals),
    creditsGenerated: tval(L.creditsGenerated),
    creditsRetired: tval(L.creditsRetired),
  };
}

/** The independent assurance the entity has recorded for financed emissions, in words, or null. */
function assuranceDetailOf(declaration) {
  const d = declaration && declaration.scopes && declaration.scopes.financed;
  return d && d.status === 'assured' ? `${d.label}: ${d.detail}` : null;
}

/** One row per exposure, from the projected rows the roll-up read. */
function registerRows(rows) {
  return (rows || []).map(r => {
    const ex = r.exposure || {};
    const cp = ex.counterparty || {};
    const inv = r.inventory || {};
    const dq = inv.dataQuality || {};
    const s12 = dq.scope1And2 || {};
    return {
      exposureId: (ex.identifiers && ex.identifiers.id) || null,
      counterparty: cp.name || null,
      sector: cp.sector || cp.naceL2 || null,
      instrument: ex.instrument || ex.kind || null,
      outstanding: ex.outstanding && num(ex.outstanding.value) ? ex.outstanding.value : null,
      attributionFactor: r.attribution && num(r.attribution.value) ? r.attribution.value : null,
      option: s12.option || null,
      score: num(s12.score) ? s12.score : null,
      scope1And2: tval(inv.scope1And2),
      scope3: inv.scope3 && !inv.scope3.absent ? tval(inv.scope3) : null,
      verdict: (r.validation && r.validation.verdict) || 'clean',
      findings: (r.validation && r.validation.findings && r.validation.findings.length) || 0,
    };
  });
}

/** The factor set as released — every row, so a tonne can be tied to a value. */
function factorRows() {
  const t = factorTable();
  const rows = (t && t.rows) || {};
  const provisional = new Set(t && t.provisionalRows ? t.provisionalRows : []);
  return Object.entries(rows).map(([sector, r]) => ({
    sector,
    scope1PerRevenue: r.scope1PerRevenue, scope2PerRevenue: r.scope2PerRevenue, scope3PerRevenue: r.scope3PerRevenue,
    assetTurnover: r.assetTurnover,
    provisional: provisional.has(sector) || Boolean(r.gap),
  }));
}

/** The footnote 71 question, answered from the book rather than asserted. */
function fluctuationOf(rows, plan) {
  const revolving = (rows || []).filter(r => REVOLVING.has(String((r.exposure || {}).instrument || '').toLowerCase()));
  const fn71 = ((plan && plan.byRemedy) || []).filter(x => String(x.code || '').startsWith('FN71'));
  return {
    revolvingExposures: revolving.length,
    revolvingOutstanding: +revolving.reduce((s, r) => s + ((r.exposure.outstanding && r.exposure.outstanding.value) || 0), 0).toFixed(2),
    flaggedExposures: fn71.reduce((s, x) => s + (x.exposures || 0), 0),
    findings: fn71.map(x => ({ code: x.code, exposures: x.exposures, remedy: x.remedy })),
    basis: 'Only the year-end balance enters the attribution (§5.2 fn 71). Each revolving facility is '
      + 'checked against its own annual average balance where the bank holds one; a year-end balance '
      + 'below the average is reported as a finding, and a facility with no average held is reported '
      + 'as unchecked rather than passed.',
  };
}

/** Where each regulatory line comes from, with a status answered from the facts. */
function regulatoryMappingOf(f) {
  const yes = 'Yes', no = 'No', elsewhere = 'Elsewhere';
  return [
    { requirement: 'Absolute gross financed emissions — scope 1, 2 and 3 — disaggregated by industry', clause: 'SLFRS S2 §29(a)(vi); B61(a)', status: f.bySector && f.bySector.length ? yes : no, where: 'Section 4; Annex B (Annex 10.2 by sector)' },
    { requirement: 'Gross exposure (outstanding) by industry', clause: 'SLFRS S2 B61(b)', status: f.bySector && f.bySector.length ? yes : no, where: 'Annex B' },
    { requirement: 'Percentage of gross exposure included in the financed-emissions calculation', clause: 'SLFRS S2 B61(c); DCL p.124', status: num(f.coverage && f.coverage.share) ? yes : no, where: 'Section 2 — coverage of the book' },
    { requirement: 'Methodology, inputs and assumptions, including the standard applied', clause: 'SLFRS S2 B61(d); §29(a)(iv)', status: yes, where: 'Section 5; Annex A' },
    { requirement: 'Economic emission intensity', clause: 'SLFRS S2 §29(b); DCL p.127', status: num(f.intensity && f.intensity.value) ? yes : no, where: 'Section 8' },
    { requirement: 'Data-quality approach and score', clause: 'PCAF Box 6.1-6; SLFRS S2 B63', status: num(f.dataQuality && f.dataQuality.scope1And2) ? yes : no, where: 'Section 6' },
    { requirement: 'The reporting entity’s own gross scope 1, 2 and 3 inventory', clause: 'SLFRS S2 §29(a)(i)–(iii)', status: no, where: 'Not this document: the entity’s inventory is a separate claim this asset class is one input to' },
    { requirement: 'Sustainable-finance classification of the lending book under the SLGFT', clause: 'CBSL Direction No. 05 of 2022', status: elsewhere, where: 'The taxonomy screen and the Green Loan Certificate, not a financed-emissions document' },
  ];
}

/** What the document does not contain, collected in one list. */
function gapsOf(f) {
  const e = f.entity || {};
  const out = [...(e.gaps || []).map(g => ({ what: g.what, why: 'Not stated by the reporting entity.', clause: g.clause }))];
  if (f.kind === 'disclosure') {
    if (!num(f.coverage.share)) out.push({ what: 'Coverage as a percentage of total loans and investments', why: 'The entity has not stated its total loans and investments for the year.', clause: 'DCL p.124' });
    if (f.lines.scope3Absent > 0) out.push({ what: `Financed scope 3 for ${f.lines.scope3Absent} exposure(s)`, why: 'Not held; each exposure records its reason and the finding travels into the plan.', clause: 'Part A §5.2 (p.56)' });
    if (!e.assetClassesNotReported || !e.assetClassesNotReported.length) out.push({ what: 'The asset classes not reported, with reasons', why: 'Not stated by the reporting entity.', clause: 'Part A ch.6 (p.162)' });
    out.push({ what: 'Prior-year comparatives and restatements', why: 'The register holds no locked prior position yet; nothing can be restated until the lock-and-supersede lifecycle exists.', clause: 'Part A ch.6 (p.164)' });
  }
  if (!f.recalculation.baseYear) out.push({ what: 'The inventory base year', why: 'Not stated by the reporting entity.', clause: 'Part A ch.6 (p.164)' });
  if (f.factorSet && f.factorSet.provisionalTables && f.factorSet.provisionalTables.length) {
    out.push({ what: 'A released regional sector factor set', why: `The set in use is provisional (${f.factorSet.provisionalTables.join(', ')}); every provisional row carries the gap it stands in for.`, clause: 'Part A Box 6.1-5 (p.167)' });
  }
  if (f.band && f.band.provisional) out.push({ what: 'A released sector intensity band baseline', why: 'The plausibility check read an illustrative set.', clause: 'CarbonIQ baseline governance' });
  out.push({ what: 'The reporting entity’s own gross scope 1, 2 and 3 inventory', why: 'This document is one asset class of a wider disclosure and never claims to be the inventory.', clause: 'SLFRS S2 §29(a); Part A ch.6 (p.160)' });
  return out;
}

const SCOPE_STATEMENT =
  'This report covers one PCAF asset class — business loans and unlisted equity '
  + '(Part A §5.2). It is one input to a Chapter 6 financed-emissions disclosure, not '
  + 'the disclosure: the reporting entity’s own gross scope 1, 2 and 3 inventory is a '
  + 'separate and larger claim, made where the entity states it.';

function conformanceStatement() {
  return 'The method in this report conforms to PCAF’s Global GHG Accounting and '
    + 'Reporting Standard Part A (Third Edition, December 2025), §5.2 and Chapter 6. '
    + 'PCAF sets the method; it does not approve, endorse or certify this report or the '
    + 'figures in it. The sector additions of the Third Edition have not been reviewed by '
    + 'the GHG Protocol, and this asset class — business loans and unlisted equity — '
    + 'carries the GHG Protocol’s "Built on" mark.';
}

function coverageStatement(coverage) {
  if (coverage.share === null || coverage.share === undefined) {
    return 'Coverage cannot be stated as a percentage until the reporting entity states '
      + 'its total loans and investments for the year. It is reported absent rather than '
      + 'assumed, because a coverage figure is meaningful only against the whole book '
      + '(PCAF Disclosure Checklist Part A, p.124).';
  }
  return `Coverage is the assessed outstanding amount over the reporting entity’s total `
    + `loans and investments for the year, ${(coverage.share * 100).toFixed(2)}%. A total drawn `
    + `from part of the book means something different from one drawn from all of it, so the `
    + `percentage is stated beside every figure it qualifies (p.124).`;
}

/** The common tail every §5.2 document shares: the entity, the identity, the gaps. */
function finish(f, prefix) {
  f.gaps = gapsOf(f);
  if (f.kind === 'disclosure') f.regulatoryMapping = regulatoryMappingOf(f);
  f.identity = identityOf(f, prefix);
  f.reportId = f.reportId || f.identity.reference;
  return f;
}

/**
 * Facts for the annual §5.2 disclosure of one reporting year.
 *
 * @param {object} input
 * @param {any} input.position    the register's reporting-year roll-up
 * @param {string|number} input.reportingYear
 * @param {string} [input.insurer]   a name supplied on the request, honoured where the entity has stated none
 * @param {string} [input.currency]
 * @param {any} [input.assurance]    the resolved assurance position
 * @param {any} [input.assuranceDeclaration] the entity's recorded assurance declaration
 * @param {any} [input.band]         the sector-band baseline resolution in force
 * @param {any} [input.recalculation] the entity's settings (recalculation protocol and entity facts)
 * @param {any[]} [input.rows]       the projected exposure rows the roll-up read
 * @param {object} [input.meta]      publishedAt, reportId, url
 */
function disclosureFacts(input) {
  const pos = input.position;
  const total = pos.total || {};
  const assurance = input.assurance || DEFAULT_ASSURANCE;
  const currency = input.currency || 'LKR';
  const l = lines(total);
  const dq = total.dataQuality || {};
  const coverage = pos.coverage || {};
  const plan = pos.improvementPlan || null;
  const entity = entityOf(input.recalculation, input.reportingYear, input.insurer);

  /* By sector, for Annex 10.2. The roll-up keys groups by sector; the
     emission-intensive sectors Chapter 6 asks to be singled out (energy,
     power, cement, steel, automotive) are named where the book holds them. */
  const bySector = Object.entries(pos.bySector || {}).map(([sector, g]) => ({
    sector,
    exposures: g.exposures,
    outstanding: g.outstanding,
    scope1And2: tval(g.lines && g.lines.scope1And2),
    scope3: tval(g.lines && g.lines.scope3),
    intensity: num(g.economicIntensity_tCO2e_per_M) ? g.economicIntensity_tCO2e_per_M : null,
    dataQuality: g.dataQuality && g.dataQuality.scope1And2 ? g.dataQuality.scope1And2.score : null,
  })).sort((a, b) => (b.scope1And2 || 0) - (a.scope1And2 || 0));

  const fin = pos.financialSector || null;

  const f = {
    kind: 'disclosure',
    standard: STANDARD,
    assetClassLabel: ASSET_CLASS_LABEL,
    entityLabel: ENTITY_LABEL,
    title: 'PCAF Part A §5.2 — Financed emissions of business loans and unlisted equity',
    subtitle: `Reporting year ${input.reportingYear}`,
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
    lines: l,
    intensity: {
      value: num(total.economicIntensity_tCO2e_per_M) ? total.economicIntensity_tCO2e_per_M : null,
      unit: `tCO2e per million ${currency}`,
      basis: 'Financed scope 1 and 2 across the class over the assessed outstanding amount, in millions (DCL p.127).',
    },
    dataQuality: {
      scope1And2: dq.scope1And2 ? dq.scope1And2.score : null,
      scope3: dq.scope3 ? dq.scope3.score : null,
      excludedScope1And2: dq.scope1And2 ? dq.scope1And2.excluded : 0,
      excludedScope3: dq.scope3 ? dq.scope3.excluded : 0,
      note: dq.note || '',
    },
    optionDistribution: (plan && plan.byOption) || [],
    improvementSteps: (plan && plan.steps) || [],
    improvementTargetNote: (plan && plan.targetNote) || '',
    scenarioNote: (plan && plan.scenarioNote) || '',
    coverage: {
      share: coverage.share,
      totalLoansAndInvestments: coverage.totalLoansAndInvestments,
      assessedOutstanding: total.outstanding,
      statedBy: coverage.statedBy || null,
      basis: coverage.basis,
      reference: coverage.reference,
      remedy: coverage.remedy || null,
    },
    bySector,
    financialSector: fin ? {
      exposures: fin.exposures,
      scope1And2: tval(fin.lines && fin.lines.scope1And2),
      scope3: tval(fin.lines && fin.lines.scope3),
      note: fin.note || '',
    } : null,
    improvementPlan: plan,
    fluctuation: fluctuationOf(input.rows, plan),
    /* §6.2, summed apart by the position; and how the numerators were read. */
    undrawnCommitments: pos.undrawnCommitments || null,
    numeratorBasis: pos.numeratorBasis || null,
    exposureRegister: registerRows(input.rows),
    separation: total.separation || pos.separation || null,
    withoutAttributionFactor: total.withoutAttributionFactor || 0,

    factorSet: factorRelease(),
    factorRows: factorRows(),
    band: input.band || null,
    recalculation: recalculationOf(input.recalculation),

    assurance,
    assuranceDetail: assuranceDetailOf(input.assuranceDeclaration),
    /* The endorsement scanner reads these strings; they are the only free
       prose the document carries beyond the standard's own wording. */
    conformanceStatement: conformanceStatement(),
    coverageStatement: coverageStatement(coverage),
    scopeStatement: SCOPE_STATEMENT,
    KYOTO_GASES,
  };
  return finish(f, 'PA52');
}

/**
 * Facts for a single-exposure report — one borrower.
 *
 * @param {object} input
 * @param {any} input.result   an assessBusinessLoan() result
 * @param {any} [input.assurance]
 * @param {any} [input.assuranceDeclaration]
 * @param {any} [input.band]
 * @param {any} [input.recalculation] the entity's settings — the same protocol the annual disclosure prints
 * @param {string} [input.insurer]
 * @param {object} [input.meta]
 */
function exposureFacts(input) {
  const r = input.result;
  const inv = r.inventory || {};
  const cp = (r.exposure && r.exposure.counterparty) || {};
  const currency = (r.exposure && r.exposure.outstanding && r.exposure.outstanding.unit) || 'LKR';
  const assurance = input.assurance || DEFAULT_ASSURANCE;
  const reportingYear = r.exposure && r.exposure.reportingYear;
  const entity = entityOf(input.recalculation, reportingYear, input.insurer);

  const f = {
    kind: 'exposure',
    standard: STANDARD,
    assetClassLabel: ASSET_CLASS_LABEL,
    entityLabel: ENTITY_LABEL,
    title: `PCAF Part A §5.2 — ${cp.name || 'Borrower'}`,
    subtitle: `Financed emissions of one business loan or unlisted equity holding`,
    insurer: entity.name || 'Reporting entity not stated',
    entity,
    responsibleParty: entity.responsibleParty,
    reportingYear,
    currency,
    publishedAt: (input.meta && input.meta.publishedAt) || new Date().toISOString(),
    reportId: (input.meta && input.meta.reportId) || null,
    url: (input.meta && input.meta.url) || null,
    preparedBy: 'Prepared with CarbonIQ FinTech',

    counterparty: cp,
    exposure: r.exposure,
    denominator: r.denominator,
    attribution: r.attribution,
    inventory: inv,
    lines: {
      scope1: tval(inv.scope1), scope2: tval(inv.scope2),
      scope1And2: tval(inv.scope1And2),
      scope3: inv.scope3 && !inv.scope3.absent ? tval(inv.scope3) : null,
      scope3Reason: inv.scope3 && inv.scope3.absent ? inv.scope3.reason : null,
      removals: tval(inv.removals),
      creditsGenerated: tval(inv.creditsGenerated),
      creditsRetired: tval(inv.creditsRetired),
    },
    dataQuality: inv.dataQuality || {},
    optionDistribution: inv.dataQuality && inv.dataQuality.scope1And2 && num(inv.dataQuality.scope1And2.score)
      ? [{ option: inv.dataQuality.scope1And2.option, score: inv.dataQuality.scope1And2.score, exposures: 1, shareOfBook: 1 }] : [],
    economicIntensity: inv.economicIntensity_tCO2e_per_M,
    findings: (r.validation && r.validation.findings) || [],
    validationNote: (r.validation && r.validation.note) || '',
    /* The facility as the engine read it: terms, scheduled balance, §6.2, projection. */
    facility: r.facility || null,
    factorRelease: r.factorRelease || null,
    factorSet: factorRelease(),
    factorRows: factorRows(),
    band: input.band || null,
    recalculation: recalculationOf(input.recalculation),

    assurance,
    assuranceDetail: assuranceDetailOf(input.assuranceDeclaration),
    conformanceStatement: conformanceStatement(),
    coverageStatement: 'This report describes one exposure. A hundred per cent of a '
      + 'one-exposure inventory is not a claim about the reporting entity’s book, and '
      + 'coverage of the book is stated only in the annual disclosure.',
    scopeStatement: SCOPE_STATEMENT,
    KYOTO_GASES,
  };
  return finish(f, 'PA52X');
}

module.exports = {
  disclosureFacts, exposureFacts, STANDARD, KYOTO_GASES, ASSET_CLASS_LABEL, ENTITY_LABEL,
  registerRows, factorRows, assuranceDetailOf, recalculationOf,
};
