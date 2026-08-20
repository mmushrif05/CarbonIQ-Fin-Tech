/**
 * CarbonIQ FinTech — PCAF Part C: the annual disclosure
 *
 * The document an insurer publishes for a reporting year, built from the
 * locked assessments in its own book. Where the per-assessment report
 * (partc-reports.js) explains one project, this explains a position.
 *
 * Three properties are deliberate:
 *
 *   Nothing is narrated. Every figure comes from the roll-up, which comes
 *   from locked assessments, which come from the engine. This module
 *   formats; it does not compute, and it never asks a language model for a
 *   number.
 *
 *   Coverage is on the front page, not in an annex. A total drawn from a
 *   fifth of the book means something different from one drawn from all of
 *   it, and a reader who has to hunt for that has been misled by layout.
 *
 *   Conformance, never endorsement. The statement cites the clauses met and
 *   the tests that prove each one, and the language guard blocks the
 *   document if it ever claims PCAF approval.
 *
 * Layout:
 *   1  Reported position          6  Restatements
 *   2  Scope and boundary         7  Prior year and comparability
 *   3  Coverage                   8  Method
 *   4  Data quality               9  Conformance statement
 *   5  Per-policy detail          Annex A/B/C
 */

'use strict';

const standard = require('./partc-report-standard');
const methodology = require('./partc-methodology');
const { containsForbiddenLanguage } = require('./pcaf-partc/data-quality');
const { conformanceMatrix, STANDARD } = require('./pcaf-partc/conformance');

const portfolio    = require('./partc-portfolio');
const registry     = require('./partc-registry');
const comparatives = require('./partc-comparatives');
const assessments  = require('./partc-assessments');

const DQ_LABEL = {
  1: 'Option 1a — verified primary data',
  2: 'Option 2a — primary emission factors',
  3: 'Option 2b/3a — regional averages',
  4: 'Option 3a — proxy activity data',
  5: 'Option 3b — estimated from spend or area'
};

const _pct = n => (n === null || n === undefined) ? 'n/a' : `${Number(n).toFixed(1)}%`;

// ---------------------------------------------------------------------------
// The structured disclosure
// ---------------------------------------------------------------------------

/**
 * @param {string} orgId
 * @param {number|string} reportingYear
 * @param {Object}  [opts]
 * @param {boolean} [opts.includeAuditTrail=true]  Annex C — per-assessment provenance
 */
async function buildAnnualDisclosure(orgId, reportingYear, opts = {}) {
  const year = Number(reportingYear);
  const includeAuditTrail = opts.includeAuditTrail !== false;

  const [roll, plan, gaps, comp, locked] = await Promise.all([
    portfolio.rollUp(orgId, year),
    portfolio.improvementPlan(orgId, year),
    portfolio.factorGapPriority(orgId, year),
    comparatives.compare(orgId, year),
    assessments.listAssessments(orgId, { reportingYear: year, status: assessments.STATUS.LOCKED })
  ]);

  if (roll.assessments.locked === 0) {
    const err = new Error(
      `No locked assessment exists for FY${year}, so there is nothing to disclose. ` +
      'An assessment must be locked before it can enter a disclosure.');
    err.statusCode = 409;
    err.code = 'NOTHING_TO_DISCLOSE';
    throw err;
  }

  const conformance = conformanceMatrix();

  // Data quality distributed across the book, so a reader can see whether a
  // middling weighted score is uniform or an average of very good and bad.
  const dqBands = {};
  for (const r of roll.rows) {
    const s = r.dataQualityScore;
    dqBands[s] = dqBands[s] || { score: s, label: DQ_LABEL[s] || `Score ${s}`, assessments: 0, kgCO2e: 0 };
    dqBands[s].assessments += 1;
    dqBands[s].kgCO2e += r.construction_kgCO2e;
  }
  const dqDistribution = Object.values(dqBands)
    .map(b => ({ ...b, kgCO2e: Math.round(b.kgCO2e * 100) / 100,
                 sharePct: roll.construction.total_kgCO2e > 0
                   ? Math.round((b.kgCO2e / roll.construction.total_kgCO2e) * 10000) / 100 : 0 }))
    .sort((a, b) => a.score - b.score);

  // Annex A — every material limitation the engine recorded, attributed to
  // the assessment that raised it. Aggregated so one recurring limitation
  // reads as one issue across N projects rather than N separate surprises.
  const limitationIndex = new Map();
  for (const a of locked) {
    for (const l of (a.limitations || [])) {
      const key = `${l.severity}::${l.message}`;
      if (!limitationIndex.has(key)) {
        limitationIndex.set(key, { severity: l.severity, message: l.message, projects: [] });
      }
      limitationIndex.get(key).projects.push(a.projectName);
    }
  }
  const limitations = [...limitationIndex.values()]
    .map(l => ({ ...l, occurrences: l.projects.length }))
    .sort((a, b) => (a.severity === b.severity ? b.occurrences - a.occurrences
      : a.severity === 'material' ? -1 : b.severity === 'material' ? 1 : 0));

  const disclosure = {
    type: 'pcaf-part-c-annual-disclosure',
    title: 'Insurance-Associated Emissions — Annual Disclosure',
    standard: STANDARD,
    meta: {
      insurer: roll.insurer,
      reportingYear: year,
      currency: roll.currency,
      premiumBasis: roll.premiumBasis,
      reportId: `PARTC-IAE-${year}`,
      generatedAt: roll.generatedAt
    },

    // 1 ─────────────────────────────────────────────────────────────────
    position: {
      construction: roll.construction,
      useStage: roll.useStage,
      scopeNote: roll.scopeNote
    },

    // 2 ─────────────────────────────────────────────────────────────────
    scope: {
      mandatory: 'A4 (transport to site) + A5 (construction) — the PCAF figure',
      optional: 'B1 (refrigerant) + B4 (replacement) + B7 (water) — reported separately, never summed with construction',
      excluded: 'A1–A3 embodied product emissions are outside PCAF Part C for insurance-associated emissions, and the voluntary whole-life annex (B2/B5/B8) is excluded from this disclosure entirely.',
      policyGate: 'Construction-only cover (CAR/EAR) carries no use stage: B1, B4 and B7 are zero by scope rule, not by omission. Cover extending into occupation (IDI/Property) runs the use stage over the cover period.'
    },

    // 3 ─────────────────────────────────────────────────────────────────
    coverage: {
      ...roll.coverage,
      statement: `${roll.coverage.assessedPolicies} of ${roll.coverage.policiesInYear} policies in force for FY${year} carry a locked assessment (${roll.coverage.coveragePct}%). The figures above cover those policies only.`
    },

    // 4 ─────────────────────────────────────────────────────────────────
    dataQuality: {
      ...roll.dataQuality,
      distribution: dqDistribution,
      improvement: {
        achievable: plan.achievable,
        note: plan.achievableNote,
        actions: plan.items.slice(0, 5).map(i => ({
          rank: i.rank, projectName: i.projectName, policyRef: i.policyRef,
          sharePct: i.shareOfConstructionPct,
          currentScore: i.currentScore, achievableScore: i.achievableScore,
          actions: i.actions
        }))
      }
    },

    // 5 ─────────────────────────────────────────────────────────────────
    // Every disclosed row carries the score it was locked with — PCAF does
    // not admit a figure without one.
    policies: roll.rows.map(r => {
      const a = locked.find(x => x.assessmentId === r.assessmentId);
      const sc = a && a.dqScoring;
      return {
        ...r,
        dqConstruction: sc ? sc.construction.weighted : null,
        dqUseStage: sc ? (sc.useStage.applies ? sc.useStage.weighted : 'n/a — scope rule') : null
      };
    }),

    // 6 ─────────────────────────────────────────────────────────────────
    restatements: comp.restatements,

    // 7 ─────────────────────────────────────────────────────────────────
    priorYear: {
      year: comp.priorYear,
      hasPrior: comp.hasPrior,
      construction: comp.construction,
      insurerIAE: comp.insurerIAE,
      intensity: comp.intensity,
      dataQuality: comp.dataQuality,
      composition: comp.composition,
      comparabilityNote: comp.comparabilityNote
    },

    // 8 ─────────────────────────────────────────────────────────────────
    method: {
      attribution: `Attribution follows the ${roll.premiumBasis} premium basis. Each policy is attributed against its own project cost and only the results are summed.`,
      aggregation: roll.aggregationNote,
      dataQualityBasis: roll.dataQuality.basis,
      reportingYearBasis: 'A policy is reported in its inception year.',
      lockBasis: 'Only a locked assessment enters this disclosure. A locked assessment is never edited — it is superseded by a new version, and a version that moves the figure by at least the materiality threshold is a restatement carrying a stated reason.'
    },

    // 9 ─────────────────────────────────────────────────────────────────
    conformance: {
      standard: conformance.standard,
      summary: conformance.summary,
      rules: conformance.rules.map(r => ({
        id: r.id, clause: r.clause, rule: r.rule,
        implementation: r.implementation, provingTest: r.test, status: r.status
      })),
      statement:
        `This disclosure has been prepared in conformance with ${STANDARD}. ` +
        'Conformance is a statement by the preparer about method, not an endorsement, approval or certification by PCAF. ' +
        'Each rule above cites the code that enforces it and the test that proves it; the build fails if either ceases to exist.'
    },

    annexes: {
      A: {
        annex: 'A',
        title: 'Assumptions and Limitations',
        note: 'Recorded by the calculation engine at the time each assessment was run, aggregated across the book. A limitation appearing on several projects is listed once with the projects named.',
        total: limitations.length,
        material: limitations.filter(l => l.severity === 'material').length,
        entries: limitations
      },
      B: {
        annex: 'B',
        title: 'Emission Factor Gaps and Research Priority',
        note: gaps.note,
        entries: gaps.factors
      },
      C: includeAuditTrail ? {
        annex: 'C',
        title: 'Assessment Register',
        note: 'Every figure in section 5 traces to one locked assessment, which binds a policy to a BOQ revision and a reporting year. This register is what lets a reader follow a disclosed number back to the bill of quantities behind it.',
        entries: locked.map(a => ({
          assessmentId: a.assessmentId, version: a.version,
          clientName: a.clientName, projectName: a.projectName,
          policyRef: a.policyRef, lineType: a.lineType,
          boqRevision: a.boqRevisionLabel, boqRevisionId: a.boqRevisionId,
          construction_kgCO2e: a.summary.construction_kgCO2e,
          dataQualityOption: a.dataQuality.option,
          lockedAt: a.lockedAt, lockedBy: a.lockedBy,
          supersedes: a.supersedes
        }))
      } : null
    }
  };

  // Language guard — the disclosure claims conformance and nothing more.
  const prose = [
    disclosure.conformance.statement, disclosure.coverage.statement,
    disclosure.priorYear.comparabilityNote, disclosure.restatements.note,
    disclosure.method.attribution, disclosure.method.lockBasis
  ].filter(Boolean).join('\n');
  const offending = containsForbiddenLanguage(prose);
  if (offending.length > 0) {
    throw new Error(`Disclosure blocked: PCAF endorsement language detected (${offending.join(', ')}). Only conformance language is permitted.`);
  }

  /* What the document renderers need, kept off the JSON. See _model(). */
  Object.defineProperty(disclosure, '_source', {
    value: {
      roll,
      settings: await registry.getSettings(orgId),
      factorRows: methodology.allFactorRows(),
      equations: _moduleEquations()
    },
    enumerable: false, writable: false
  });

  return disclosure;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/**
 * The equations behind every figure in this disclosure.
 *
 * An annual position is a sum of locked assessments, so it carries no single
 * traced tree of its own. The equations are therefore taken from the
 * methodology extraction — itself read out of an execution of the same
 * engine, at the same version, that produced every figure summed here — and
 * the document says that rather than presenting them as this run's trace.
 */
function _moduleEquations() {
  const chain = methodology.buildMethodology().calculationChain || [];
  const out = [];
  for (const link of chain) {
    for (const eq of (link.equations || [])) {
      out.push({ module: link.module || '—', label: link.label || '', equation: eq, value: undefined, factors: [] });
    }
  }
  return out;
}

/**
 * Both formats are drawn by the shared standard renderer, in the order
 * PCAF's Part C disclosure checklist reads. The per-assessment report uses
 * the same renderer, so the two documents cannot drift into satisfying
 * different halves of the same requirement.
 *
 * The roll-up and the settings travel with the disclosure on a
 * non-enumerable property: the renderer needs the premium weighting and the
 * recalculation protocol, and copying either onto the disclosure would
 * change what every existing API caller receives.
 */
function _model(d) {
  if (!d._source) {
    throw new Error('This disclosure was not built by buildAnnualDisclosure(), so the document cannot be rendered from it.');
  }
  const { roll, settings, factorRows, equations } = d._source;
  return standard.buildStandardModel(
    standard.annualFacts({ disclosure: d, roll, settings, factorRows, equations }));
}

/** @returns {import('pdfkit')} a streaming A4 document in the house style */
function buildDisclosurePDF(d) {
  return standard.renderStandardPDF(_model(d));
}

/** @returns {Promise<Buffer>} .docx with real named styles */
async function buildDisclosureDOCX(d) {
  return standard.renderStandardDOCX(_model(d));
}

module.exports = { buildAnnualDisclosure, buildDisclosurePDF, buildDisclosureDOCX };
