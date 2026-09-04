/**
 * CarbonIQ FinTech — instrument structuring and the concessionality question
 *
 * Lot 2 asks for five to seven innovative instruments evaluated, and for each
 * candidate's viability shown with AND without concessional support. The second
 * half is the harder ask and the one that gives the first half its meaning.
 *
 * ── An appraisal that can only say yes is not an appraisal ─────────────────
 *
 * GCF applies minimum concessionality: a project already viable on commercial
 * terms should not receive concessional money, and one that needs less should
 * not be given more. So this module can return "does not need GCF support" and
 * says so plainly when the record says so. A structuring engine that always
 * finds a structure is a sales tool.
 *
 * ── An instrument answers a barrier, or it answers nothing ─────────────────
 *
 * Structures are matched to the barriers a project has actually recorded, from
 * one named vocabulary shared by the project record and the instrument table.
 * Matching on anything else — sector, size, a feeling about innovation — is
 * decoration, and it produces a recommendation nobody can defend.
 *
 * What the match reports is coverage AND its complement: the barriers a
 * structure leaves standing are named beside the ones it solves, because the
 * uncovered barrier is what actually kills a deal.
 *
 * ── Deliverability is not a score either ───────────────────────────────────
 *
 * DFCC's accreditation does not carry the grant modality. Results-based finance
 * is the only structure here that reaches a project with no cash flow, and it
 * is the one DFCC cannot currently deliver. That combination is a structural
 * gap in the pipeline rather than a low score on a spreadsheet, and it is
 * reported as a finding with what to verify.
 */

'use strict';

const CATALOGUE = require('../../data/gcf/instruments.json');

const INSTRUMENTS = CATALOGUE.instruments;
const BARRIERS = CATALOGUE.barriers;
const BARRIER_IDS = BARRIERS.map(b => b.id);
const _barrierById = new Map(BARRIERS.map(b => [b.id, b]));
const _instrumentById = new Map(INSTRUMENTS.map(i => [i.id, i]));

const MOBILISATION_RANK = { low: 1, moderate: 2, high: 3, 'very high': 4 };
const CONCESSIONALITY_RANK = { low: 1, moderate: 2, high: 3 };

const _num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const round = (n, dp = 3) => (n === null ? null : Math.round(n * 10 ** dp) / 10 ** dp);

/** The reference tables, for a screen that should never restate them. */
function catalogue() {
  return JSON.parse(JSON.stringify(CATALOGUE));
}

/**
 * Minimum concessionality, answered from the record.
 *
 * `viabilityWithoutGcf` is a required field precisely so this can be answered.
 * Where a project is viable unsupported, that is reported as the finding it is:
 * GCF support would be displacing commercial capital rather than mobilising it.
 */
function concessionality(project) {
  const v = project.financing?.viabilityWithoutGcf;
  const grantEq = _num(project.financing?.grantEquivalentPct?.value);
  const gcfAsk = _num(project.financing?.gcfAsk);
  const totalCost = _num(project.financing?.totalCost);

  if (!v || typeof v.viable !== 'boolean') {
    return {
      assessed: false,
      reason: 'No unsupported-viability assessment is recorded. The ToR requires viability shown '
        + 'with and without concessional support, so this must be answered before the project can '
        + 'be put forward.',
    };
  }

  if (v.viable) {
    return {
      assessed: true,
      needsSupport: false,
      recommendation: 'no_gcf_support',
      reason: v.reason,
      finding: 'This project is recorded as viable on commercial terms. Under GCF\'s minimum '
        + 'concessionality principle it should not receive concessional finance: doing so would '
        + 'displace commercial capital rather than mobilise it. DFCC may still wish to finance it '
        + 'commercially.',
      grantEquivalentPct: grantEq,
    };
  }

  return {
    assessed: true,
    needsSupport: true,
    recommendation: 'concessional_support_justified',
    reason: v.reason,
    grantEquivalentPct: grantEq,
    gcfSharePct: gcfAsk && totalCost ? round((gcfAsk / totalCost) * 100, 1) : null,
    minimumConcessionality: grantEq === null
      ? 'No grant-equivalent figure is recorded, so the amount of concession cannot be tested '
        + 'against the minimum-concessionality principle. It is the figure GCF will ask for first.'
      : `Grant-equivalent subsidy is ${grantEq}%. Minimum concessionality asks whether the same `
        + 'outcome is reachable with less; the structures below are ordered with that in mind.',
  };
}

/**
 * One instrument against one project.
 *
 * `covers` and `leaves` are both returned. A coverage figure on its own reads
 * as a score; the named uncovered barrier is the thing that actually stops the
 * deal, and it belongs beside the number.
 */
function fitOne(project, instrument, { accreditation = {} } = {}) {
  const projectBarriers = Array.isArray(project.barriers) ? project.barriers : [];
  const covers = projectBarriers.filter(b => instrument.addresses.includes(b));
  const leaves = projectBarriers.filter(b => !instrument.addresses.includes(b));

  const deliverable = !(instrument.requiresGrantModality === true
    && accreditation.grantModality === false);

  return {
    instrumentId: instrument.id,
    name: instrument.name,
    summary: instrument.summary,
    covers: covers.map(b => ({ id: b, label: _barrierById.get(b)?.label || b })),
    leaves: leaves.map(b => ({ id: b, label: _barrierById.get(b)?.label || b })),
    coverage: projectBarriers.length ? round(covers.length / projectBarriers.length, 2) : null,
    coverageBasis: projectBarriers.length
      ? `${covers.length} of ${projectBarriers.length} recorded barriers addressed.`
      : 'No barriers are recorded for this project, so instrument fit cannot be assessed. A '
        + 'structure matched to a project with no stated barrier is matched to nothing.',
    mobilisation: instrument.mobilisation,
    concessionality: instrument.concessionality,
    dfccRole: instrument.dfccRole,
    watchOut: instrument.watchOut,
    deliverableByDfcc: deliverable,
    deliverabilityNote: deliverable ? null
      : 'Requires the grant modality, which DFCC\'s accreditation does not carry. Not deliverable '
        + 'by DFCC as the accredited entity on the accreditation as read. Verify with DFCC or the '
        + 'NDA before this is ruled out — misreading an accreditation scope is a serious error.',
  };
}

/**
 * Every structure against one project, ordered.
 *
 * Ordering is coverage first, then the LEAST concession that achieves it —
 * minimum concessionality expressed as a sort order rather than as a paragraph.
 * A structure DFCC cannot deliver sorts last regardless of fit and keeps its
 * reason, because the pipeline needs to see the gap rather than have it hidden.
 */
function structureFor(project, { accreditation = {} } = {}) {
  const rows = INSTRUMENTS.map(i => fitOne(project, i, { accreditation }));

  const sorted = [...rows].sort((a, b) => {
    if (a.deliverableByDfcc !== b.deliverableByDfcc) return a.deliverableByDfcc ? -1 : 1;
    const cov = (b.coverage ?? 0) - (a.coverage ?? 0);
    if (cov !== 0) return cov;
    const conc = (CONCESSIONALITY_RANK[a.concessionality] || 9) - (CONCESSIONALITY_RANK[b.concessionality] || 9);
    if (conc !== 0) return conc;
    return (MOBILISATION_RANK[b.mobilisation] || 0) - (MOBILISATION_RANK[a.mobilisation] || 0);
  });

  const conc = concessionality(project);
  const best = sorted.find(r => r.deliverableByDfcc && (r.coverage ?? 0) > 0) || null;
  const uncovered = best ? best.leaves : [];

  const undeliverableButFitting = sorted
    .filter(r => !r.deliverableByDfcc && (r.coverage ?? 0) > 0);

  return {
    id: project.id,
    code: project.code,
    name: project.name,
    stream: project.stream,
    recordedInstrument: project.financing?.instrument || null,
    barriers: (project.barriers || []).map(b => ({
      id: b, label: _barrierById.get(b)?.label || b, detail: _barrierById.get(b)?.detail || null,
    })),
    concessionality: conc,

    recommended: best ? {
      instrumentId: best.instrumentId,
      name: best.name,
      coverage: best.coverage,
      basis: best.coverageBasis,
      concession: best.concessionality,
      mobilisation: best.mobilisation,
      watchOut: best.watchOut,
    } : null,
    recommendedNote: best ? null
      : 'No deliverable structure addresses any recorded barrier for this project.',

    /* Named, not buried. The barrier the recommended structure does not solve
       is the one that decides whether this project happens. */
    barriersLeftStanding: uncovered,
    barriersLeftStandingNote: uncovered.length
      ? 'Not addressed by the recommended structure. Resolution requires a second instrument or a '
        + 'change to the project design.'
      : 'The recommended structure addresses every recorded barrier.',

    structuralGap: undeliverableButFitting.length ? {
      instruments: undeliverableButFitting.map(r => ({
        instrumentId: r.instrumentId, name: r.name, coverage: r.coverage, reason: r.deliverabilityNote,
      })),
      note: 'These structures fit the project but fall outside DFCC\'s accreditation as recorded. '
        + 'Verify the modality, seek an extension, or route through a partner accredited entity.',
    } : null,

    /* Whether the record's own choice survives the analysis. */
    recordedInstrumentCheck: (() => {
      const rec = project.financing?.instrument;
      if (!rec) return null;
      const known = _instrumentById.get(rec);
      if (!known) {
        return {
          recognised: false,
          note: `The recorded instrument "${rec}" is not one of the ${INSTRUMENTS.length} structures `
            + 'evaluated here. It is not wrong — it is unassessed.',
        };
      }
      const row = rows.find(r => r.instrumentId === rec);
      return {
        recognised: true,
        coverage: row.coverage,
        agreesWithRecommendation: best ? best.instrumentId === rec : false,
        note: best && best.instrumentId === rec
          ? 'The recorded structure is also the one this analysis reaches.'
          : `The record names ${known.name}; on recorded barriers, coverage and minimum `
            + `concessionality this analysis reaches ${best ? best.name : 'no deliverable structure'}. `
            + 'Both are shown so the choice is argued rather than assumed.',
      };
    })(),

    all: sorted,
  };
}

/**
 * The whole pipeline structured, plus what the pool says about itself.
 *
 * The portfolio view exists to surface the thing no single project shows: a
 * barrier that recurs across the pipeline and that no deliverable structure
 * addresses is a mandate question, not a deal question.
 */
function structurePipeline(projects = [], { accreditation = {} } = {}) {
  const rows = projects.map(p => structureFor(p, { accreditation }));

  const barrierCounts = {};
  for (const p of projects) {
    for (const b of p.barriers || []) barrierCounts[b] = (barrierCounts[b] || 0) + 1;
  }

  const unaddressable = Object.keys(barrierCounts).filter(b => {
    const deliverable = INSTRUMENTS.filter(i => !(i.requiresGrantModality && accreditation.grantModality === false));
    return !deliverable.some(i => i.addresses.includes(b));
  });

  const notNeedingSupport = rows.filter(r => r.concessionality.needsSupport === false);
  const unassessed = rows.filter(r => r.concessionality.assessed === false);

  return {
    catalogue: {
      instruments: INSTRUMENTS.length,
      source: CATALOGUE._meta.source,
      note: CATALOGUE._meta.note,
      concessionalityNote: CATALOGUE._meta.concessionalityNote,
    },
    projects: rows,

    barrierFrequency: Object.entries(barrierCounts)
      .map(([id, count]) => ({ id, label: _barrierById.get(id)?.label || id, count }))
      .sort((a, b) => b.count - a.count),

    mandateGap: unaddressable.length ? {
      barriers: unaddressable.map(id => ({
        id,
        label: _barrierById.get(id)?.label || id,
        projects: projects.filter(p => (p.barriers || []).includes(id)).map(p => p.code),
      })),
      note: 'No structure within DFCC\'s current accreditation addresses these barriers. Where '
        + 'they recur across the pipeline, resolution requires either an extended modality or a '
        + 'partner accredited entity.',
    } : null,

    minimumConcessionality: {
      notNeedingSupport: notNeedingSupport.map(r => r.code),
      unassessed: unassessed.map(r => r.code),
      note: 'GCF applies minimum concessionality: a project viable on commercial terms is not '
        + 'eligible for concessional finance. Viability must be assessed with and without support.',
    },
  };
}

module.exports = {
  catalogue, concessionality, fitOne, structureFor, structurePipeline,
  INSTRUMENTS, BARRIERS, BARRIER_IDS,
};
