/**
 * CarbonIQ FinTech — PCAF Part C: the data-quality position of a run
 *
 * PCAF assigns ONE score per project and decides it by WHICH OPTION was used
 * to estimate the emissions (Table 5.3-2, p.58). It is not an average of
 * anything — not across inputs, not across modules, not across lifecycle
 * stages. An earlier version of this file averaged per-input scores and then
 * weighted them by emissions. Both of those were inventions; neither is in
 * the standard, and the result was a number that looked like a PCAF score
 * and was not one.
 *
 * What this module does, therefore, is small and deliberate:
 *
 *   It reads the option the engine recorded and reports its score.
 *
 *   It gives the two reported scopes their own option, because Chapter 6
 *   (p.106) requires the score for scope 3 to be reported separately from
 *   the score for scopes 1 and 2, and in a construction estimate the two are
 *   genuinely built from different data — site energy from energy
 *   consumption, everything else from declared quantities.
 *
 *   It does NOT score the optional use stage. Table 5.3-2 covers
 *   construction emissions, and PCAF publishes no data-quality table for
 *   lifetime emissions on project insurance. A number invented to fill that
 *   gap would be worse than the gap: it would be read as a PCAF score. The
 *   basis is described in words instead.
 *
 *   It keeps a per-input basis table as an internal aid for targeting
 *   effort, expressed in words — Strong, Moderate, Weak — so it can never be
 *   mistaken for, averaged into, or exported as the PCAF score.
 *
 * The scale is a category, 1 = highest quality to 5 = lowest. Never render
 * it as "3 / 5": that reads as a mark out of five and inverts the meaning.
 */

'use strict';

const {
  OPTION_SCORES, OPTION_LABELS, TABLE_5_3_2, SCALE_NOTE, TABLE_CITATION
} = require('./data-quality');
const {
  SCOPE_1_2, SCOPE_3, SCOPE_OF, SCOPE_META,
  CONSTRUCTION_STAGES, USE_STAGE_STAGES, stageEmissions
} = require('./ghg-scopes');

const _num = v => Number(v) || 0;

/** Two decimals, as the disclosure prints them. */
const _dp2 = n => (n === null || n === undefined) ? null : Math.round(Number(n) * 100) / 100;

// ---------------------------------------------------------------------------
// Reading the run
// ---------------------------------------------------------------------------

/**
 * Locate a traced node by its module code.
 *
 * The breakdown on `modules.a5Breakdown` is a summary — module, label and
 * value only — so the inputs that decide a basis are not there. The traced
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

/** Did A5.2 rest on the client's own energy consumption, or on a benchmark? */
function _siteEnergyFromConsumption(result) {
  const i = (_traced(result, 'A5.2') || {}).inputs || {};
  const prevArea = _num(i.prevArea_m2);
  const prevEnergy = _num(i.prevFuel_L) + _num(i.prevElectricity_kWh);
  return /client/i.test(String(i.method || '')) || (prevArea > 0 && prevEnergy > 0);
}

// ---------------------------------------------------------------------------
// The scores
// ---------------------------------------------------------------------------

const STRONG = 'Strong', MODERATE = 'Moderate', WEAK = 'Weak';

/**
 * The option behind each reported scope, and therefore its score.
 *
 * A5.2 is the insured's scope 1 and 2. Where the client supplied fuel and
 * electricity it is energy consumption x emission factor — Option 2a. Where
 * it fell back to a per-m2 allowance it is a declared quantity (floor area
 * built) x emission factor, which footnote 54 places under Option 2b.
 *
 * A4, A5.1 and A5.3 are the insured's scope 3 and are always declared
 * construction quantities x emission factor: Option 2b.
 */
function scopeOptions(result) {
  const projectOption = (result.dataQuality && result.dataQuality.option) || '2b';

  // An override or a reported-emissions path governs the whole project.
  const projectWide = ['1a', '1b', '3a', '3b'].includes(projectOption);

  const s12 = projectWide ? projectOption
    : (_siteEnergyFromConsumption(result) ? '2a' : '2b');
  const s3  = projectWide ? projectOption : '2b';

  const cap = (result.dataQuality && result.dataQuality.annualBasis) ? 4 : 5;
  const mk = (key, option) => ({
    ...SCOPE_META[key],
    option,
    optionLabel: OPTION_LABELS[option],
    score: Math.min(OPTION_SCORES[option], cap)
  });

  return { [SCOPE_1_2]: mk(SCOPE_1_2, s12), [SCOPE_3]: mk(SCOPE_3, s3) };
}

/**
 * The basis of every input the run consumed, in words.
 *
 * This is an internal transparency aid. It says where effort would pay, and
 * it responds to whether an actual or a benchmark was used — but it carries
 * no number, is never averaged, and is never presented as a PCAF score.
 */
function inputBasis(result) {
  const a52i = (_traced(result, 'A5.2') || {}).inputs || {};
  const b1i  = (_traced(result, 'B1') || {}).inputs || {};
  const b7i  = (_traced(result, 'B7') || {}).inputs || {};
  const b4i  = (_traced(result, 'B4') || {}).inputs || {};

  const a52Actuals = _siteEnergyFromConsumption(result);
  const chargeBasis = String(b1i.chargeBasis || '').toLowerCase();
  const chargeIsActual = chargeBasis.includes('actual') || chargeBasis.includes('measured');
  const volBasis = String(b7i.volumeBasis || '').toLowerCase();
  const b7Metered = volBasis.includes('meter');
  const b7Occupants = volBasis.includes('client') || volBasis.includes('supplied');

  const rows = [
    { stage: 'A4', input: 'Material quantities', strength: STRONG,
      basis: 'Bill of quantities — measured quantities for the project',
      source: 'Client BOQ' },
    { stage: 'A4', input: 'Transport factors and haul distances', strength: MODERATE,
      basis: 'Published freight factors applied over client-stated haul distances',
      source: 'DEFRA-aligned freight factors' },

    { stage: 'A5.1', input: 'Demolition mass and haul', strength: WEAK,
      basis: 'Estimated demolition mass over a benchmark haul distance',
      source: 'Project assumption with benchmark distance' },
    { stage: 'A5.2', input: 'Site energy', strength: a52Actuals ? STRONG : WEAK,
      basis: a52Actuals
        ? 'Contractor fuel and electricity from a comparable previous project, normalised and scaled by floor area'
        : 'RICS default construction site-energy allowance per m2 — no comparable project supplied',
      source: a52Actuals ? 'Client site records' : 'RICS WLCA 2nd ed' },
    { stage: 'A5.3', input: 'Waste rates', strength: MODERATE,
      basis: 'Recommended waste rates applied to BOQ quantities',
      source: 'RICS WLCA 2nd ed, Table 18' },

    { stage: 'B1', input: 'Refrigerant charge', strength: chargeIsActual ? STRONG : WEAK,
      basis: chargeIsActual
        ? `Measured refrigerant charge of ${_num(b1i.charge_kg)} kg`
        : 'Charge from a per-m2 literature assumption — no HVAC design data supplied',
      source: chargeIsActual ? 'Client plant schedule' : 'Literature assumption — not a formal standard' },
    { stage: 'B1', input: 'Leak rate and GWP', strength: MODERATE,
      basis: `Annual leak rate ${_num(b1i.leakRate)} and 100-year GWP ${_num(b1i.gwp)} for ${b1i.refrigerant || 'the refrigerant'}`,
      source: 'IPCC 2019 leak rates; IPCC AR5 100-year GWP' },
    { stage: 'B4', input: 'Service lives', strength: MODERATE,
      basis: `Service life of ${_num(b4i.hvacServiceLife_years)} years against ${_num(b4i.useStageYears)} years of cover`,
      source: 'CIBSE Guide M / RICS-BCIS' },
    { stage: 'B7', input: 'Water volume', strength: b7Metered ? STRONG : b7Occupants ? MODERATE : WEAK,
      basis: b7Metered ? 'Metered annual water volume'
        : b7Occupants ? 'Volume from client-supplied occupancy'
          : 'Volume derived from floor area — neither a meter reading nor a supplied occupancy',
      source: b7Metered ? 'Client meter' : 'Typical non-domestic water use benchmark' },
    { stage: 'B7', input: 'Water emission factors', strength: WEAK,
      basis: `Supply ${_num(b7i.supplyEF)} and wastewater ${_num(b7i.wastewaterEF)} kgCO2e/m3`,
      source: 'DEFRA (UK) — proxy, no Sri Lankan water factor exists' }
  ];

  const useStageApplies = _num(result.policy && result.policy.useStageYears) > 0;
  for (const r of rows) {
    r.ghgScope = SCOPE_OF[r.stage] || null;
    r.line = USE_STAGE_STAGES.includes(r.stage) ? 'useStage' : 'construction';
    if (r.line === 'useStage' && !useStageApplies) {
      r.applies = false;
      r.strength = null;
      r.basis = 'Not evaluated — the scope rule closes the use stage for construction-only cover';
      r.source = 'PCAF Part C v2 §5.3 policy gate';
    }
  }
  return rows;
}

/**
 * The use stage, described rather than scored.
 *
 * Table 5.3-2 covers construction emissions. PCAF publishes no data-quality
 * table for optional lifetime emissions on project insurance, so no number
 * is produced here and none should be produced anywhere downstream.
 */
function useStageBasis(result, rows) {
  const applies = _num(result.policy && result.policy.useStageYears) > 0;
  if (!applies) {
    return {
      scored: false,
      applies: false,
      reason: 'Not applicable to this policy type (scope rule) — construction-only cover carries no use stage.',
      statements: []
    };
  }
  return {
    scored: false,
    applies: true,
    reason: 'PCAF provides no data quality table for optional lifetime (use stage) emissions on project insurance, so the basis is described qualitatively rather than scored.',
    statements: rows
      .filter(r => r.line === 'useStage' && r.applies !== false)
      .map(r => `${r.stage} ${r.input}: ${r.basis} (${r.source}).`)
  };
}

/**
 * Score a finished run.
 *
 * @param {Object} result runPartC() output
 */
function scoreRun(result) {
  const dq = result.dataQuality || {};
  const option = dq.option || '2b';
  const score = dq.score !== undefined ? dq.score : OPTION_SCORES[option];
  const rows = inputBasis(result);
  const scopes = scopeOptions(result);
  const em = stageEmissions(result);

  return {
    standard: TABLE_CITATION,
    scale: SCALE_NOTE,
    direction: 'A lower score is better. A falling score over time is an improvement.',

    /* The reported figure's score: one per project, by option. */
    construction: {
      label: 'Construction (A4 + A5) — the PCAF figure',
      option,
      optionLabel: OPTION_LABELS[option],
      score,
      scoreText: `Data quality score: ${score} (Option ${option})`,
      basis: 'Assigned from the option used to estimate the emissions, per Table 5.3-2. Not an average of anything.',
      overridden: !!(result.dataQuality && result.dataQuality.optionOverridden),
      emissions_kgCO2e: Math.round(_num(result.summary.construction_kgCO2e) * 100) / 100
    },

    /* Chapter 6 p.106: where scope 3 is reported, its score is reported
       separately from the score for scopes 1 and 2. */
    byGhgScope: {
      [SCOPE_1_2]: {
        ...scopes[SCOPE_1_2],
        stages: CONSTRUCTION_STAGES.filter(st => SCOPE_OF[st] === SCOPE_1_2),
        emissions_kgCO2e: Math.round(
          CONSTRUCTION_STAGES.filter(st => SCOPE_OF[st] === SCOPE_1_2)
            .reduce((n, st) => n + _num(em[st]), 0) * 100) / 100
      },
      [SCOPE_3]: {
        ...scopes[SCOPE_3],
        stages: CONSTRUCTION_STAGES.filter(st => SCOPE_OF[st] === SCOPE_3),
        emissions_kgCO2e: Math.round(
          CONSTRUCTION_STAGES.filter(st => SCOPE_OF[st] === SCOPE_3)
            .reduce((n, st) => n + _num(em[st]), 0) * 100) / 100
      },
      note: 'Reported separately because the standard requires it and because the two rest on different data: site energy on energy consumption, the rest on declared quantities.'
    },

    /* No number here, by design. */
    useStage: useStageBasis(result, rows),

    table: TABLE_5_3_2,

    internalAid: {
      title: 'Internal transparency aid — not a PCAF data quality score',
      note: 'Where the evidence behind each input is strong or weak, so effort can be aimed. Expressed in words precisely so it cannot be mistaken for, averaged into, or exported as the PCAF score, which is the single figure above.',
      strengths: [STRONG, MODERATE, WEAK],
      rows
    },

    /* Premium weighting is a portfolio operation; a single policy's weighted
       score is its own score. The roll-up does it across a book. */
    portfolioBasis: 'Across policies the disclosed score is premium-weighted: sum(premium x score) / sum(premium), per Box 6-3 (p.107). Treaty reinsurance substitutes ceded premium (Box 6-4, p.108).',
    singlePolicyWeighted: _dp2(score)
  };
}

/**
 * The disclosure statement, generated from the execution.
 *
 * Claims conformance and never endorsement: PCAF does not approve or certify
 * software, and the wording must not imply that it does.
 */
function disclosureStatement(result, scoring) {
  const s = result.summary;
  const t = n => (_num(n) / 1000).toFixed(3);
  const c = scoring.construction;

  const parts = [
    `Calculated in conformance with the ${result.standard} (2nd ed., December 2025).`,
    `Construction emissions (A4+A5, scope 1 and 2 combined with scope 3 reported separately) = ${t(s.construction_kgCO2e)} tCO2e, estimated using Option ${c.option} (Table 5.3-2), data quality score ${c.score} on a scale where 1 is the highest quality and 5 the lowest.`
  ];

  parts.push(scoring.useStage.applies
    ? `Optional lifetime (use stage) emissions = ${t(s.useStage_kgCO2e)} tCO2e are reported separately; PCAF provides no data quality table for use-stage emissions in project insurance, so the basis is described qualitatively rather than scored.`
    : 'Optional lifetime (use stage) emissions are not applicable to this policy type (scope rule).');

  const limitations = [];
  const add = text => { if (text && !limitations.includes(text)) limitations.push(text); };
  if (scoring.internalAid.rows.some(r => r.applies !== false && r.strength === WEAK)) {
    for (const r of scoring.internalAid.rows) {
      if (r.applies === false || r.strength !== WEAK) continue;
      add(LIMITATION_TEXT[`${r.stage}:${r.input}`]);
    }
  }
  add('Global-tier transport and grid factors');
  if (limitations.length) parts.push(`Limitations disclosed: ${limitations.join('; ')}.`);

  return parts.join(' ');
}

/** What each weak input means for a reader of the disclosure. */
const LIMITATION_TEXT = {
  'A5.1:Demolition mass and haul': 'demolition mass estimated against a benchmark haul distance',
  'A5.2:Site energy': 'RICS default site-energy allowance in place of contractor records',
  'B1:Refrigerant charge': 'refrigerant charge from a per-m2 literature assumption where HVAC design data is unavailable',
  'B7:Water volume': 'water volume derived from floor area rather than metered or from supplied occupancy',
  'B7:Water emission factors': 'DEFRA water factors used as a proxy pending Sri Lankan values'
};

module.exports = {
  scoreRun, scopeOptions, inputBasis, useStageBasis, disclosureStatement,
  STRONG, MODERATE, WEAK, TABLE_5_3_2, SCALE_NOTE, OPTION_SCORES,
  CONSTRUCTION_MODULES: ['A4', 'A5'], USE_STAGE_MODULES: ['B1', 'B4', 'B7']
};
