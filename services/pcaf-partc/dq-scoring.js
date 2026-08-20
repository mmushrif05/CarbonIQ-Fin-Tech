/**
 * CarbonIQ FinTech — PCAF Part C: data-quality scoring
 *
 * PCAF requires a data-quality score beside any disclosed figure. A figure
 * without its score is not a conformant disclosure, so this module turns the
 * tiers and sources the engine already records into two reported scores.
 *
 * It is deliberately additive: it reads a finished result and computes over
 * it. No calculation module knows this exists, so scoring cannot change a
 * figure — which is the point, since a score that could move the number it
 * describes would be worthless.
 *
 * Two scores are reported and never blended:
 *
 *   Construction (A4 + A5)   the score attached to the PCAF figure
 *   Use stage    (B1+B4+B7)  the score attached to the separate line
 *
 * Beyond-PCAF (B2/B5/B8) is excluded from both, as it is from everything.
 *
 * The roll-up is emission-weighted rather than averaged, because that is
 * what points effort at the tonnes: improving the data behind the largest
 * contributor moves the reported score most, and a small weak module cannot
 * drag the position further than its share of the figure.
 */

'use strict';

/** Score 1 best to 5 worst. */
const RUBRIC = [
  { score: 1, meaning: 'Verified actual', evidence: 'Metered or audited, third-party assured' },
  { score: 2, meaning: 'Reported actual (unverified)', evidence: 'Client actuals: measured refrigerant charge, metered water, site fuel logs' },
  { score: 3, meaning: 'Primary quantity × published factor', evidence: 'BOQ or specification quantities × a recognised published factor (PCAF Option 2b)' },
  { score: 4, meaning: 'Benchmark with a relevant basis', evidence: 'RICS, GLA, IPCC or CIBSE benchmark applied to project data' },
  { score: 5, meaning: 'Global default or literature assumption', evidence: 'Global-tier proxy with no project or local basis' }
];

const _num = v => Number(v) || 0;
const _round1 = n => Math.round(n * 10) / 10;

/**
 * Locate a traced node by its module code.
 *
 * The breakdown on `modules.a5Breakdown` is a summary — module, label and
 * value only — so the inputs that decide a score are not there. The traced
 * tree carries them, and it is a forest rather than a single root, so the
 * walk starts from an array.
 */
function _traced(result, code) {
  let hit = null;
  const visit = node => {
    if (hit || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (node.module === code && node.inputs && Object.keys(node.inputs).length) { hit = node; return; }
    (node.children || []).forEach(visit);
  };
  visit(result.tree);
  return hit;
}

/** Value of a module or sub-module, from the summary breakdown. */
function _subValue(result, code) {
  const b = (result.modules.a5Breakdown || []).find(x => x.module === code);
  return b ? _num(b.value) : 0;
}

/**
 * Score each input the run actually consumed.
 *
 * Every score is decided by what the engine used, never fixed in advance: a
 * client fuel log scores differently from the RICS default that stands in
 * for one, and the basis text says which was taken.
 */
function scoreInputs(result) {
  const a52i = (_traced(result, 'A5.2') || {}).inputs || {};
  const b1i  = (_traced(result, 'B1') || {}).inputs || (result.modules.b1 && result.modules.b1.inputs) || {};
  const b7i  = (_traced(result, 'B7') || {}).inputs || (result.modules.b7 && result.modules.b7.inputs) || {};
  const b4i  = (_traced(result, 'B4') || {}).inputs || (result.modules.b4 && result.modules.b4.inputs) || {};

  // A5.2 used client actuals when a comparable previous project was supplied.
  // The engine records which method it took, so the score follows the
  // method actually used rather than inferring it from the inputs twice.
  const prevArea = _num(a52i.prevArea_m2);
  const prevEnergy = _num(a52i.prevFuel_L) + _num(a52i.prevElectricity_kWh);
  const a52Actuals = /client/i.test(String(a52i.method || '')) || (prevArea > 0 && prevEnergy > 0);

  // B1 charge: a measured charge, or the per-m² literature assumption.
  const chargeIsActual = String(b1i.chargeBasis || '').toLowerCase().includes('actual')
    || String(b1i.chargeBasis || '').toLowerCase().includes('measured');

  // B7 volume: metered, then client occupancy, then a figure the engine
  // derived from floor area — which is not client data and does not score
  // as if it were.
  const volBasis = String(b7i.volumeBasis || '').toLowerCase();
  const b7Metered = volBasis.includes('meter');
  const b7Occupants = volBasis.includes('client') || volBasis.includes('supplied');

  const rows = [
    { module: 'A4',   stage: 'A4', input: 'a4_quantities',    score: 3,
      basis: 'Bill of quantities — primary measured quantities',
      source: 'Client BOQ', tier: 'Local' },
    { module: 'A4',   stage: 'A4', input: 'a4_ef_distance',   score: 3,
      basis: 'Published transport factors applied over client haul distances',
      source: 'DEFRA-aligned freight factors', tier: 'Global' },

    { module: 'A5', stage: 'A5.1', input: 'a5_1_demolition',  score: 4,
      basis: 'Estimated demolition mass over a benchmark haul distance',
      source: 'Project assumption with benchmark distance', tier: 'Global' },
    { module: 'A5', stage: 'A5.2', input: 'a5_2_site_energy', score: a52Actuals ? 2 : 4,
      basis: a52Actuals
        ? 'Contractor fuel and electricity from a comparable previous project, scaled by floor area'
        : 'RICS default construction site-energy allowance per m² — no comparable project supplied',
      source: a52Actuals ? 'Client site records' : 'RICS WLCA 2nd ed', tier: a52Actuals ? 'Local' : 'Global' },
    { module: 'A5', stage: 'A5.3', input: 'a5_3_waste',       score: 4,
      basis: 'Recommended waste rates applied to BOQ quantities',
      source: 'RICS WLCA 2nd ed, Table 18', tier: 'Global' },

    { module: 'B1',   stage: 'B1', input: 'b1_charge',        score: chargeIsActual ? 2 : 5,
      basis: chargeIsActual
        ? `Measured refrigerant charge of ${_num(b1i.charge_kg)} kg`
        : `Charge of ${_num(b1i.charge_kg)} kg from a per-m² literature assumption — no design data supplied`,
      source: chargeIsActual ? 'Client plant schedule' : 'Literature assumption — not a formal standard',
      tier: chargeIsActual ? 'Local' : 'Global' },
    { module: 'B1',   stage: 'B1', input: 'b1_leak_gwp',      score: 4,
      basis: `Annual leak rate ${_num(b1i.leakRate)} and GWP ${_num(b1i.gwp)} for ${b1i.refrigerant || 'the refrigerant'}`,
      source: 'IPCC leak rates; IPCC AR5 100-year GWP', tier: 'Global' },

    { module: 'B4',   stage: 'B4', input: 'b4_service_lives', score: 4,
      basis: `Service life of ${_num(b4i.hvacServiceLife_years)} years against ${_num(b4i.useStageYears)} years of cover`,
      source: 'CIBSE Guide M / RICS-BCIS', tier: 'Global' },

    { module: 'B7',   stage: 'B7', input: 'b7_volume',        score: b7Metered ? 2 : (b7Occupants ? 3 : 5),
      basis: b7Metered
        ? 'Metered annual water volume'
        : b7Occupants
          ? 'Volume from client-supplied occupancy'
          : `Volume derived from floor area (${_round1(_num(b7i.occupants))} notional occupants) — neither a meter reading nor a supplied occupancy`,
      source: b7Metered ? 'Client meter' : 'Typical non-domestic water use benchmark',
      tier: b7Metered ? 'Local' : 'Global' },
    { module: 'B7',   stage: 'B7', input: 'b7_water_ef',      score: 5,
      basis: `Supply ${_num(b7i.supplyEF)} and wastewater ${_num(b7i.wastewaterEF)} kgCO2e/m³`,
      source: 'DEFRA (UK) — proxy, no Sri Lankan water factor exists', tier: 'Global' }
  ];

  return rows;
}

/** Emissions attributable to each module code, from the finished result. */
function moduleEmissions(result) {
  const m = result.modules;
  const val = x => x ? _num(x.value) : 0;
  return {
    A4:   val(m.a4),
    A5:   val(m.a5),
    B1:   val(m.b1),
    B4:   val(m.b4),
    B7:   val(m.b7)
  };
}

/* The spec's granularity: A5 is one module, weighted by its own emissions.
   Splitting it into A5.1/A5.2/A5.3 would weight site energy at 92% of
   construction on its own and report a different score for the same run. */
const CONSTRUCTION_MODULES = ['A4', 'A5'];
const USE_STAGE_MODULES    = ['B1', 'B4', 'B7'];

/**
 * Roll the input scores into one score per module, then weight the modules
 * by the emissions they carry.
 *
 * A module that emitted nothing is reported with its score but carries no
 * weight — it cannot move a position it did not contribute to.
 */
function _weighted(codes, byModule, emissions) {
  const rows = codes.map(code => ({
    module: code,
    score: byModule[code] ?? null,
    /* PCAF scores an instrument as a whole number, so the rounded score is
       carried for anyone presenting on that convention. The roll-up uses
       the exact mean: rounding A5's 3.3 down to 3 would report a position
       better evidenced than it is, and a disclosure must not err that way. */
    scoreRounded: byModule[code] === undefined ? null : Math.round(byModule[code]),
    emissions: Math.round(_num(emissions[code]) * 100) / 100
  })).filter(r => r.score !== null);

  const total = rows.reduce((n, r) => n + r.emissions, 0);
  for (const r of rows) {
    r.weightPct = total > 0 ? _round1((r.emissions / total) * 100) : 0;
    r.contribution = total > 0 ? Math.round(((r.emissions * r.score) / total) * 100) / 100 : 0;
  }

  return {
    rows,
    totalEmissions: Math.round(total * 100) / 100,
    weighted: total > 0
      ? _round1(rows.reduce((n, r) => n + r.emissions * r.score, 0) / total)
      : null
  };
}

/**
 * The single change that would most improve a scope's score.
 *
 * Ranked by emissions × the points that input could recover, so the answer
 * is the one worth doing rather than the easiest one.
 */
function _bestImprovement(inputs, emissions, codes) {
  const BEST = { a5_2_site_energy: 2, b1_charge: 2, b7_volume: 2 };
  const ACTION = {
    a5_2_site_energy: 'Supply contractor fuel and electricity from a comparable previous project',
    b1_charge: 'Supply the measured refrigerant charge from the plant schedule',
    b7_volume: 'Supply a metered annual water volume'
  };

  const candidates = inputs
    .filter(i => codes.includes(i.module) && BEST[i.input] !== undefined && i.score > BEST[i.input])
    .map(i => ({
      module: i.module, input: i.input,
      from: i.score, to: BEST[i.input],
      action: ACTION[i.input],
      impact: _num(emissions[i.module]) * (i.score - BEST[i.input])
    }))
    .sort((a, b) => b.impact - a.impact);

  return candidates[0] || null;
}

/**
 * Score a finished run.
 *
 * @param {Object} result runPartC() output
 * @returns {Object} rubric, per-input scores, per-module weighting and the
 *                   two reported scores
 */
function scoreRun(result) {
  const inputs = scoreInputs(result);
  const emissions = moduleEmissions(result);

  // module_score(m) = mean of the input scores belonging to m
  const byModule = {};
  for (const code of [...CONSTRUCTION_MODULES, ...USE_STAGE_MODULES]) {
    const mine = inputs.filter(i => i.module === code);
    if (mine.length) byModule[code] = _round1(mine.reduce((n, i) => n + i.score, 0) / mine.length);
  }

  const construction = _weighted(CONSTRUCTION_MODULES, byModule, emissions);
  const useStageApplies = _num(result.policy && result.policy.useStageYears) > 0;
  const useStage = _weighted(USE_STAGE_MODULES, byModule, emissions);

  /* Under construction-only cover the use-stage modules never ran, so the
     engine holds zeros for their inputs. Printing "charge of 0 kg from a
     literature assumption" would read as a measurement of nothing rather
     than a module the scope rule excluded, so the row says which. The score
     is kept — it is what this input would score were the cover to extend —
     but it is marked as carrying no weight. */
  if (!useStageApplies) {
    for (const row of inputs) {
      if (!USE_STAGE_MODULES.includes(row.module)) continue;
      row.applies = false;
      row.basis = 'Not evaluated — the scope rule closes the use stage for construction-only cover';
      row.source = 'PCAF Part C v2 §5.3 policy gate';
      row.tier = 'n/a';
    }
  }

  return {
    rubric: RUBRIC,
    scale: '1 best, 5 worst.',
    basis: 'module_score = mean of its input scores; scope score = Σ(module emissions × module score) ÷ Σ(module emissions).',
    whyWeighted: 'Weighting by emissions points effort at the tonnes: improving the data behind the largest contributor moves the reported score most, and a small weak module cannot drag the position beyond its share.',
    rounding: 'Module scores are the exact mean of their input scores. Rounding each to a whole number first, as PCAF scores a whole instrument, would report a slightly better position — so the exact mean is what is disclosed and the rounded score is carried alongside for presentation.',
    inputs,
    byModule,
    construction: {
      label: 'Construction (A4 + A5) — the PCAF figure',
      ...construction,
      improvement: _bestImprovement(inputs, emissions, CONSTRUCTION_MODULES)
    },
    useStage: {
      label: 'Use stage (B1 + B4 + B7) — reported separately',
      applies: useStageApplies,
      ...(useStageApplies ? useStage : { rows: useStage.rows, totalEmissions: 0, weighted: null }),
      notApplicableNote: useStageApplies ? null
        : 'Not applicable to this policy type (scope rule) — construction-only cover carries no use stage.',
      improvement: useStageApplies ? _bestImprovement(inputs, emissions, USE_STAGE_MODULES) : null
    },
    excluded: 'Beyond-PCAF modules (B2, B5, B8) are excluded from both scores, as they are from the reported figures.'
  };
}

/* What each weak input actually means for a reader of the disclosure. */
const LIMITATION_TEXT = {
  a5_1_demolition:  'demolition mass estimated against a benchmark haul distance',
  a5_2_site_energy: 'RICS default site-energy allowance in place of contractor records',
  a5_3_waste:       'RICS default waste rates in place of site waste records',
  b1_charge:        'refrigerant charge from a per-m\u00b2 literature assumption where design data is unavailable',
  b1_leak_gwp:      'IPCC default leak rates with AR5 100-year GWP',
  b4_service_lives: 'CIBSE and RICS-BCIS default service lives',
  b7_volume:        'water volume derived from floor area rather than metered or from supplied occupancy',
  b7_water_ef:      'DEFRA water factors used as a proxy pending Sri Lankan values'
};

/**
 * The disclosure statement, generated from the execution.
 *
 * Claims conformance and never endorsement: PCAF does not approve or
 * certify software, and the wording must not imply that it does.
 */
function disclosureStatement(result, scoring) {
  const s = result.summary;
  const t = n => (_num(n) / 1000).toFixed(3);
  const opt = (result.dataQuality && result.dataQuality.option) || 'n/a';

  const parts = [
    `Calculated in conformance with ${result.standard} Section 5.3.`,
    `Construction emissions (A4+A5) = ${t(s.construction_kgCO2e)} tCO2e, Option ${opt}, weighted data quality score ${scoring.construction.weighted} of 5.`
  ];

  parts.push(scoring.useStage.applies
    ? `Use-stage emissions (B1+B4+B7) = ${t(s.useStage_kgCO2e)} tCO2e reported separately, weighted data quality score ${scoring.useStage.weighted} of 5.`
    : 'Use-stage emissions (B1+B4+B7) are not applicable to this policy type (scope rule).');

  // Limitations named from the inputs that scored weakest, so the sentence
  // cannot claim a cleaner position than the run actually holds. Each weak
  // input maps to the limitation a reader needs — the substitution that was
  // made — rather than to its bare citation, which would read as a
  // bibliography instead of a disclosure.
  const weak = scoring.inputs
    .filter(i => i.score >= 4 && i.applies !== false)
    .filter(i => scoring.useStage.applies || !USE_STAGE_MODULES.includes(i.module));

  const limitations = [];
  const add = text => { if (text && !limitations.includes(text)) limitations.push(text); };

  if (scoring.inputs.some(i => i.tier === 'Global' && i.applies !== false)) {
    add('Global-tier default factors where no Sri Lankan value exists');
  }
  for (const i of weak) add(LIMITATION_TEXT[i.input]);

  if (limitations.length) parts.push(`Limitations disclosed: ${limitations.join(', ')}.`);

  return parts.join(' ');
}

module.exports = {
  RUBRIC, scoreRun, scoreInputs, moduleEmissions, disclosureStatement,
  CONSTRUCTION_MODULES, USE_STAGE_MODULES
};
