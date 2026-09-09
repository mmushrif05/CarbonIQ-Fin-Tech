/**
 * CarbonIQ FinTech — screening, ranking, and the answer
 *
 * Lot 2's deliverable: take a pool of candidates and defend which two go
 * forward as Concept Notes. The ToR asks for at least two high-potential
 * concepts and up to two Concept Notes, so five is the pool and two is the
 * output — and the value is entirely in being able to say *why*.
 *
 * ── A gate is not a score ──────────────────────────────────────────────────
 *
 * DFCC is accredited to medium size (USD 50-250m) and environmental and social
 * category B/I-2 under B.36/10. A category A project is not "risky, rank it
 * lower" — DFCC cannot carry it as the accredited entity at all. Down-ranking
 * instead of excluding produces a pipeline that drifts towards projects
 * touching nobody, which is the opposite of what GCF exists to fund. So the
 * gate runs first and its output is three sets: eligible, flagged, excluded.
 *
 * `flagged` exists because a finding is not always a verdict. DFCC's
 * accreditation does not carry the grant modality, so a grant-dependent design
 * is not deliverable by DFCC as the AE — but misreading an accreditation scope
 * would be a serious error, so the project is flagged with what to verify
 * rather than struck out on this system's reading of a checkbox.
 *
 * ── Two ranked lists, never one ────────────────────────────────────────────
 *
 * Mitigation and adaptation are ranked separately and are never merged. The
 * adaptation ranking does not touch carbon at any point: its impact metric is
 * beneficiaries reached per dollar. A single league table sorted on tCO2e per
 * dollar would put the irrigation and mangrove projects at the bottom every
 * time, which is a fact about the sort key and not about the projects.
 *
 * ── The ranking is partial, and says so ────────────────────────────────────
 *
 * GCF assesses against six investment criteria. Three of them — paradigm-shift
 * potential, needs of the recipient, sustainable development potential — rest
 * on judgements this system does not hold and cannot compute. They are
 * reported unscored with the reason rather than filled with a plausible number,
 * so nobody mistakes a partial ranking for a GCF assessment. The weights are
 * the reader's and are returned with the result, so a screenshot carries them.
 */

'use strict';

const record = require('./record');
const emissions = require('./emissions');

/** Absence before number, everywhere. `Number(null)` is 0 and 0 is finite. */
const _num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const _traced = (t) => (t && typeof t === 'object' ? _num(t.value) : null);

const round = (n, dp = 3) => (n === null ? null : Math.round(n * 10 ** dp) / 10 ** dp);

/** Readiness reads off the ToR's own progression. */
const STAGE_RANK = Object.fromEntries(record.STAGES.map((s, i) => [s, i]));
const STAGE_MAX = record.STAGES.length - 1;

/** Better evidence ranks higher: a Concept Note needs defensible numbers, and
 *  a benchmark default is a commitment to go and find the real one. */
const TIER_STRENGTH = { measured: 1, modelled: 0.75, benchmark: 0.5, declared: 0.25 };

/**
 * The six GCF investment criteria, and which of them this system can actually
 * score. Named here rather than in a comment so the output can carry them.
 */
const GCF_CRITERIA = Object.freeze([
  { id: 'impactPotential', name: 'Impact potential', scored: true },
  { id: 'paradigmShift', name: 'Paradigm-shift potential', scored: false,
    reason: 'Rests on a judgement about replication, market signals and enabling environment that '
      + 'is made by people who know the sector, not derived from a project record.' },
  { id: 'sustainableDevelopment', name: 'Sustainable development potential', scored: false,
    reason: 'Requires environmental, social, economic and gender co-benefit assessment per project. '
      + 'Beneficiary counts are held; the wider co-benefit assessment is not.' },
  { id: 'needsOfRecipient', name: 'Needs of the recipient', scored: false,
    reason: 'A judgement about vulnerability, financing alternatives and absorptive capacity, made '
      + 'against national evidence this system does not hold.' },
  { id: 'countryOwnership', name: 'Country ownership', scored: true,
    note: 'Scored on alignment to NDC 3.0 sector targets only. NDA endorsement and national '
      + 'institution engagement are separate and are not scored here.' },
  { id: 'efficiencyEffectiveness', name: 'Efficiency and effectiveness', scored: true },
]);

const DEFAULT_WEIGHTS = Object.freeze({
  impactPotential: 0.35,
  efficiency: 0.20,
  countryOwnership: 0.20,
  readiness: 0.15,
  evidence: 0.10,
});

/* ── The gate ──────────────────────────────────────────────────────────── */

/**
 * Eligible, flagged or excluded — and why, in words a credit committee can
 * argue with.
 */
function screenOne(project, { accreditation }) {
  /* The accredited ceiling. `sizeRange_usd` describes the band DFCC is
     accredited to ("medium", USD 50-250m); what it constrains is the top. */
  const size = accreditation.sizeRange_usd || [0, Infinity];
  const ceiling = size[1] ?? Infinity;
  const cost = _num(project.financing?.totalCost);
  const exclusions = [];
  const flags = [];

  if (!record.ESS_WITHIN_DFCC_ACCREDITATION.includes(project.essCategory)) {
    exclusions.push({
      rule: 'ess_category',
      detail: `Environmental and social category ${project.essCategory} is outside DFCC's `
        + `accreditation (${accreditation.essCategory}). DFCC cannot act as the accredited entity `
        + 'for this project. Excluded, not down-ranked.',
    });
  }

  if (cost === null) {
    flags.push({ rule: 'size_unknown', detail: 'No total cost is recorded, so the accredited size range cannot be checked.' });
  } else if (cost > ceiling) {
    exclusions.push({
      rule: 'size_ceiling',
      detail: `Total cost USD ${cost.toLocaleString('en-US')} exceeds DFCC's accredited ceiling of `
        + `USD ${ceiling.toLocaleString('en-US')} (${accreditation.sizeCategory} size). GCF size `
        + 'categories are ceilings, so a larger project needs a differently accredited entity.',
    });
  }
  /* Deliberately no lower-bound check. GCF's accreditation size categories are
     nested ceilings, not bands: micro up to USD 10m, small up to 50m, medium up
     to 250m, large above. An entity accredited to medium may carry micro, small
     and medium projects. Flagging a project for being "below the band" would
     have flagged four of the five candidates here for a non-issue, and a flag
     that fires on nothing is a flag readers learn to skip. */

  if (project.financing?.modalityGap === true || accreditation.grantModality === false
      && /grant/i.test(project.financing?.instrument || '')) {
    flags.push({
      rule: 'modality_gap',
      detail: 'The design appears to depend on a grant element. DFCC\'s accreditation does not carry '
        + 'the grant modality, so this may not be deliverable by DFCC as the accredited entity. '
        + 'Flagged rather than excluded: misreading an accreditation scope is a serious error and '
        + 'this must be verified with DFCC or the NDA.',
    });
  }

  for (const f of project.essFlags || []) {
    flags.push({
      rule: `ess_flag:${f}`,
      detail: `Environmental and social flag "${f}" is recorded against this project and must be `
        + 'resolved in the safeguards process. It does not affect eligibility.',
    });
  }

  const band = project.taxonomy?.band;
  if (band && !['green', 'transition'].includes(band)) {
    exclusions.push({
      rule: 'taxonomy',
      detail: `Not aligned to the ${project.taxonomy.framework} taxonomy (band: ${band}).`,
    });
  }

  return {
    id: project.id,
    code: project.code,
    name: project.name,
    stream: project.stream,
    status: exclusions.length ? 'excluded' : (flags.length ? 'flagged' : 'eligible'),
    eligible: exclusions.length === 0,
    exclusions,
    flags,
  };
}

/** The whole pool through the gate. */
function screen(projects = [], { accreditation } = {}) {
  const acc = accreditation || {};
  const rows = projects.map(p => screenOne(p, { accreditation: acc }));
  return {
    accreditation: {
      decision: acc.decision || null,
      sizeCategory: acc.sizeCategory || null,
      sizeRange_usd: acc.sizeRange_usd || null,
      essCategory: acc.essCategory || null,
      grantModality: acc.grantModality ?? null,
      grantNote: acc.grantNote || null,
    },
    pool: rows.length,
    eligible: rows.filter(r => r.eligible).map(r => r.code),
    excluded: rows.filter(r => !r.eligible).map(r => r.code),
    flagged: rows.filter(r => r.eligible && r.flags.length).map(r => r.code),
    rows,
    note: 'Excluded candidates fall outside DFCC\'s accreditation scope. Flagged candidates are '
      + 'eligible subject to verification.',
  };
}

/* ── The two rankings ──────────────────────────────────────────────────── */

/** Min-max to 0-1 across the set. A set that is entirely tied scores 1 —
 *  spreading a tie across the range would invent a difference. */
function _normalise(values) {
  const present = values.filter(v => v !== null);
  if (!present.length) return values.map(() => null);
  const lo = Math.min(...present);
  const hi = Math.max(...present);
  if (hi === lo) return values.map(v => (v === null ? null : 1));
  return values.map(v => (v === null ? null : (v - lo) / (hi - lo)));
}

/**
 * The raw metrics behind the ranking, per project.
 *
 * `impact` is the one metric that differs by stream, and that difference is the
 * rule: carbon for mitigation, people for adaptation. It is decided here, once.
 */
function metricsFor(project, stream) {
  const gcfAsk = _num(project.financing?.gcfAsk);
  const totalCost = _num(project.financing?.totalCost);
  const annual = _traced(project.mitigation?.annual_tCO2e);
  const direct = _traced(project.beneficiaries?.direct);
  const perMillion = (x) => (x === null || !gcfAsk ? null : x / (gcfAsk / 1e6));

  const impact = stream === 'adaptation' ? perMillion(direct) : perMillion(annual);

  return {
    impact,
    impactMetric: stream === 'adaptation'
      ? 'direct beneficiaries per USD million of GCF ask'
      : 'annual tCO2e per USD million of GCF ask',
    impactBasis: stream === 'adaptation'
      ? 'Adaptation is never ranked on carbon. Its mitigation co-benefit is reported but is not a '
        + 'ranking input, because sorting adaptation on tCO2e per dollar defunds it systematically.'
      : 'GCF Mitigation Core Indicator 1 against the concessional ask.',
    /* Leverage is reported and used as a ranking input, but GCF sets no minimum
       co-financing requirement, so it is never a gate and never a threshold. */
    efficiency: gcfAsk && totalCost ? totalCost / gcfAsk : null,
    efficiencyMetric: 'total project cost per USD of GCF ask (mobilisation ratio)',
    countryOwnership: (project.ndcSectorTargets || []).length,
    countryOwnershipMetric: 'NDC 3.0 sector targets addressed',
    readiness: STAGE_RANK[project.stage] === undefined ? null : STAGE_RANK[project.stage] / STAGE_MAX,
    readinessMetric: `stage (${project.stage})`,
    evidence: TIER_STRENGTH[record.weakestTier(project)] ?? null,
    evidenceMetric: `weakest evidence tier (${record.weakestTier(project)})`,
  };
}

function _weights(supplied) {
  const w = { ...DEFAULT_WEIGHTS, ...(supplied || {}) };
  const keys = Object.keys(DEFAULT_WEIGHTS);
  for (const k of keys) {
    const v = _num(w[k]);
    if (v === null || v < 0) {
      const err = new Error(`Weight "${k}" must be a number of zero or more.`);
      err.statusCode = 400;
      err.code = 'INVALID_WEIGHTS';
      throw err;
    }
    w[k] = v;
  }
  const total = keys.reduce((a, k) => a + w[k], 0);
  if (total <= 0) {
    const err = new Error('At least one weight must be greater than zero.');
    err.statusCode = 400;
    err.code = 'INVALID_WEIGHTS';
    throw err;
  }
  return { weights: w, total };
}

/**
 * One stream, ranked. Never called with a mixed set.
 *
 * A criterion a project cannot supply is dropped from that project's score and
 * the weight is renormalised over what it does have, rather than the absence
 * being scored zero. Scoring absence as zero would rank a project down for a
 * field nobody filled in, which is a fact about the data entry.
 */
function rankStream(projects, stream, suppliedWeights) {
  const { weights } = _weights(suppliedWeights);
  const metrics = projects.map(p => metricsFor(p, stream));
  const keys = ['impact', 'efficiency', 'countryOwnership', 'readiness', 'evidence'];
  const weightKeyFor = k => (k === 'impact' ? 'impactPotential' : k);

  const normalised = {};
  for (const k of keys) normalised[k] = _normalise(metrics.map(m => m[k]));

  const rows = projects.map((p, i) => {
    const components = {};
    let weighted = 0;
    let weightUsed = 0;
    const missing = [];
    for (const k of keys) {
      const wk = weightKeyFor(k);
      const n = normalised[k][i];
      if (n === null) { missing.push(k); continue; }
      components[k] = {
        raw: round(metrics[i][k], 4),
        normalised: round(n),
        weight: weights[wk],
        metric: metrics[i][`${k}Metric`],
      };
      weighted += n * weights[wk];
      weightUsed += weights[wk];
    }
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      stream,
      resultsArea: p.resultsArea,
      stage: p.stage,
      score: weightUsed > 0 ? round(weighted / weightUsed) : null,
      components,
      missing,
      impactBasis: metrics[i].impactBasis,
      gcfAsk: _num(p.financing?.gcfAsk),
      totalCost: _num(p.financing?.totalCost),
    };
  });

  rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  rows.forEach((r, i) => { r.rank = i + 1; });

  return {
    stream,
    weights,
    projects: rows,
    note: stream === 'adaptation'
      ? 'Ranked on beneficiaries reached per dollar of concessional ask.'
      : 'Ranked on tCO2e per dollar of concessional ask.',
  };
}

/**
 * Both streams, screened then ranked, with the criteria this cannot score
 * named on the face of the result.
 */
function rank(projects = [], { accreditation, weights } = {}) {
  const gate = screen(projects, { accreditation });
  const eligibleIds = new Set(gate.rows.filter(r => r.eligible).map(r => r.id));
  const eligible = projects.filter(p => eligibleIds.has(p.id));

  return {
    screening: gate,
    mitigation: rankStream(eligible.filter(p => p.stream === 'mitigation'), 'mitigation', weights),
    adaptation: rankStream(eligible.filter(p => p.stream === 'adaptation'), 'adaptation', weights),
    criteria: {
      scored: GCF_CRITERIA.filter(c => c.scored),
      notScored: GCF_CRITERIA.filter(c => !c.scored),
      note: 'Three of the six GCF investment criteria require qualitative assessment outside '
        + 'this system and are reported unscored. This ranking is an input to an appraisal.',
    },
    note: 'Mitigation and adaptation are ranked on separate metrics and are not combined into a '
      + 'single list.',
  };
}

/* ── The answer ────────────────────────────────────────────────────────── */

/**
 * Which two, and why.
 *
 * The ToR asks for up to two Concept Notes. This produces the recommendation
 * with its basis, the runners-up with what would move them, and — because a
 * recommendation that hides its own limits is worth nothing to the person who
 * has to defend it — what could not be weighed.
 *
 * Stream balance is surfaced rather than enforced. GCF aims at a 50:50
 * mitigation/adaptation split across its portfolio, so two picks from one
 * stream is a choice to defend, not a neutral outcome. It is stated, and the
 * decision stays the reader's.
 */
function recommend(projects = [], { accreditation, weights, take = 2 } = {}) {
  const ranked = rank(projects, { accreditation, weights });
  const all = [...ranked.mitigation.projects, ...ranked.adaptation.projects]
    .filter(r => r.score !== null)
    .sort((a, b) => b.score - a.score);

  const n = Math.max(1, Math.min(Number(take) || 2, all.length));
  const selected = all.slice(0, n);
  const runnersUp = all.slice(n);
  const byId = new Map(projects.map(p => [p.id, p]));
  const flagsFor = id => (ranked.screening.rows.find(r => r.id === id) || {}).flags || [];

  const streams = new Set(selected.map(s => s.stream));

  return {
    take: n,
    selected: selected.map(s => {
      const p = byId.get(s.id);
      return {
        code: s.code,
        name: s.name,
        stream: s.stream,
        streamRank: s.rank,
        score: s.score,
        gcfAsk: s.gcfAsk,
        /* The record's own reasoning, kept beside the computed one. A ranking
           that cannot say why is not a decision anybody can argue with. */
        recordedReason: p?.selectionReason || null,
        computedBasis: Object.entries(s.components)
          .sort((a, b) => b[1].normalised * b[1].weight - a[1].normalised * a[1].weight)
          .slice(0, 3)
          /* Two decimals at most. A ranking basis printed as 3444.4444 reads
             as spurious precision on a figure that is a ratio of two rounded
             inputs. */
          .map(([k, c]) => `${k}: ${Number(c.raw).toLocaleString('en-US', {
            maximumFractionDigits: 2,
          })} (${c.metric})`),
        toResolve: flagsFor(s.id).map(f => f.detail),
      };
    }),
    runnersUp: runnersUp.map(r => ({
      code: r.code, name: r.name, stream: r.stream, score: r.score,
      gap: round((selected[selected.length - 1]?.score ?? 0) - r.score),
      whatWouldMoveIt: Object.entries(r.components)
        .sort((a, b) => a[1].normalised - b[1].normalised)
        .slice(0, 2)
        .map(([k, c]) => `${k} is the weakest component at ${c.normalised} of 1 (${c.metric})`),
    })),
    excluded: ranked.screening.rows.filter(r => !r.eligible)
      .map(r => ({ code: r.code, name: r.name, reasons: r.exclusions.map(e => e.detail) })),
    streamBalance: {
      streamsRepresented: [...streams],
      bothStreams: streams.size > 1,
      note: streams.size > 1
        ? 'Both streams are represented.'
        : `All ${n} selected projects are ${[...streams][0]}. GCF aims at a balanced `
          + 'mitigation/adaptation portfolio, so a single-stream selection is a choice to defend '
          + 'rather than a neutral outcome of the ranking.',
    },
    /* Where the recorded intent and the computed ranking disagree.
       They disagree on this pipeline, and that is the most useful thing the
       model has to say: somebody chose P1 and P3, the criteria that can be
       computed favour P3 and P2, and the difference is exactly where the
       unscored criteria and the sector judgement are doing the work. Hiding it
       would leave a reader with a ranking that quietly contradicted the record
       it was built from. */
    divergence: (() => {
      const recorded = projects.filter(p => p.selectedForCN).map(p => p.code).sort();
      const computed = selected.map(s => s.code).sort();
      const same = recorded.length === computed.length
        && recorded.every((c, i) => c === computed[i]);
      return {
        recordedSelection: recorded,
        computedSelection: computed,
        agree: same,
        note: same
          ? 'The recorded selection and the computed ranking agree.'
          : 'The recorded selection and the computed ranking differ. Neither is wrong on its face: '
            + 'the ranking uses only the three GCF criteria that can be computed from the record, '
            + 'and the three it cannot score — paradigm shift, needs of the recipient, sustainable '
            + 'development — are where a sector judgement legitimately overrides a score. The '
            + 'divergence is reported so it is argued rather than absorbed.',
      };
    })(),
    weights: ranked.mitigation.weights,
    notScored: ranked.criteria.notScored,
    ranking: ranked,
    limits: 'This is a recommendation from the criteria that can be computed from the recorded '
      + 'pipeline. It does not score a proposal on GCF\'s behalf, substitute for an ESIA or an FPIC '
      + 'consultation, produce the NDA no-objection letter, or confirm co-financing. Those are '
      + 'judgements and legal instruments, not fields.',
  };
}

module.exports = {
  screen, screenOne, rank, rankStream, recommend, metricsFor,
  DEFAULT_WEIGHTS, GCF_CRITERIA, STAGE_RANK, TIER_STRENGTH,
};
