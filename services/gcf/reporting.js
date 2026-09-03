/**
 * CarbonIQ FinTech — the GCF pipeline as a statutory disclosure
 *
 * Lot 1 Milestone 4's other half. The ToR's stated gap is a lack of systems
 * and procedures to capture data for sustainability reporting; this turns the
 * captured data into the disclosure lines SLFRS S1/S2 and GRI actually ask
 * for — from the same records, so nothing is re-keyed and no two documents can
 * disagree.
 *
 * ── The one thing this must not do ─────────────────────────────────────────
 *
 * A pipeline of financed projects avoiding 65,800 tCO2e a year is a real and
 * material fact. It is not the bank's greenhouse gas inventory, and it cannot
 * fill an inventory line:
 *
 *   SLFRS S2 §29(a) asks for the entity's own absolute gross scope 1, 2 and 3
 *   emissions. Project mitigation is none of those. Putting it there would
 *   report an emission the bank does not have, in place of one it does.
 *
 *   GRI 305-5 is reduction of the organisation's own emissions from its own
 *   initiatives. A financed project's avoided emissions are not the bank's
 *   reduction, and GRI is explicit that avoided emissions are reported apart
 *   from the inventory and never deducted from it — the same rule PCAF applies
 *   (Part A, p.126) and the same rule the anchor dashboard's curve obeys.
 *
 * So the inventory lines are reported ABSENT, with the clause that requires
 * them and where the figure actually comes from, and the pipeline is disclosed
 * where it genuinely belongs: climate-related opportunities (S2 §29(d)),
 * capital deployment (S2 §29(e)) and a separately-stated avoided-and-reduced
 * line that is never netted against anything.
 *
 * That is the whole discipline of services/report-integrity.js applied to a new
 * standard: measured, declared, or absent — and never filled in. The portfolio
 * reports in this codebase once printed an invented scope split under a cited
 * clause of GRI 305 and IFRS S2. The reader here is the CSE, the CBSL and an
 * assurance provider.
 */

'use strict';

const crypto = require('crypto');

const integrity = require('../report-integrity');
const emissions = require('./emissions');
const ndc = require('./ndc-contribution');
const record = require('./record');

const STANDARDS = Object.freeze({
  slfrs: {
    name: 'SLFRS S1 and SLFRS S2',
    body: 'CA Sri Lanka — the ISSB standards as adopted in Sri Lanka',
    effective: '1 January 2025',
    scope: 'The first 100 Colombo Stock Exchange main-board entities by market capitalisation '
      + 'from 2025, all main-board entities from 2026.',
  },
  gri: {
    name: 'GRI 305: Emissions 2016',
    body: 'Global Reporting Initiative',
  },
});

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);

/**
 * The disclosure.
 *
 * @param {Array}  projects            the pipeline records
 * @param {Object} [opts.entityDisclosures]  facts only the bank can state
 * @param {number} [opts.reportingYear]
 */
function buildDisclosure(projects = [], opts = {}) {
  const {
    entityDisclosures = null,
    reportingYear = new Date().getUTCFullYear(),
    sample = false,
    sampleNote = null,
  } = opts;

  const roll = emissions.portfolioEmissions(projects);
  const contribution = ndc.portfolioContribution(projects, opts);

  const totalCost = projects.reduce((a, p) => a + (p.financing?.totalCost || 0), 0);
  const gcfAsk = projects.reduce((a, p) => a + (p.financing?.gcfAsk || 0), 0);
  const dfcc = projects.reduce((a, p) => a + (p.financing?.dfcc || 0), 0);
  const aligned = projects.filter(p => ['green', 'transition'].includes(p.taxonomy?.band));
  const alignedCost = aligned.reduce((a, p) => a + (p.financing?.totalCost || 0), 0);

  const d = integrity.declared;

  const report = {
    basis: {
      standards: STANDARDS,
      reportingYear,
      preparedFrom: 'The GCF candidate pipeline held in this system. Every figure carries an '
        + 'evidence tier and traces to a project record.',
      /* Said on the face of the report rather than left to be inferred. A
         reader who assumes this covers SLFRS S2 §29 in full would be wrong in
         the one way that matters most. */
      covers: 'The climate-related opportunity, capital deployment and financed-project mitigation '
        + 'disclosures arising from this pipeline. It is NOT a complete SLFRS S2 disclosure: the '
        + "entity's own scope 1, 2 and 3 inventory is not held here and is reported absent below, "
        + 'with where it comes from. This report is one input to the entity\'s disclosure, not the '
        + 'disclosure itself.',
      entity: d(entityDisclosures, 'entityName',
        'The name of the reporting entity', 'SLFRS S1 §B38'),
      sample,
      sampleNote: sample ? sampleNote : null,
    },

    /* S1 §27 and S2 §6 are entity facts. Software cannot compute who sits on a
       board committee, and inventing it is how the previous portfolio report
       came to describe a three-person ESG team that did not exist. */
    governance: {
      standardRef: 'SLFRS S1 §27; SLFRS S2 §6',
      oversight: d(entityDisclosures, 'climateGovernance',
        'How the board oversees climate-related risks and opportunities', 'SLFRS S2 §6(a)'),
      managementRole: d(entityDisclosures, 'managementRole',
        "Management's role in assessing and managing climate-related risks and opportunities",
        'SLFRS S2 §6(b)'),
    },

    strategy: {
      standardRef: 'SLFRS S2 §§9-12',
      opportunitiesIdentified: d(entityDisclosures, 'strategyNarrative',
        'The climate-related opportunities the entity has identified and how it is responding',
        'SLFRS S2 §9'),
      /* Measured: the pipeline itself is evidence of the strategy. */
      pipeline: {
        projects: projects.length,
        byStream: {
          mitigation: projects.filter(p => p.stream === 'mitigation').length,
          adaptation: projects.filter(p => p.stream === 'adaptation').length,
        },
        byStage: projects.reduce((a, p) => ({ ...a, [p.stage]: (a[p.stage] || 0) + 1 }), {}),
        accreditedEntity: 'DFCC Bank PLC, GCF Direct Access Entity',
      },
    },

    riskManagement: {
      standardRef: 'SLFRS S2 §§24-26',
      process: d(entityDisclosures, 'riskManagementProcess',
        'The processes used to identify, assess, prioritise and monitor climate-related risks',
        'SLFRS S2 §25'),
      /* Measured: the environmental and social gate this pipeline actually
         applies, which is a risk process and can be evidenced. */
      essScreening: {
        framework: 'IFC Performance Standards 1-8, applied on a scaled risk basis as GCF\'s interim '
          + 'environmental and social safeguards.',
        accreditationCeiling: 'B / I-2',
        byCategory: projects.reduce((a, p) => ({ ...a, [p.essCategory]: (a[p.essCategory] || 0) + 1 }), {}),
        outsideAccreditation: projects
          .filter(p => !record.ESS_WITHIN_DFCC_ACCREDITATION.includes(p.essCategory))
          .map(p => p.code),
        flagged: projects.filter(p => (p.essFlags || []).length)
          .map(p => ({ code: p.code, flags: p.essFlags })),
      },
    },

    metricsAndTargets: {
      standardRef: 'SLFRS S2 §29',

      /* The line this module exists to refuse. */
      inventory: {
        standardRef: 'SLFRS S2 §29(a)',
        scope1: integrity.notMeasured('Absolute gross scope 1 emissions',
          'This is the entity\'s own inventory. It is not derivable from a pipeline of candidate '
          + 'projects and is not held here.'),
        scope2: integrity.notMeasured('Absolute gross scope 2 emissions',
          'As above — an entity-level inventory line.'),
        scope3: integrity.notMeasured('Absolute gross scope 3 emissions, including Category 15',
          'Financed emissions are scope 3 Category 15 in full and are reported from the capital '
          + 'book on PCAF Part A attribution, not from this pipeline.'),
        note: 'Project mitigation is not an inventory figure and is not reported here. Placing it '
          + 'in an inventory line would report an emission the entity does not have in place of '
          + 'one it does.',
      },

      /* Where the pipeline genuinely belongs. */
      climateOpportunities: {
        standardRef: 'SLFRS S2 §29(d) — assets or business activities aligned with climate-related opportunities',
        alignedProjects: aligned.length,
        alignedAmount: alignedCost,
        alignedPctOfPipeline: pct(alignedCost, totalCost),
        framework: 'Sri Lanka Green Finance Taxonomy (SLGFT v2024)',
        byBand: projects.reduce((a, p) => ({ ...a, [p.taxonomy.band]: (a[p.taxonomy.band] || 0) + 1 }), {}),
      },

      capitalDeployment: {
        standardRef: 'SLFRS S2 §29(e) — capital deployed towards climate-related risks and opportunities',
        currency: 'USD',
        pipelineTotalCost: totalCost,
        gcfAsk,
        dfccCommitment: dfcc,
        otherSources: totalCost - gcfAsk - dfcc,
        note: 'A pipeline figure. These are candidate projects, not committed facilities, and the '
          + 'stage of each is disclosed in the strategy section. Co-financing is not a GCF '
          + 'requirement — GCF sets no minimum — so the ratio is reported as a fact and not as '
          + 'a threshold met.',
      },

      /* Stated separately, never netted. */
      avoidedAndReduced: {
        standardRef: 'Reported separately from the inventory above. GRI 305 and PCAF both require '
          + 'avoided emissions to be stated apart from the scope 1/2/3 inventory and never '
          + 'deducted from it.',
        indicator: roll.headline.indicator,
        annual_tCO2e: roll.headline.annual_tCO2e,
        lifetime_tCO2e: roll.headline.lifetime_tCO2e,
        byBaselineType: roll.headline.byBaselineType,
        adaptationCoBenefit: roll.adaptationCoBenefit,
        embodiedCarbon: roll.embodiedCarbon,
        evidence: roll.evidence,
        note: 'These are the financed projects\' emissions outcomes, not the entity\'s. They are '
          + 'not added to, and not subtracted from, any inventory line.',
      },

      beneficiaries: {
        standardRef: 'GCF Integrated Results Management Framework, Adaptation Core Indicators 1 and 2',
        direct: projects.reduce((a, p) => a + (p.beneficiaries?.direct?.value || 0), 0),
        indirect: projects.reduce((a, p) => a + (p.beneficiaries?.indirect?.value || 0), 0),
        note: 'Direct and indirect are two separate core indicators measuring different things and '
          + 'are never added into one "people reached" figure.',
      },

      targets: {
        standardRef: 'SLFRS S2 §§33-37',
        entityTargets: d(entityDisclosures, 'climateTargets',
          'The climate-related targets the entity has set, and whether they are entity-set or '
          + 'required by law or regulation', 'SLFRS S2 §33'),
        nationalContext: {
          ndc: contribution.ndc,
          reduction: {
            commitment: contribution.reduction.commitment,
            pipelineCumulative_tCO2e: contribution.reduction.pipelineCumulative_tCO2e,
            share: contribution.reduction.share,
          },
          removal: {
            commitment: contribution.removal.commitment,
            pipelineCumulative_tCO2e: contribution.removal.pipelineCumulative_tCO2e,
            share: contribution.removal.share,
          },
          note: contribution.note,
        },
      },
    },

    /* Second format, same records, no re-keying. */
    gri: griMapping(roll),
  };

  report.gaps = integrity.collectGaps(report);
  report.checklist = checklist(report);
  report.complete = report.checklist.every(i => i.met);
  report.completenessNote = report.complete
    ? 'Every item this report claims is answered from the report itself.'
    : `${report.checklist.filter(i => !i.met).length} of ${report.checklist.length} items could `
      + 'not be answered from what is held. They are listed with the clause that requires them. '
      + 'This report is not complete and does not claim to be.';

  return report;
}

/**
 * GRI 305, answered honestly.
 *
 * 305-1 through 305-4 are the entity's inventory and are not in this system.
 * 305-5 is reduction of the organisation's own emissions from its own
 * initiatives — a financed project's mitigation is not that, and saying so is
 * the disclosure. The pipeline is reported as supplementary information, which
 * is where GRI puts avoided emissions from financed or sold activity.
 */
function griMapping(roll) {
  return {
    standard: STANDARDS.gri,
    '305-1': integrity.notMeasured('Direct (Scope 1) GHG emissions',
      'Entity inventory. Not derivable from a project pipeline.'),
    '305-2': integrity.notMeasured('Energy indirect (Scope 2) GHG emissions',
      'Entity inventory. Not derivable from a project pipeline.'),
    '305-3': integrity.notMeasured('Other indirect (Scope 3) GHG emissions',
      'For a lender this is dominated by Category 15 financed emissions, reported from the '
      + 'capital book on PCAF Part A attribution rather than from this pipeline.'),
    '305-4': integrity.notMeasured('GHG emissions intensity',
      'Requires the inventory above as its numerator.'),
    '305-5': integrity.notMeasured('Reduction of GHG emissions',
      'GRI 305-5 covers reductions in the organisation\'s own emissions achieved by its own '
      + 'initiatives. The mitigation below is achieved by financed third-party projects and is '
      + 'not the bank\'s own reduction, so it is reported as supplementary information rather '
      + 'than under this disclosure.'),
    supplementary: {
      title: 'Emissions avoided, reduced and removed by financed projects',
      annual_tCO2e: roll.headline.annual_tCO2e,
      lifetime_tCO2e: roll.headline.lifetime_tCO2e,
      byBaselineType: roll.headline.byBaselineType,
      note: 'Stated apart from the inventory and never deducted from it.',
    },
  };
}

/** Answered from the report, so an item can fail. */
function checklist(report) {
  const m = report.metricsAndTargets;
  return [
    integrity.checklistItem('The reporting entity is identified',
      report.basis.entity, 'SLFRS S1 §B38'),
    integrity.checklistItem('Board oversight of climate-related risks and opportunities is described',
      report.governance.oversight, 'SLFRS S2 §6(a)'),
    integrity.checklistItem("Management's role is described",
      report.governance.managementRole, 'SLFRS S2 §6(b)'),
    integrity.checklistItem('The climate-related opportunities and the response to them are described',
      report.strategy.opportunitiesIdentified, 'SLFRS S2 §9'),
    integrity.checklistItem('The risk identification and monitoring process is described',
      report.riskManagement.process, 'SLFRS S2 §25'),
    integrity.checklistItem('Absolute gross scope 1, 2 and 3 emissions are disclosed',
      m.inventory.scope1, 'SLFRS S2 §29(a)'),
    integrity.checklistItem('Assets aligned with climate-related opportunities are quantified',
      m.climateOpportunities.alignedAmount, 'SLFRS S2 §29(d)'),
    integrity.checklistItem('Capital deployed towards climate-related opportunities is quantified',
      m.capitalDeployment.pipelineTotalCost, 'SLFRS S2 §29(e)'),
    integrity.checklistItem('Emissions avoided or reduced by financed projects are stated separately',
      m.avoidedAndReduced.annual_tCO2e, 'GRI 305; PCAF Part A p.126'),
    integrity.checklistItem('Climate-related targets are disclosed',
      m.targets.entityTargets, 'SLFRS S2 §33'),
  ];
}

/* ── The period package ────────────────────────────────────────────────────
 *
 * A year's records, exported whole and re-importable. The ToR asks for data
 * that "should be stored and can be transferred and assessed": transferred is
 * the operative word, and a transfer that silently drops or reorders a record
 * is worse than no transfer at all. So the package carries a SHA-256 over its
 * own canonical form and an import verifies it before anything is written.
 */

/** Canonical JSON — keys sorted at every level, so a re-serialisation of the
 *  same content hashes the same. Without this the checksum would depend on key
 *  order, which nothing guarantees across a store round-trip. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

const PACKAGE_FORMAT = 'carboniq.gcf.period/1';

function exportPeriod(projects = [], opts = {}) {
  const {
    reportingYear = new Date().getUTCFullYear(),
    orgId = null,
    sample = false,
    sampleNote = null,
  } = opts;

  const ordered = [...projects].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const payload = {
    format: PACKAGE_FORMAT,
    reportingYear,
    orgId,
    sample,
    sampleNote: sample ? sampleNote : null,
    exportedAt: new Date().toISOString(),
    projects: ordered,
  };
  /* The timestamp is outside the hash: the same records exported twice are the
     same records, and a checksum that changed every second would be useless
     for telling whether anything actually moved. */
  const { exportedAt, ...hashed } = payload;
  return {
    ...payload,
    checksum: crypto.createHash('sha256').update(canonical(hashed)).digest('hex'),
    checksumNote: 'SHA-256 over the canonical form of this package excluding exportedAt. Two '
      + 'exports of the same records produce the same checksum.',
  };
}

/**
 * Verify and unpack. A package that fails is refused, not partially applied —
 * half an imported period is a position nobody can reconcile.
 */
function importPeriod(pkg) {
  const bad = (message, code) => {
    const err = new Error(message);
    err.statusCode = 400;
    err.code = code;
    throw err;
  };

  if (!pkg || typeof pkg !== 'object') bad('No package supplied.', 'INVALID_PACKAGE');
  if (pkg.format !== PACKAGE_FORMAT) {
    bad(`Unrecognised package format "${pkg.format}". Expected ${PACKAGE_FORMAT}.`, 'UNKNOWN_FORMAT');
  }
  if (!Array.isArray(pkg.projects)) bad('The package carries no projects array.', 'INVALID_PACKAGE');
  if (!pkg.checksum) bad('The package carries no checksum, so it cannot be verified.', 'MISSING_CHECKSUM');

  const { exportedAt, checksum, checksumNote, ...hashed } = pkg;
  const actual = crypto.createHash('sha256').update(canonical(hashed)).digest('hex');
  if (actual !== checksum) {
    bad('The package checksum does not match its contents. It has been altered or truncated in '
      + 'transfer and is refused whole rather than imported in part.', 'CHECKSUM_MISMATCH');
  }

  /* Every record still has to satisfy the schema. A package is a transfer
     format, not an exemption from the rules the records are held to. */
  const projects = pkg.projects.map((p, i) => {
    try { return record.validate(p); }
    catch (err) {
      bad(`Project ${i + 1} (${p && p.id}) in the package is invalid: ${err.message}`, 'INVALID_PACKAGE_RECORD');
      return null;
    }
  });

  return {
    reportingYear: pkg.reportingYear,
    sample: pkg.sample === true,
    projects,
    checksum,
    verified: true,
  };
}

module.exports = {
  buildDisclosure, griMapping, exportPeriod, importPeriod, canonical,
  STANDARDS, PACKAGE_FORMAT,
};
