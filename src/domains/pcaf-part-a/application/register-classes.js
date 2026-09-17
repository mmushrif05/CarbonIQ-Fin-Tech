// @ts-check
/**
 * The classes one exposure register holds, and how each reaches it.
 *
 * Part A is built asset class by asset class and every engine answers in its
 * own shape — §5.1 and §5.2 share the corporate machinery and return the
 * seven reporting lines directly; the property engine returns the building's
 * energy and its financed scope 1 and 2 with construction apart; the project
 * engine returns the attributed project scopes and an impact block that must
 * never touch the inventory. A register that held five shapes would need five
 * roll-ups, five projections and five screens, and the consolidated position
 * would be reading five vocabularies for one figure.
 *
 * So each class registers three things here: the **engine** that computes;
 * the **preparation** the application layer does on the way in (the sector
 * band for §5.2, the registry's grid and building factors for §5.4/§5.5); and
 * an **adapter** that lays the engine's result out in the register's one
 * shape — `exposure`, `attribution`, `inventory` with the seven lines and the
 * two data-quality scores, `validation` — while keeping the engine's own
 * result whole under `native`, because the adapter re-states nothing: every
 * line it carries is the engine's own traced value, moved and never
 * recomputed. The stored projection, the roll-up, the recomputation movement
 * and the screen read the one shape; a reader who wants the building's kWh
 * or the project's avoided emissions opens `native`.
 *
 * What is deliberately NOT here: a class does not get a data-quality table
 * from another (each engine scores on its own table), and no class's rows are
 * ever rolled up with another's — `bind()` gives the roll-up the class's own
 * label, groupings and target note, and the register rolls each class alone.
 * The engines never import one another; this module is the one place they
 * are named side by side, and it sits in the application layer for that
 * reason.
 */

'use strict';

const { assessBusinessLoan, STANDARD: STANDARD_BL } = require('../domain/business-loans');
const { assessListedEquity, STANDARD: STANDARD_LE } = require('../domain/listed-equity');
const { assessRealEstate, STANDARD: STANDARD_RE } = require('../domain/real-estate');
const { assessMotorVehicles, STANDARD: STANDARD_MV } = require('../domain/motor-vehicles');
const parta = require('../domain');
const { traced, absent } = require('../domain/provenance');
const { withSectorBand } = require('./plausibility');
const { withPropertyFactors } = require('./property-factors');
const { withVehicleFactors } = require('./vehicle-factors');

const r2 = n => +Number(n).toFixed(2);
const num = v => typeof v === 'number' && Number.isFinite(v);

/** The seven lines in the order the register, the projection and the screen read them. */
const LINES = ['scope1', 'scope2', 'scope1And2', 'scope3', 'removals', 'creditsRetired', 'creditsGenerated'];

const clean = note => ({ verdict: 'clean', findings: [], note });

const notApplicable = (what, section) => absent(what,
  `Not a reporting line of ${section}: the engine carries no such figure and none is invented.`,
  `PCAF Part A Third Edition ${section}`);

// ---------------------------------------------------------------------------
// §5.4 / §5.5 — the property engine's result, laid out on the seven lines
// ---------------------------------------------------------------------------

function adaptRealEstate(native, input, assetClass) {
  const inv = native.inventory;
  const s12 = inv.financedScope1And2;
  const cp = input.counterparty || {};
  const outstanding = Number(input.exposure && input.exposure.outstanding);
  const section = native.property.section;
  const scope1And2 = traced({
    value: s12.combined, unit: 'tCO2e',
    equation: 'financed scope 1 and 2 = financed scope 1 + financed scope 2',
    inputs: { financed_scope1_tCO2e: s12.scope1.value, financed_scope2_tCO2e: s12.scope2.value },
    basis: s12.scope1.basis,
    reference: `PCAF Part A Third Edition ${section} — reported combined at minimum, the split carried`,
  });
  return {
    standard: native.standard,
    assetClass,
    exposure: {
      identifiers: input.identifiers || {},
      counterparty: {
        name: cp.name || null,
        /* The building type stands where a borrower's sector stands: it is
           what a property book is grouped by. */
        sector: native.property.buildingType || null,
        borrowerType: null, naceL2: null, financialInstitution: false,
      },
      kind: assetClass,
      instrument: input.productType || (assetClass === 'mortgages' ? 'mortgage' : 'property-loan'),
      reportingYear: input.reportingYear ? Number(input.reportingYear) : null,
      outstanding: { value: num(outstanding) ? outstanding : null, unit: (input.exposure && input.exposure.currency) || 'LKR', asOf: input.exposure && input.exposure.asOf },
      country: native.property.country,
      buildingType: native.property.buildingType,
    },
    denominator: native.denominator.valueAtOrigination
      ? { value: native.denominator.valueAtOrigination.value, equation: native.denominator.valueAtOrigination.equation || 'property value at origination', assumptions: native.denominator.valueAtOrigination.assumptions || [], state: native.denominator.state }
      : null,
    attribution: native.attribution,
    inventory: {
      scope1: s12.scope1,
      scope2: s12.scope2,
      scope1And2,
      scope3: inv.constructionScope3,
      removals: notApplicable('Financed emission removals', section),
      creditsRetired: notApplicable('Carbon credits retired', section),
      creditsGenerated: notApplicable('Carbon credits generated', section),
      dataQuality: {
        scope1And2: inv.dataQuality,
        scope3: { absent: true, reason: 'Construction emissions are a developer-declared figure carried apart as scope 3 category 15; the property tables (5.4-1 / 5.5-1) score the building’s operational energy only, so no scope 3 score is invented.' },
        scale: inv.dataQuality.scale,
      },
      economicIntensity_tCO2e_per_M: num(outstanding) && outstanding > 0 ? r2(s12.combined / (outstanding / 1e6)) : null,
      separation: `Financed scope 1 and 2 are the building’s operational emissions attributed on the origination value; construction emissions are scope 3 category 15 and are never summed with them (${section}).`,
      category: inv.category,
    },
    validation: clean('No data-truth checks are defined for this class yet; the engine refuses what the standard refuses.'),
    financialSector: false,
    provisional: native.provisional,
    native,
  };
}

// ---------------------------------------------------------------------------
// §5.6 — the vehicle engine's result on the seven lines; the vehicles kept under native
// ---------------------------------------------------------------------------

function adaptMotorVehicles(native, input) {
  const inv = native.inventory;
  const s12 = inv.financedScope1And2;
  const cp = input.counterparty || {};
  const outstanding = Number(input.exposure && input.exposure.outstanding);
  const scope1And2 = traced({
    value: s12.combined, unit: 'tCO2e',
    equation: 'financed scope 1 and 2 = financed scope 1 + financed scope 2',
    inputs: { financed_scope1_tCO2e: s12.scope1.value, financed_scope2_tCO2e: s12.scope2.value },
    basis: s12.scope1.basis,
    reference: 'PCAF Part A Third Edition §5.6 — reported combined at minimum, the split carried',
  });
  return {
    standard: native.standard,
    assetClass: 'motor-vehicle-loans',
    exposure: {
      identifiers: input.identifiers || {},
      counterparty: {
        name: cp.name || null,
        /* The vehicle class stands where a borrower's sector stands. */
        sector: native.facility.vehicleClasses.join(' + ') || null,
        borrowerType: null, naceL2: null, financialInstitution: false,
      },
      kind: 'motor-vehicle-loans',
      instrument: native.facility.productType,
      reportingYear: input.reportingYear ? Number(input.reportingYear) : null,
      outstanding: { value: num(outstanding) ? outstanding : null, unit: (input.exposure && input.exposure.currency) || 'LKR', asOf: input.exposure && input.exposure.asOf },
      country: native.facility.country,
      vehicles: native.facility.vehicles,
    },
    denominator: native.denominator.value !== null
      ? { value: native.denominator.value, equation: 'total value at origination (§5.6, p.91)', assumptions: [], state: native.denominator.state }
      : { value: null, equation: 'value at origination unknown — 100 % attribution assumed (§5.6, p.91)', assumptions: native.attribution.assumptions || [], state: native.denominator.state },
    attribution: native.attribution,
    inventory: {
      scope1: s12.scope1,
      scope2: s12.scope2,
      scope1And2,
      scope3: inv.productionScope3,
      removals: notApplicable('Financed emission removals', '§5.6'),
      creditsRetired: notApplicable('Carbon credits retired', '§5.6'),
      creditsGenerated: notApplicable('Carbon credits generated', '§5.6'),
      dataQuality: {
        scope1And2: inv.dataQuality,
        scope3: { absent: true, reason: 'Production emissions are a declared first-year lump sum carried apart; Table 5.6-1 scores the vehicles’ use-phase scope 1 and 2 only, so no scope 3 score is invented.' },
        scale: inv.dataQuality.scale,
      },
      economicIntensity_tCO2e_per_M: num(outstanding) && outstanding > 0 ? r2(s12.combined / (outstanding / 1e6)) : null,
      separation: 'Financed scope 1 and 2 are the vehicles’ fuel and electricity attributed on the value at origination; a new vehicle’s production emissions are scope 3, first year only, and are never summed with them (§5.6, p.91).',
      category: inv.category,
    },
    validation: clean('No data-truth checks are defined for this class yet; the engine refuses what the standard refuses.'),
    financialSector: false,
    provisional: native.provisional,
    native,
  };
}

// ---------------------------------------------------------------------------
// §5.3 — the project engine's result, the impact block kept out of the inventory
// ---------------------------------------------------------------------------

function adaptProjectFinance(native, input) {
  const inv = native.inventory;
  const outstanding = Number(input.outstandingAmount);
  const denominator = Number(input.totalProjectEquityPlusDebt);
  return {
    standard: native.standard,
    assetClass: 'project-finance',
    exposure: {
      identifiers: input.identifiers || {},
      counterparty: {
        name: input.counterparty || input.projectName || null,
        sector: input.sector || null,
        borrowerType: null, naceL2: null, financialInstitution: false,
      },
      kind: native.project.archetype,
      instrument: 'project-finance',
      reportingYear: input.reportingYear ? Number(input.reportingYear) : null,
      outstanding: { value: num(outstanding) ? outstanding : null, unit: native.project.currency || input.currency || 'USD' },
      projectName: input.projectName || null,
    },
    denominator: num(denominator)
      ? { value: denominator, equation: 'total project equity + debt (§5.3)', assumptions: [] }
      : null,
    attribution: native.attribution,
    inventory: {
      scope1: inv.scope1,
      scope2: inv.scope2,
      scope1And2: inv.scope1And2,
      scope3: inv.scope3,
      removals: inv.removals || notApplicable('Financed emission removals', '§5.3'),
      creditsRetired: notApplicable('Carbon credits retired', '§5.3'),
      creditsGenerated: notApplicable('Carbon credits generated', '§5.3'),
      dataQuality: {
        scope1And2: inv.dataQuality,
        scope3: { absent: true, reason: 'Table 5.3-1 scores the project’s scope 1 and 2; scope 3, where covered, carries no separate score here.' },
        scale: inv.dataQuality.scale,
      },
      economicIntensity_tCO2e_per_M: inv.economicIntensity_tCO2e_per_M,
      separation: 'Absolute emissions and removals are separate lines and are not netted (§5.3). Reductions and avoided emissions sit in the impact block and never in the inventory.',
      category: 'Scope 3 Category 15 (investments) of the reporting financial institution',
    },
    validation: clean('No data-truth checks are defined for this class yet; the generation path checks the plant’s physical plausibility where it runs.'),
    financialSector: false,
    native,
  };
}

// ---------------------------------------------------------------------------
// §5.1 — already on the seven lines; the outstanding needs the register's key
// ---------------------------------------------------------------------------

function adaptListedEquity(native) {
  const out = native.exposure.outstanding || {};
  return {
    ...native,
    exposure: {
      ...native.exposure,
      counterparty: { ...native.exposure.counterparty, sector: native.exposure.counterparty.naceL2 || null, borrowerType: null },
      kind: native.exposure.instrument,
      outstanding: { ...out, value: num(out.effective) ? out.effective : out.amount, unit: out.currency || null },
    },
    inventory: {
      ...native.inventory,
      separation: 'Absolute emissions, emission removals and carbon credits are separate lines and are not netted (§5.1, pp.49–50). Scope 3 is separate from scope 1 and 2 (p.40).',
    },
    validation: clean('No data-truth checks are defined for this class yet; the engine refuses what the standard refuses.'),
  };
}

// ---------------------------------------------------------------------------
// The classes
// ---------------------------------------------------------------------------

const scoreTarget = (what, opt) => target =>
  `The target is score ${target} — ${what} (Option ${opt}). Score 1 needs a supplier-specific or third-party-verified `
  + 'figure, which is not the lender’s decision alone, so it is not the default target.';

/**
 * @typedef {Object} RegisterClass
 * @property {string} assetClass
 * @property {string} section
 * @property {string} label
 * @property {string} standard
 * @property {function(Object): Object} engine
 * @property {function(Object, {orgId: string|null}): Promise<Object>} prepare
 * @property {function(Object, Object): Object} adapt   (engineResult, engineInput) → the register shape
 * @property {Object} rollUp   the class's binding for the roll-up: label, groupings, notes
 */

/** @type {Record<string, RegisterClass>} */
const CLASSES = Object.freeze({
  'business-loans-unlisted-equity': {
    assetClass: 'business-loans-unlisted-equity', section: '§5.2', label: 'Business loans and unlisted equity',
    standard: STANDARD_BL,
    engine: assessBusinessLoan,
    prepare: (input, ctx) => withSectorBand(input, ctx),
    adapt: r => r,
    rollUp: {},
  },
  'listed-equity-corporate-bonds': {
    assetClass: 'listed-equity-corporate-bonds', section: '§5.1', label: 'Listed equity and corporate bonds',
    standard: STANDARD_LE,
    engine: assessListedEquity,
    prepare: async input => input,
    adapt: r => adaptListedEquity(r),
    rollUp: {
      assetClass: 'listed-equity-corporate-bonds', label: 'Listed equity and corporate bonds',
      groupings: [
        { key: 'bySector', label: 'Sector (NACE)', pick: r => r.exposure.counterparty.naceL2 || r.exposure.counterparty.sector, fallback: 'unclassified' },
        { key: 'byKind', label: 'Instrument', pick: r => r.exposure.instrument, fallback: 'listed-equity' },
        { key: 'byCounterparty', label: 'Counterparty', pick: r => r.exposure.counterparty.name, fallback: 'unnamed' },
      ],
      financialSectorNote: 'Reported separately, as PCAF recommends (§5.1, p.41): scope 3 of a financial institution includes its own financed emissions, so the double count is made visible rather than hidden in the total.',
      separation: 'Absolute emissions, emission removals and carbon credits are separate lines and are not netted (§5.1, pp.49–50). Scope 3 is separate from scope 1 and 2 (p.40).',
      targetNote: scoreTarget('the company’s own reported figure, unverified', '1b'),
    },
  },
  'project-finance': {
    assetClass: 'project-finance', section: '§5.3', label: 'Project finance',
    standard: parta.STANDARD,
    engine: input => parta.assessExposure({ ...input, assetClass: 'project-finance' }),
    prepare: async input => input,
    adapt: (r, input) => adaptProjectFinance(r, input),
    rollUp: {
      assetClass: 'project-finance', label: 'Project finance',
      groupings: [
        { key: 'bySector', label: 'Sector', pick: r => r.exposure.counterparty.sector, fallback: 'unclassified' },
        { key: 'byKind', label: 'Archetype', pick: r => r.exposure.kind, fallback: 'general' },
      ],
      financialSectorNote: 'Reported separately, as PCAF recommends.',
      separation: 'Absolute emissions and removals are separate lines and are not netted (§5.3). Scope 3 is covered where relevant and reported apart.',
      targetNote: scoreTarget('the project’s own reported scope 1 and 2, unverified', '1b'),
    },
  },
  'commercial-real-estate': {
    assetClass: 'commercial-real-estate', section: '§5.4', label: 'Commercial real estate',
    standard: STANDARD_RE,
    engine: input => assessRealEstate({ ...input, class: 'commercial-real-estate' }),
    prepare: (input, ctx) => withPropertyFactors(input, ctx),
    adapt: (r, input) => adaptRealEstate(r, input, 'commercial-real-estate'),
    rollUp: {
      assetClass: 'commercial-real-estate', label: 'Commercial real estate',
      groupings: [
        { key: 'bySector', label: 'Building type', pick: r => r.exposure.counterparty.sector, fallback: 'unclassified' },
        { key: 'byKind', label: 'Product', pick: r => r.exposure.instrument, fallback: 'property-loan' },
      ],
      financialSectorNote: 'Reported separately, as PCAF recommends.',
      separation: 'Financed scope 1 and 2 are the building’s operational emissions; construction emissions are scope 3 category 15 and are never summed with them (§5.4, pp.77–79).',
      targetNote: scoreTarget('metered energy with an average emission factor', '1b'),
    },
  },
  'mortgages': {
    assetClass: 'mortgages', section: '§5.5', label: 'Mortgages',
    standard: STANDARD_RE,
    engine: input => assessRealEstate({ ...input, class: 'mortgages' }),
    prepare: (input, ctx) => withPropertyFactors(input, ctx),
    adapt: (r, input) => adaptRealEstate(r, input, 'mortgages'),
    rollUp: {
      assetClass: 'mortgages', label: 'Mortgages',
      groupings: [
        { key: 'bySector', label: 'Building type', pick: r => r.exposure.counterparty.sector, fallback: 'unclassified' },
        { key: 'byKind', label: 'Product', pick: r => r.exposure.instrument, fallback: 'mortgage' },
      ],
      financialSectorNote: 'Reported separately, as PCAF recommends.',
      separation: 'Financed scope 1 and 2 are the dwelling’s operational emissions; construction is not required under §5.5 (fn 132) and is never summed with them.',
      targetNote: scoreTarget('metered energy with an average emission factor', '1b'),
    },
  },
  'motor-vehicle-loans': {
    assetClass: 'motor-vehicle-loans', section: '§5.6', label: 'Motor vehicle loans',
    standard: STANDARD_MV,
    engine: input => assessMotorVehicles(input),
    prepare: (input, ctx) => withVehicleFactors(input, ctx),
    adapt: (r, input) => adaptMotorVehicles(r, input),
    rollUp: {
      assetClass: 'motor-vehicle-loans', label: 'Motor vehicle loans',
      groupings: [
        { key: 'bySector', label: 'Vehicle class', pick: r => r.exposure.counterparty.sector, fallback: 'unclassified' },
        { key: 'byKind', label: 'Product', pick: r => r.exposure.instrument, fallback: 'vehicle-loan' },
      ],
      financialSectorNote: 'Reported separately, as PCAF recommends.',
      separation: 'Financed scope 1 and 2 are the vehicles’ use-phase emissions; a new vehicle’s production emissions are scope 3, first year only, never summed with them (§5.6, p.91).',
      targetNote: scoreTarget('make/model efficiency from the registration certificate with a local distance statistic', '2a'),
    },
  },
});

const DEFAULT_CLASS = 'business-loans-unlisted-equity';

/** The class, or a 501 naming what is held. */
function classFor(assetClass) {
  const c = CLASSES[assetClass];
  if (!c) {
    const err = /** @type {import('../../../shared/types').AppError} */ (new Error(
      `No Part A engine is registered for asset class "${assetClass}". Registered: ${Object.keys(CLASSES).join(', ')}.`));
    err.statusCode = 501;
    err.code = 'ASSET_CLASS_NOT_REGISTERED';
    err.remedy = 'Part A is built asset class by asset class; the order is in docs/PCAF-PART-A-RESEARCH.md §11.';
    throw err;
  }
  return c;
}

/**
 * The engine's input is the exposure without the register's own field, and
 * for the property classes without a `class` that disagrees with it.
 */
function engineInputOf(input, assetClass) {
  const out = { ...input };
  delete out.assetClass;
  /* The climate classification is a fact about the loan the bank recorded, not
     an input to the arithmetic — the engine schemas are closed, so a field the
     caller was right to send would otherwise be a named 400. It is kept on the
     record beside the engine's input, and the roll-up reads it there. */
  delete out.climate;
  if ((assetClass === 'commercial-real-estate' || assetClass === 'mortgages') && out.class && out.class !== assetClass) {
    const err = /** @type {import('../../../shared/types').AppError} */ (new Error(
      `The register names asset class "${assetClass}" and the body names class "${out.class}"; they must agree.`));
    err.statusCode = 400; err.code = 'ASSET_CLASS_MISMATCH';
    err.remedy = 'Send assetClass alone; the register sets the engine’s class from it.';
    throw err;
  }
  return out;
}

/** Run one class end to end: prepare, compute, adapt. */
async function run(assetClass, input, ctx) {
  const c = classFor(assetClass);
  const engineInput = engineInputOf(input, assetClass);
  const prepared = await c.prepare(engineInput, ctx);
  const native = c.engine(prepared);
  return { engineInput, result: c.adapt(native, engineInput) };
}

/** The classes as a list a route or a screen can offer. */
function list() {
  return Object.values(CLASSES).map(c => ({ assetClass: c.assetClass, section: c.section, label: c.label }));
}

module.exports = { CLASSES, DEFAULT_CLASS, LINES, classFor, engineInputOf, run, list };
