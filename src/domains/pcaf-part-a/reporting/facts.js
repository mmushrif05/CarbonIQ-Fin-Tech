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
 */

'use strict';

const { faceStatement, resolve: resolveAssuranceMode } = require('../../../shared/assurance-mode');
const { release: factorRelease } = require('../domain/sector-factors');

const STANDARD = 'PCAF (2025). The Global GHG Accounting and Reporting Standard '
  + 'Part A: Financed Emissions. Third Edition, §5.2 and Chapter 6.';

const ASSET_CLASS_LABEL = 'Business loans and unlisted equity (§5.2)';

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

/**
 * The scope 1/2 and scope 3 lines from a roll-up total, as tonnes, with the
 * count of exposures that carried each. Scope 3 stays a separate line from
 * scope 1 and 2 — §5.2 requires it (p.56) and never sums the two.
 */
function lines(total) {
  const L = total.lines || {};
  return {
    scope1And2: tval(L.scope1And2),
    scope3: tval(L.scope3),
    scope3Counted: (L.scope3 && L.scope3.counted) || 0,
    scope3Absent: (L.scope3 && L.scope3.absent) || 0,
    removals: tval(L.removals),
    creditsGenerated: tval(L.creditsGenerated),
    creditsRetired: tval(L.creditsRetired),
  };
}

/**
 * Facts for the annual §5.2 disclosure of one reporting year.
 *
 * @param {object} input
 * @param {any} input.position    the register's reporting-year roll-up
 * @param {string|number} input.reportingYear
 * @param {string} [input.insurer]   the reporting entity's name
 * @param {string} [input.currency]
 * @param {any} [input.assurance]    the resolved assurance position
 * @param {any} [input.band]         the sector-band baseline resolution in force
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

  /* By sector, for Annex 10.2. The roll-up keys groups by sector; the
     emission-intensive sectors Chapter 6 asks to be singled out (energy,
     power, cement, steel, automotive) are named where the book holds them. */
  const bySector = Object.entries(pos.bySector || {}).map(([sector, g]) => ({
    sector,
    exposures: g.exposures,
    outstanding: g.outstanding,
    scope1And2: tval(g.lines && g.lines.scope1And2),
    scope3: tval(g.lines && g.lines.scope3),
    dataQuality: g.dataQuality && g.dataQuality.scope1And2 ? g.dataQuality.scope1And2.score : null,
  })).sort((a, b) => (b.scope1And2 || 0) - (a.scope1And2 || 0));

  const fin = pos.financialSector || null;

  return {
    kind: 'disclosure',
    standard: STANDARD,
    assetClassLabel: ASSET_CLASS_LABEL,
    title: 'PCAF Part A §5.2 — Financed emissions of business loans and unlisted equity',
    subtitle: `Reporting year ${input.reportingYear}`,
    insurer: input.insurer || 'Reporting entity not stated',
    reportingYear: input.reportingYear,
    currency,
    publishedAt: (input.meta && input.meta.publishedAt) || new Date().toISOString(),
    reportId: (input.meta && input.meta.reportId) || null,
    url: (input.meta && input.meta.url) || null,
    preparedBy: 'Prepared with CarbonIQ FinTech',

    exposures: pos.exposures,
    lines: l,
    dataQuality: {
      scope1And2: dq.scope1And2 ? dq.scope1And2.score : null,
      scope3: dq.scope3 ? dq.scope3.score : null,
      excludedScope1And2: dq.scope1And2 ? dq.scope1And2.excluded : 0,
      excludedScope3: dq.scope3 ? dq.scope3.excluded : 0,
      note: dq.note || '',
    },
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
    improvementPlan: pos.improvementPlan || null,
    separation: total.separation || pos.separation || null,
    withoutAttributionFactor: total.withoutAttributionFactor || 0,

    factorSet: factorRelease(),
    band: input.band || null,

    assurance,
    /* The endorsement scanner reads these strings; they are the only free
       prose the document carries beyond the standard's own wording. */
    conformanceStatement: conformanceStatement(),
    coverageStatement: coverageStatement(coverage),
    scopeStatement: SCOPE_STATEMENT,
    KYOTO_GASES,
  };
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

/**
 * Facts for a single-exposure report — one borrower.
 *
 * @param {object} input
 * @param {any} input.result   an assessBusinessLoan() result
 * @param {any} [input.assurance]
 * @param {any} [input.band]
 * @param {string} [input.insurer]
 * @param {object} [input.meta]
 */
function exposureFacts(input) {
  const r = input.result;
  const inv = r.inventory || {};
  const cp = (r.exposure && r.exposure.counterparty) || {};
  const currency = (r.exposure && r.exposure.outstanding && r.exposure.outstanding.unit) || 'LKR';
  const assurance = input.assurance || DEFAULT_ASSURANCE;

  return {
    kind: 'exposure',
    standard: STANDARD,
    assetClassLabel: ASSET_CLASS_LABEL,
    title: `PCAF Part A §5.2 — ${cp.name || 'Borrower'}`,
    subtitle: `Financed emissions of one business loan or unlisted equity holding`,
    insurer: input.insurer || 'Reporting entity not stated',
    reportingYear: r.exposure && r.exposure.reportingYear,
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
      scope1And2: tval(inv.scope1And2),
      scope3: inv.scope3 && !inv.scope3.absent ? tval(inv.scope3) : null,
      scope3Reason: inv.scope3 && inv.scope3.absent ? inv.scope3.reason : null,
      removals: tval(inv.removals),
      creditsGenerated: tval(inv.creditsGenerated),
      creditsRetired: tval(inv.creditsRetired),
    },
    dataQuality: inv.dataQuality || {},
    economicIntensity: inv.economicIntensity_tCO2e_per_M,
    findings: (r.validation && r.validation.findings) || [],
    validationNote: (r.validation && r.validation.note) || '',
    factorRelease: r.factorRelease || null,
    factorSet: factorRelease(),
    band: input.band || null,

    assurance,
    conformanceStatement: conformanceStatement(),
    coverageStatement: 'This report describes one exposure. A hundred per cent of a '
      + 'one-exposure inventory is not a claim about the reporting entity’s book, and '
      + 'coverage of the book is stated only in the annual disclosure.',
    scopeStatement: SCOPE_STATEMENT,
    KYOTO_GASES,
  };
}

module.exports = { disclosureFacts, exposureFacts, STANDARD, KYOTO_GASES, ASSET_CLASS_LABEL };
