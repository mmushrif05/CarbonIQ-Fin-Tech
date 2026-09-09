/**
 * CarbonIQ FinTech — the GCF emissions model
 *
 * Lot 1 Milestone 4 asks for "data systems for sustainability reporting and
 * carbon accounting". This is the carbon accounting half: it turns the project
 * records into the figures a Concept Note, a credit paper and a statutory
 * disclosure each need — and it does every arithmetic operation itself, so no
 * number in any of those documents was produced by a language model.
 *
 * ── Three boundaries, and nothing here can merge them ──────────────────────
 *
 * A bank asked "what are the emissions of this pipeline?" is being asked three
 * different questions at once, and answering with one number answers none of
 * them:
 *
 *   MITIGATION      what the project achieves against a counterfactual.
 *                   GCF Mitigation Core Indicator 1. A negative quantity in
 *                   the world, reported as a positive achievement.
 *   EMBODIED        what building it costs — A1-A5 of the asset itself.
 *                   Real, inside the project boundary, and a payback period
 *                   against the mitigation rather than a deduction from it.
 *   FINANCED        what the bank carries on its own balance sheet, PCAF
 *                   Part A. Not in this model at all: it belongs to the
 *                   capital book, on a different attribution basis, in a
 *                   different report, to a different standard.
 *
 * Netting embodied against mitigation would produce a "net benefit" figure
 * that is not defined by GCF, not defined by PCAF, and not comparable to
 * anything. So no function in this file returns a figure combining two
 * boundaries, they are carried in separate keys the whole way up, and a test
 * asserts it rather than trusting the discipline to hold.
 *
 * ── Reduced, avoided and removed ───────────────────────────────────────────
 *
 * GCF's MCI-1 is defined as emissions "reduced, avoided or removed", so the
 * headline figure legitimately combines all three — and it says so where it
 * does. Sri Lanka's NDC 3.0 does the opposite: reduction and removal are two
 * separate commitments and are never summed. Both are honoured by carrying the
 * split beside the total, so the NDC module can read the parts it is allowed
 * to use and the GCF submission can read the total it is asked for.
 *
 * ── Adaptation never enters the headline ───────────────────────────────────
 *
 * An adaptation project may carry a genuine mitigation co-benefit. It is
 * reported on its own line and never in the mitigation total, because a
 * pipeline ranked on carbon per dollar defunds adaptation — which is half of
 * what GCF exists to do.
 */

'use strict';

const record = require('./record');

/** A figure is present only if it is actually a number. `Number(null)` is 0
 *  and 0 is finite; that mistake has produced three defects in this codebase
 *  already, so absence is tested before the number is. */
const _num = (t) => {
  if (!t || typeof t !== 'object') return null;
  const v = t.value;
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const _tier = (t) => (t && typeof t.tier === 'string' ? t.tier : null);

const TIER_RANK = { measured: 1, modelled: 2, benchmark: 3, declared: 4 };
const _weakest = (tiers) => {
  const present = tiers.filter(Boolean);
  if (!present.length) return null;
  return present.reduce((w, t) => ((TIER_RANK[t] || 0) > (TIER_RANK[w] || 0) ? t : w));
};

const round = (n, dp = 0) => {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return null;
  const f = 10 ** dp;
  return Math.round(Number(n) * f) / f;
};

/** Tolerance for agreeing that a recorded figure matches a recomputation.
 *  A recorded figure is rounded by whoever entered it; the point of the check
 *  is to catch a wrong factor or a missing multiplier, not a rounding. */
const AGREEMENT_TOLERANCE_PCT = 1;

/**
 * Recompute what can be recomputed, and say plainly what cannot.
 *
 * The engine never overwrites a recorded figure with its own — a project
 * sponsor's model may hold detail this system does not. What it does is check,
 * and report the divergence, so a wrong emission factor or a missing lifetime
 * multiplier is caught before a Concept Note carries it.
 *
 * Where there is no independent path to the figure, that is reported as such.
 * "Unverified" is a fact about the evidence; a check that silently passes
 * because it had nothing to check is worse than no check.
 */
function checkMitigation(project) {
  const m = project.mitigation || {};
  const tech = project.technical || {};
  const annual = _num(m.annual_tCO2e);
  const lifetime = _num(m.lifetime_tCO2e);

  const checks = [];

  /* Annual: generation x grid emission factor, where both are held. */
  const gen = _num(tech.generation_mwh_yr);
  const ef = _num((m.baseline || {}).gridEF_tCO2e_per_mwh);
  if (gen !== null && ef !== null && annual !== null) {
    const expected = gen * ef;
    const divergencePct = expected === 0 ? null : Math.abs((annual - expected) / expected) * 100;
    checks.push({
      figure: 'mitigation.annual_tCO2e',
      equation: 'generation (MWh/yr) x grid emission factor (tCO2e/MWh)',
      inputs: { generation_mwh_yr: gen, gridEF_tCO2e_per_mwh: ef },
      recomputed: round(expected, 1),
      recorded: annual,
      divergencePct: round(divergencePct, 2),
      agrees: divergencePct !== null && divergencePct <= AGREEMENT_TOLERANCE_PCT,
    });
  } else {
    checks.push({
      figure: 'mitigation.annual_tCO2e',
      recorded: annual,
      recomputed: null,
      verifiable: false,
      reason: 'No independent path to this figure from what is held. It requires either '
        + 'an activity quantity and an emission factor, or a metered baseline. Recorded as declared '
        + 'at source and reported at its evidence tier.',
    });
  }

  /* Lifetime: annual x the asset life. Where no life is declared, the implied
     life is reported rather than a life being assumed to make the check pass. */
  const life = Number.isFinite(Number(tech.lifetimeYears)) && tech.lifetimeYears !== null
    ? Number(tech.lifetimeYears) : null;
  if (annual !== null && lifetime !== null && life !== null) {
    const expected = annual * life;
    const divergencePct = expected === 0 ? null : Math.abs((lifetime - expected) / expected) * 100;
    checks.push({
      figure: 'mitigation.lifetime_tCO2e',
      equation: 'annual tCO2e x asset life (years), undiscounted',
      inputs: { annual_tCO2e: annual, lifetimeYears: life },
      recomputed: round(expected, 1),
      recorded: lifetime,
      divergencePct: round(divergencePct, 2),
      agrees: divergencePct !== null && divergencePct <= AGREEMENT_TOLERANCE_PCT,
    });
  } else if (annual !== null && lifetime !== null && annual !== 0) {
    checks.push({
      figure: 'mitigation.lifetime_tCO2e',
      recorded: lifetime,
      recomputed: null,
      verifiable: false,
      impliedLifetimeYears: round(lifetime / annual, 1),
      reason: 'No asset life is declared on the record, so the lifetime figure cannot be '
        + 'confirmed. The implied life is shown; it is a consequence of the two figures, not a '
        + 'declared input, and it should be recorded before this reaches a submission.',
    });
  }

  const checked = checks.filter(c => c.recomputed !== null);
  return {
    checks,
    verifiable: checked.length > 0,
    agrees: checked.length > 0 ? checked.every(c => c.agrees) : null,
    divergences: checked.filter(c => !c.agrees),
  };
}

/**
 * One project, on all three boundaries, with each in its own key.
 *
 * `countsInHeadline` is the single place the adaptation rule is decided, so
 * every consumer reads the same answer rather than each re-deriving it.
 */
function projectEmissions(project) {
  const m = project.mitigation || {};
  const isCoBenefit = m.isCoBenefit === true || project.stream === 'adaptation';
  const annual = _num(m.annual_tCO2e);
  const lifetime = _num(m.lifetime_tCO2e);
  const baseline = m.baseline || {};
  const emb = project.embodiedCarbon || null;
  const embodied = emb ? _num(emb.a1a5_tCO2e) : null;
  const payback = emb ? _num(emb.paybackYears) : null;

  return {
    id: project.id,
    code: project.code,
    name: project.name,
    stream: project.stream,
    resultsArea: project.resultsArea,

    mitigation: {
      annual_tCO2e: annual,
      lifetime_tCO2e: lifetime,
      tier: _weakest([_tier(m.annual_tCO2e), _tier(m.lifetime_tCO2e), _tier(baseline.gridEF_tCO2e_per_mwh)]),
      baseline: {
        type: baseline.type || null,
        description: baseline.description || null,
        counterfactual: baseline.counterfactual || null,
        gridEF_tCO2e_per_mwh: _num(baseline.gridEF_tCO2e_per_mwh),
        gridEFTier: _tier(baseline.gridEF_tCO2e_per_mwh),
      },
      isCoBenefit,
      /* The rule, decided once. */
      countsInHeadline: project.stream === 'mitigation' && !isCoBenefit,
      countsInHeadlineReason: project.stream === 'mitigation' && !isCoBenefit
        ? 'Mitigation project — enters GCF Mitigation Core Indicator 1.'
        : 'Adaptation project. Its mitigation is a co-benefit, reported on its own line and '
          + 'never in the mitigation total: a pipeline ranked on carbon per dollar defunds adaptation.',
      uncertaintyPct: m.uncertaintyPct ?? null,
    },

    /* Separate key, separate question. Never netted against the line above. */
    embodiedCarbon: emb ? {
      a1a5_tCO2e: embodied,
      tier: _tier(emb.a1a5_tCO2e),
      paybackYears: payback,
      paybackTier: emb.paybackYears ? _tier(emb.paybackYears) : null,
      note: emb.note || null,
      basis: 'A1-A5 of the asset itself, inside the project boundary. A payback period against '
        + 'the mitigation, never a deduction from it.',
    } : {
      a1a5_tCO2e: null,
      present: false,
      reason: 'No embodied carbon is held for this project. Reported absent rather than '
        + 'estimated — a benchmark intensity applied to a project of unknown construction would '
        + 'read as a measurement.',
    },

    /* Named so that its absence here is a statement rather than an oversight. */
    financedEmissions: {
      available: false,
      reason: 'Financed emissions are not a property of a candidate project. They are the '
        + "bank's own attributed emissions on drawn exposure, on PCAF Part A's attribution basis, "
        + 'and they live in the capital book. Combining them with project mitigation would produce '
        + 'a figure defined by no standard.',
      where: 'GET /v1/capital/dashboard',
    },

    check: checkMitigation(project),
    evidence: {
      weakestTier: record.weakestTier(project),
      figures: record.tracedFigures(project).length,
    },
  };
}

/**
 * The pipeline position.
 *
 * The headline is GCF Mitigation Core Indicator 1 — reduced, avoided and
 * removed, which that indicator defines as one quantity — with the split
 * carried beside it so the NDC module can read reduction and removal
 * separately, as NDC 3.0 requires.
 */
function portfolioEmissions(projects = [], { label = null } = {}) {
  const rows = projects.map(projectEmissions);
  const headlineRows = rows.filter(r => r.mitigation.countsInHeadline);
  const coBenefitRows = rows.filter(r => !r.mitigation.countsInHeadline);

  const sum = (list, pick) => list.reduce((a, r) => {
    const v = pick(r);
    return v === null ? a : a + v;
  }, 0);

  const byType = {};
  for (const t of record.BASELINE_TYPES) {
    const of = headlineRows.filter(r => r.mitigation.baseline.type === t);
    byType[t] = {
      annual_tCO2e: sum(of, r => r.mitigation.annual_tCO2e),
      lifetime_tCO2e: sum(of, r => r.mitigation.lifetime_tCO2e),
      projects: of.length,
    };
  }

  const embodiedRows = rows.filter(r => r.embodiedCarbon.a1a5_tCO2e !== null);
  const missingMitigation = rows.filter(r => r.mitigation.annual_tCO2e === null).map(r => r.code);

  const byTier = {};
  for (const r of rows) {
    const t = r.evidence.weakestTier || 'unknown';
    byTier[t] = (byTier[t] || 0) + 1;
  }

  return {
    label,
    projects: rows.length,

    headline: {
      indicator: 'GCF Mitigation Core Indicator 1 — tCO2eq reduced, avoided or removed',
      annual_tCO2e: sum(headlineRows, r => r.mitigation.annual_tCO2e),
      lifetime_tCO2e: sum(headlineRows, r => r.mitigation.lifetime_tCO2e),
      projects: headlineRows.length,
      byBaselineType: byType,
      note: "GCF's core indicator is defined over reduced, avoided and removed together, so the "
        + 'total combines them. The split is carried beside it because NDC 3.0 holds reduction and '
        + 'removal as separate commitments that are never summed.',
    },

    adaptationCoBenefit: {
      annual_tCO2e: sum(coBenefitRows, r => r.mitigation.annual_tCO2e),
      lifetime_tCO2e: sum(coBenefitRows, r => r.mitigation.lifetime_tCO2e),
      projects: coBenefitRows.length,
      note: 'Reported on its own line and never added to the headline. Adaptation projects are '
        + 'appraised on adaptation outcomes; their carbon is a co-benefit, not their purpose.',
    },

    embodiedCarbon: {
      a1a5_tCO2e: sum(embodiedRows, r => r.embodiedCarbon.a1a5_tCO2e),
      projects: embodiedRows.length,
      held: embodiedRows.map(r => r.code),
      notHeld: rows.filter(r => r.embodiedCarbon.a1a5_tCO2e === null).map(r => r.code),
      note: 'A separate boundary. Never netted against mitigation, and the total above is not '
        + 'reduced by it. Where it is not held it is absent, not estimated.',
    },

    financedEmissions: {
      available: false,
      reason: "The bank's own attributed emissions are not a property of this pipeline. "
        + 'They are reported from the capital book on PCAF Part A attribution.',
    },

    coverage: {
      projects: rows.length,
      withMitigationFigure: rows.length - missingMitigation.length,
      missing: missingMitigation,
      verifiable: rows.filter(r => r.check.verifiable).length,
      diverging: rows.filter(r => r.check.agrees === false).map(r => r.code),
    },

    evidence: {
      weakestTier: _weakest(rows.map(r => r.evidence.weakestTier)),
      byTier,
      note: 'Evidence tiers are GCF appraisal classes — measured, modelled, benchmark, declared. '
        + "They are deliberately not PCAF's 1-5 data-quality scale and must never be quoted as one.",
    },

    rows,
  };
}

/**
 * One pipeline against another.
 *
 * A pipeline in two different years is two different sets of projects, so the
 * difference between two totals is not a performance movement — it is mostly a
 * change of book. The same trap PCAF Part C comparatives handle: report the
 * movement as fact, decompose it into what entered, what left and what changed,
 * and say what the difference is not.
 */
function movement(previous = [], current = []) {
  const prev = portfolioEmissions(previous, { label: 'previous' });
  const curr = portfolioEmissions(current, { label: 'current' });

  const prevById = new Map(prev.rows.map(r => [r.id, r]));
  const currById = new Map(curr.rows.map(r => [r.id, r]));

  const entered = curr.rows.filter(r => !prevById.has(r.id));
  const exited = prev.rows.filter(r => !currById.has(r.id));
  const retained = curr.rows.filter(r => prevById.has(r.id));

  const head = (r) => (r.mitigation.countsInHeadline ? (r.mitigation.annual_tCO2e || 0) : 0);
  const restated = retained.filter(r => head(r) !== head(prevById.get(r.id)));

  return {
    previous: { annual_tCO2e: prev.headline.annual_tCO2e, projects: prev.headline.projects },
    current: { annual_tCO2e: curr.headline.annual_tCO2e, projects: curr.headline.projects },
    movement_tCO2e: curr.headline.annual_tCO2e - prev.headline.annual_tCO2e,
    decomposition: {
      entered: {
        projects: entered.map(r => r.code),
        annual_tCO2e: entered.reduce((a, r) => a + head(r), 0),
      },
      exited: {
        projects: exited.map(r => r.code),
        annual_tCO2e: -exited.reduce((a, r) => a + head(r), 0),
      },
      restated: {
        projects: restated.map(r => r.code),
        annual_tCO2e: restated.reduce((a, r) => a + head(r) - head(prevById.get(r.id)), 0),
      },
    },
    note: 'A pipeline movement is not a change in performance. Each period covers a different set '
      + 'of candidate projects, so most of any movement is the book changing rather than any '
      + 'project doing better or worse. The decomposition below is what the movement actually is.',
  };
}

module.exports = {
  projectEmissions, portfolioEmissions, checkMitigation, movement,
  AGREEMENT_TOLERANCE_PCT,
};
