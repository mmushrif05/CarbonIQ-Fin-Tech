/**
 * CarbonIQ FinTech — PCAF Part C: the insured's GHG scopes
 *
 * PCAF's Part C disclosure checklist asks for two things this engine did not
 * previously distinguish: absolute emissions for the insured's **scope 1 and
 * 2 combined**, with the insured's **scope 3 reported separately**, and a
 * data-quality score for each of those, reported separately (checklist,
 * ABSOLUTE EMISSIONS pp.104-105 and DATA AND DATA QUALITY p.106).
 *
 * That is a different cut of the same figures from the lifecycle cut the
 * engine already reports. A4 and A5 are lifecycle stages; scope 1, 2 and 3
 * are ownership boundaries. One module can only sit in one place under each
 * cut, so the mapping is declared once here and both the emissions split and
 * the score split read it. Declaring it twice is how a report ends up
 * stating a total in one section that its own data-quality section
 * contradicts.
 *
 * Two things this module is careful about:
 *
 *   The scopes below are the **insured's**, not the insurer's. Every figure
 *   in a Part C disclosure is the re/insurer's own scope 3 — that is what
 *   insurance-associated emissions are. Naming the insured's scope 1 and 2
 *   does not move anything into the insurer's scope 1 or 2, and the report
 *   says so wherever the split appears.
 *
 *   A5.2 combines diesel burned on site (scope 1) with purchased grid
 *   electricity (scope 2) in a single per-m2 rate, so the two cannot be
 *   separated from the engine's output. That is not a limitation here: the
 *   checklist asks for scope 1 and 2 **combined**, which is exactly what the
 *   rate gives.
 */

'use strict';

const SCOPE_1_2 = 'scope1and2';
const SCOPE_3   = 'scope3';

/**
 * Stage to GHG scope, with the reason each sits where it does.
 *
 * `stage` matches the codes the engine reports: A4, A5.1, A5.2, A5.3 for
 * construction and B1, B4, B7 for the use stage.
 */
const STAGE_SCOPE = [
  { stage: 'A4',   ghgScope: SCOPE_3,
    basis: 'Upstream transport of purchased materials to site — GHG Protocol scope 3 category 4.' },
  { stage: 'A5.1', ghgScope: SCOPE_3,
    basis: 'Transport of demolition arisings off site — scope 3, upstream transport.' },
  { stage: 'A5.2', ghgScope: SCOPE_1_2,
    basis: 'Site plant fuel burned on site (scope 1) with purchased grid electricity (scope 2). The engine derives both from one per-m2 rate, so they are reported combined, which is the form the checklist asks for.' },
  { stage: 'A5.3', ghgScope: SCOPE_3,
    basis: 'Construction waste and its treatment — scope 3 category 5, waste generated in operations.' },
  { stage: 'B1',   ghgScope: SCOPE_1_2,
    basis: 'Fugitive refrigerant from equipment the insured owns and operates — scope 1.' },
  { stage: 'B4',   ghgScope: SCOPE_1_2,
    basis: 'Refrigerant released when owned plant is replaced within the cover period — scope 1, fugitive.' },
  { stage: 'B7',   ghgScope: SCOPE_3,
    basis: 'Water supplied and wastewater treated by a third party — scope 3, purchased services.' }
];

const SCOPE_OF = Object.fromEntries(STAGE_SCOPE.map(s => [s.stage, s.ghgScope]));

const SCOPE_META = {
  [SCOPE_1_2]: {
    key: SCOPE_1_2,
    label: 'Insured scope 1 and 2 (combined)',
    short: 'Scope 1 & 2',
    note: 'Direct emissions and purchased energy of the insured party. PCAF Part C requires these combined as the headline absolute figure.'
  },
  [SCOPE_3]: {
    key: SCOPE_3,
    label: 'Insured scope 3',
    short: 'Scope 3',
    note: 'Value-chain emissions of the insured party, reported separately from scope 1 and 2 and never merged with them.'
  }
};

/** Whose scope this whole inventory is, whatever the insured's split. */
const INSURER_NOTE =
  'Every figure in this disclosure is the re/insurer\'s own scope 3: that is what an ' +
  'insurance-associated emission is. The scope 1, 2 and 3 split below is the insured ' +
  'party\'s, disclosed because PCAF Part C requires the insured\'s scope 1 and 2 combined ' +
  'as the headline figure with the insured\'s scope 3 reported separately. Naming the ' +
  'insured\'s scope 1 and 2 moves nothing into the re/insurer\'s scope 1 or 2.';

/** Emissions by stage, as the engine reported them. */
function stageEmissions(result) {
  const m = result.modules;
  const val = x => (x ? Number(x.value) || 0 : 0);
  const sub = code => {
    const b = (m.a5Breakdown || []).find(x => x.module === code);
    return b ? Number(b.value) || 0 : 0;
  };
  return {
    A4:     val(m.a4),
    'A5.1': sub('A5.1'),
    'A5.2': sub('A5.2'),
    'A5.3': sub('A5.3'),
    B1:     val(m.b1),
    B4:     val(m.b4),
    B7:     val(m.b7)
  };
}

const CONSTRUCTION_STAGES = ['A4', 'A5.1', 'A5.2', 'A5.3'];
const USE_STAGE_STAGES    = ['B1', 'B4', 'B7'];

const _r2 = n => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Split a finished run into the insured's scope 1 and 2 combined, and the
 * insured's scope 3, on each of the two reported lines.
 *
 * @param {Object} result runPartC() output
 * @returns {Object} construction and useStage, each carrying both scopes and
 *                   the stages behind them
 */
function splitByGhgScope(result) {
  return splitStageTotals(
    stageEmissions(result),
    (Number(result.policy && result.policy.useStageYears) || 0) > 0);
}

/**
 * The same split from stage totals alone.
 *
 * A portfolio has no single traced tree — its stage totals are sums across
 * locked assessments — but the split must be identical to a per-run one or
 * the annual disclosure and the assessment behind it would state different
 * scope 1 and 2 figures for the same emissions.
 *
 * @param {Object} em stage code to kgCO2e
 * @param {boolean} useStageApplies
 */
function splitStageTotals(em, useStageApplies) {
  const line = (stages, applies) => {
    const out = {};
    for (const key of [SCOPE_1_2, SCOPE_3]) {
      const mine = stages.filter(st => SCOPE_OF[st] === key);
      out[key] = {
        ...SCOPE_META[key],
        stages: mine.map(st => ({
          stage: st,
          kgCO2e: _r2(em[st]),
          basis: STAGE_SCOPE.find(s => s.stage === st).basis
        })),
        kgCO2e: _r2(mine.reduce((n, st) => n + em[st], 0)),
        applies
      };
    }
    out.applies = applies;
    out.total_kgCO2e = _r2(out[SCOPE_1_2].kgCO2e + out[SCOPE_3].kgCO2e);
    return out;
  };

  return {
    construction: line(CONSTRUCTION_STAGES, true),
    useStage: line(USE_STAGE_STAGES, useStageApplies),
    insurerNote: INSURER_NOTE,
    stageBasis: STAGE_SCOPE
  };
}

module.exports = {
  SCOPE_1_2, SCOPE_3, SCOPE_OF, SCOPE_META, STAGE_SCOPE, INSURER_NOTE,
  CONSTRUCTION_STAGES, USE_STAGE_STAGES,
  stageEmissions, splitByGhgScope, splitStageTotals
};
