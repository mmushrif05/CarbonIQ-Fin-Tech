/**
 * CarbonIQ FinTech — contribution against Sri Lanka's NDC 3.0
 *
 * The question a GCF Concept Note and the NDA both ask: how does this project
 * help the country meet what it has committed to? Answering it well is mostly
 * a matter of refusing to answer it badly.
 *
 * ── Reduction and removal are two commitments, never one ───────────────────
 *
 * NDC 3.0 (September 2025) commits Sri Lanka to a 20.09% cumulative reduction
 * against business-as-usual over 2026-2035, and separately to a 4.49% increase
 * in net carbon removal. They are not added, and their sum is not a figure Sri
 * Lanka has committed to. This module cannot produce it: reductions and removals
 * are carried in two ledgers from the project record to the output, and there
 * is no key anywhere holding their sum.
 *
 * ── The share of the target is absent, not estimated ───────────────────────
 *
 * "This project delivers 1.4% of Sri Lanka's NDC" is the sentence everyone
 * wants. It cannot be computed from anything held here: the NDC targets are
 * percentages against a business-as-usual scenario, and the absolute tonnage of
 * that scenario is published by the Ministry of Environment, not by this
 * system. So the share is reported absent with the reason and with what would
 * be needed to state it — and if the BAU tonnage is supplied, it is computed
 * and carried at the evidence tier of the input that made it possible, which is
 * `declared`, not `measured`.
 *
 * The same discipline as the disclosure engine: a required item with no data is
 * reported absent with the clause that requires it, never filled with a
 * plausible number.
 */

'use strict';

const NDC = require('../../data/gcf/ndc3.json');
const emissions = require('./emissions');

const PERIOD_YEARS = 10;                       // 2026-2035 inclusive
const PERIOD_START = 2026;
const PERIOD_END = 2035;

const _round = (n, dp = 0) => (n === null || n === undefined || !Number.isFinite(Number(n))
  ? null : Math.round(Number(n) * 10 ** dp) / 10 ** dp);

const _targetsById = new Map(NDC.sectorTargets.map(t => [t.id, t]));

/** The sector targets a project cites, resolved. An id citing nothing is
 *  returned as unmatched rather than dropped — a silent drop would make a
 *  mistyped target look like a project that maps to nothing. */
function resolveSectorTargets(project) {
  const ids = Array.isArray(project.ndcSectorTargets) ? project.ndcSectorTargets : [];
  const matched = [];
  const unmatched = [];
  for (const id of ids) {
    const t = _targetsById.get(id);
    if (t) matched.push(t); else unmatched.push(id);
  }
  return { matched, unmatched };
}

/**
 * How much of a project's mitigation falls inside the NDC window.
 *
 * A project's lifetime may run well past 2035, and counting the whole of it
 * against a 2026-2035 commitment would overstate the contribution — in the case
 * of a twenty-year asset, by a factor of two. Only the years inside the window
 * count, and the assumption about when the project starts operating is stated
 * rather than buried.
 */
function withinPeriod(project, { operatingFrom = PERIOD_START } = {}) {
  const annual = (() => {
    const t = (project.mitigation || {}).annual_tCO2e;
    if (!t || t.value === null || t.value === undefined) return null;
    const n = Number(t.value);
    return Number.isFinite(n) ? n : null;
  })();
  if (annual === null) {
    return {
      cumulative_tCO2e: null,
      reason: 'No annual mitigation figure is held for this project.',
    };
  }

  const life = Number.isFinite(Number((project.technical || {}).lifetimeYears))
    ? Number(project.technical.lifetimeYears) : null;

  const start = Math.max(Number(operatingFrom) || PERIOD_START, PERIOD_START);
  const lastYear = life === null ? PERIOD_END : Math.min(PERIOD_END, start + life - 1);
  const years = Math.max(0, lastYear - start + 1);

  return {
    cumulative_tCO2e: _round(annual * years, 0),
    annual_tCO2e: annual,
    yearsInPeriod: years,
    period: `${PERIOD_START}-${PERIOD_END}`,
    assumption: life === null
      ? `No asset life is declared, so the project is assumed to operate for the whole of the `
        + `NDC period from ${start}. Where the asset life is shorter this overstates the `
        + `contribution; record the life to remove the assumption.`
      : `Assumed operating from ${start} for its declared ${life}-year life, of which ${years} `
        + `year${years === 1 ? '' : 's'} fall inside ${PERIOD_START}-${PERIOD_END}. Only years `
        + 'inside the window count against a 2026-2035 commitment.',
    tier: 'modelled',
  };
}

/**
 * One project against NDC 3.0.
 *
 * A removal lands in the removal ledger and a reduction or avoidance in the
 * reduction ledger. Which one is decided by the baseline type on the record,
 * which is where that judgement belongs — the counterfactual decides it, not
 * this function.
 */
function projectContribution(project, opts = {}) {
  const e = emissions.projectEmissions(project);
  const period = withinPeriod(project, opts);
  const { matched, unmatched } = resolveSectorTargets(project);
  const type = e.mitigation.baseline.type;
  const isRemoval = type === 'removal';

  return {
    id: project.id,
    code: project.code,
    name: project.name,
    stream: project.stream,
    isCoBenefit: e.mitigation.isCoBenefit,

    ndc: {
      version: NDC._meta.title,
      issued: NDC._meta.issued,
      period: NDC._meta.period,
    },

    sectorTargets: matched.map(t => ({
      id: t.id, sector: t.sector, stream: t.stream, target: t.target, gcfResultsArea: t.gcfResultsArea,
    })),
    unmatchedSectorTargets: unmatched,

    /* Two ledgers. There is no key here holding their sum, and there is not
       meant to be one. */
    reduction: isRemoval ? { cumulative_tCO2e: null, applies: false } : {
      applies: true,
      baselineType: type,
      cumulative_tCO2e: period.cumulative_tCO2e,
      annual_tCO2e: period.annual_tCO2e ?? null,
      yearsInPeriod: period.yearsInPeriod ?? null,
      commitment: NDC.reduction,
    },
    removal: isRemoval ? {
      applies: true,
      baselineType: type,
      cumulative_tCO2e: period.cumulative_tCO2e,
      annual_tCO2e: period.annual_tCO2e ?? null,
      yearsInPeriod: period.yearsInPeriod ?? null,
      commitment: NDC.removal,
    } : { cumulative_tCO2e: null, applies: false },

    basis: {
      assumption: period.assumption ?? null,
      reason: period.reason ?? null,
      tier: period.tier ?? null,
    },

    note: 'A reduction and a removal are separate NDC 3.0 commitments and are never summed.',
  };
}

/**
 * Share of the national commitment — computed only where the input that makes
 * it computable has actually been supplied.
 *
 * `bau` is the absolute business-as-usual tonnage for 2026-2035, published by
 * the Ministry of Environment. Without it there is no denominator and the share
 * is reported absent with what is missing, which is the honest answer and the
 * one that tells a reader what to go and get.
 */
function shareOfCommitment(cumulative_tCO2e, commitment, bauCumulative_tCO2e) {
  const bau = bauCumulative_tCO2e === null || bauCumulative_tCO2e === undefined || bauCumulative_tCO2e === ''
    ? null : Number(bauCumulative_tCO2e);
  if (bau === null || !Number.isFinite(bau) || bau <= 0) {
    return {
      available: false,
      reason: 'The NDC targets are percentages against a business-as-usual scenario. Expressing a '
        + 'project as a share of them requires the absolute BAU tonnage for 2026-2035, which is '
        + 'published by the Ministry of Environment and is not held by this system.',
      needs: 'bauCumulative_tCO2e — the absolute BAU emissions for 2026-2035, with its source and vintage.',
    };
  }
  if (cumulative_tCO2e === null || cumulative_tCO2e === undefined) {
    return { available: false, reason: 'No cumulative contribution is held for this pipeline.' };
  }
  const targetTonnes = bau * (commitment.totalPct / 100);
  const unconditionalTonnes = bau * (commitment.unconditionalPct / 100);
  return {
    available: true,
    tier: 'declared',
    bauCumulative_tCO2e: bau,
    targetPct: commitment.totalPct,
    target_tCO2e: _round(targetTonnes, 0),
    unconditionalTarget_tCO2e: _round(unconditionalTonnes, 0),
    sharePct: _round((cumulative_tCO2e / targetTonnes) * 100, 3),
    shareOfUnconditionalPct: _round((cumulative_tCO2e / unconditionalTonnes) * 100, 3),
    caveat: 'Computed from a BAU tonnage supplied to this system. It is a declared input, not a '
      + 'measured one, and the share inherits that. Check it against the NDC 3.0 document as '
      + 'published before it reaches a submission.',
  };
}

/**
 * The pipeline against NDC 3.0.
 *
 * The headline ledgers count mitigation projects only, on the same rule the
 * emissions roll-up applies: an adaptation co-benefit is reported on its own
 * line and never in the national contribution total.
 */
function portfolioContribution(projects = [], opts = {}) {
  const rows = projects.map(p => projectContribution(p, opts));
  const counted = rows.filter(r => !r.isCoBenefit);
  const coBenefit = rows.filter(r => r.isCoBenefit);

  const sum = (list, pick) => list.reduce((a, r) => {
    const v = pick(r);
    return v === null || v === undefined ? a : a + v;
  }, 0);

  const reduction_tCO2e = sum(counted, r => (r.reduction.applies ? r.reduction.cumulative_tCO2e : null));
  const removal_tCO2e = sum(counted, r => (r.removal.applies ? r.removal.cumulative_tCO2e : null));

  const bySector = {};
  for (const r of counted) {
    for (const t of r.sectorTargets) {
      const cur = bySector[t.id] || { id: t.id, sector: t.sector, target: t.target, projects: [] };
      cur.projects.push(r.code);
      bySector[t.id] = cur;
    }
  }

  return {
    ndc: {
      version: NDC._meta.title,
      issued: NDC._meta.issued,
      period: NDC._meta.period,
      supersedes: NDC._meta.supersedes,
      verify: NDC._meta.verify,
    },

    reduction: {
      commitment: NDC.reduction,
      pipelineCumulative_tCO2e: reduction_tCO2e,
      projects: counted.filter(r => r.reduction.applies).map(r => r.code),
      share: shareOfCommitment(reduction_tCO2e, NDC.reduction, opts.bauCumulative_tCO2e),
    },

    removal: {
      commitment: NDC.removal,
      pipelineCumulative_tCO2e: removal_tCO2e,
      projects: counted.filter(r => r.removal.applies).map(r => r.code),
      share: shareOfCommitment(removal_tCO2e, NDC.removal, opts.bauCumulative_tCO2e),
    },

    /* Split the same way the ledgers above are. A single co-benefit total
       would add the irrigation project's avoided diesel to the mangrove
       project's sequestration — a reduction and a removal in one number, which
       is the exact thing this module exists not to do. It is easy to miss here
       precisely because the line is a footnote. */
    adaptationCoBenefit: {
      projects: coBenefit.map(r => r.code),
      reduction_tCO2e: sum(coBenefit, r => (r.reduction.applies ? r.reduction.cumulative_tCO2e : null)),
      removal_tCO2e: sum(coBenefit, r => (r.removal.applies ? r.removal.cumulative_tCO2e : null)),
      note: 'Adaptation projects contribute to the nine NDC 3.0 adaptation sectors and to the '
        + 'National Adaptation Plan. Their carbon is reported here as a co-benefit, is not part of '
        + 'the mitigation contribution above, and is split the same way — a reduction and a removal '
        + 'are not added together on this line either.',
    },

    sectorCoverage: {
      targetsAddressed: Object.values(bySector),
      targetsTotal: NDC.sectorTargets.length,
      mitigationSectors: NDC.sectorCounts.mitigation,
      adaptationSectors: NDC.sectorCounts.adaptation,
      crossCutting: NDC.sectorCounts.crossCutting,
    },

    gesi: NDC.gesi,
    nap: NDC.nap,
    keySDGs: NDC.keySDGs,

    note: 'Reduction and removal are separate NDC 3.0 commitments over 2026-2035 and are never '
      + 'summed. NDC 3.0 states no net-zero year, so none is asserted.',

    rows,
  };
}

module.exports = {
  projectContribution, portfolioContribution, withinPeriod, resolveSectorTargets,
  shareOfCommitment, PERIOD_YEARS, PERIOD_START, PERIOD_END,
};
