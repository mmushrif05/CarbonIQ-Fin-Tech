/**
 * A renewable generation project, derived from what it generates.
 *
 * The operator supplies two things — how much the plant generates in a year,
 * and where it is. Everything else is derived: the project's own scope 1 and
 * 2, the emissions it displaces, the data quality option, and whether the
 * generation figure is physically achievable at all.
 *
 * Why this is not a convenience. Typing scope 1 and scope 2 into boxes made
 * them unaccountable — the trace said "Measured" over a number a person had
 * invented, and the data quality option was a dropdown a user could set to the
 * best score PCAF awards with nothing behind it. Deriving them from generation
 * and a named factor means the figure carries the factor's publisher, vintage
 * and basis wherever it goes, and the option is decided by the data actually
 * consumed rather than chosen.
 *
 * The scope 2 and the avoided figure deliberately use DIFFERENT factors. What
 * the plant draws off the grid at night is the grid average; what it displaces
 * by generating is the combined margin. Using one for both is the most common
 * error in renewable-project carbon accounting and it is invisible on the page.
 */

'use strict';

const { traced } = require('./provenance');
const grid = require('./grid-factors');

const HOURS_PER_YEAR = 8760;

/* No photovoltaic plant anywhere reaches this. Tracking arrays in the best
   desert sites run near 0.30; above 0.35 the input is not optimistic, it is
   impossible, and is refused rather than carried into a disclosure. */
const PV_ABSOLUTE_CEILING = 0.35;

/* And the floor, which the first version of this check was missing.
   A ceiling with no floor catches the unit error that makes a number too big
   and waves through the one that makes it too small — and the second is just
   as common, because MW read as kW and MWh read as GWh both divide by a
   thousand. Worse, the out-of-band message explained a 0.0% reading away as
   "not an error — a tracking array, a curtailed connection or an unusual
   site", which is true at 14% and nonsense at nought. A plant below 1% did not
   run; the worst-sited array in Norway still averages 8% over a year. */
const PV_ABSOLUTE_FLOOR = 0.01;

/**
 * Is this much generation achievable from this much plant?
 *
 * Runs only where the capacity is given. A capacity factor is the one check
 * available before a project exists: it needs no meter, no operating history
 * and no counterparty cooperation, only physics and the site's latitude.
 */
function capacityFactorCheck({ annualGeneration_MWh, installedCapacity_MW, country }) {
  if (!Number.isFinite(installedCapacity_MW) || installedCapacity_MW <= 0) {
    return {
      ran: false,
      reason: 'Installed capacity was not supplied, so the generation figure could not be '
        + 'checked against what the plant can physically produce.',
    };
  }

  const c = grid.forCountry(country);
  const band = c.solarCapacityFactor;
  const ceiling_MWh = installedCapacity_MW * HOURS_PER_YEAR;
  const cf = annualGeneration_MWh / ceiling_MWh;

  const shared = {
    ran: true,
    capacityFactor: +cf.toFixed(4),
    capacityFactorPct: +(cf * 100).toFixed(1),
    nameplateCeiling_MWh: +ceiling_MWh.toFixed(0),
    band: { low: band.low, high: band.high, basis: band.basis, flag: band.flag },
    equation: 'capacity factor = annual generation ÷ (installed capacity × 8,760 h)',
    country: c.name,
  };

  if (cf > PV_ABSOLUTE_CEILING) {
    const err = new Error(
      `${annualGeneration_MWh.toLocaleString('en-GB')} MWh from ${installedCapacity_MW} MW implies a `
      + `capacity factor of ${(cf * 100).toFixed(1)}%. No photovoltaic plant achieves that anywhere on `
      + `earth — the physical ceiling is around ${(PV_ABSOLUTE_CEILING * 100).toFixed(0)}% and `
      + `${c.name} sits at ${(band.low * 100).toFixed(0)}-${(band.high * 100).toFixed(0)}%. `
      + 'The claim is refused rather than carried into a disclosure.');
    err.statusCode = 422;
    err.code = 'GENERATION_NOT_PHYSICALLY_POSSIBLE';
    err.remedy = `Check the units — a figure in kWh entered as MWh produces exactly this. At the `
      + `top of ${c.name}'s band this plant would generate about `
      + `${Math.round(ceiling_MWh * band.high).toLocaleString('en-GB')} MWh a year.`;
    throw err;
  }

  if (cf < PV_ABSOLUTE_FLOOR) {
    const expected = ceiling_MWh * band.low;
    const pct = cf * 100;
    /* A gap of roughly a thousand is not a bad site, it is a unit. Saying which
       unit turns a refusal into a correction the operator can act on. */
    const outBy = cf > 0 ? Math.round(band.low / cf) : null;
    const thousandish = outBy !== null && outBy >= 300 && outBy <= 3000;

    const err = new Error(
      `${annualGeneration_MWh.toLocaleString('en-GB')} MWh from ${installedCapacity_MW} MW implies a `
      + `capacity factor of ${pct >= 0.01 ? pct.toFixed(2) : pct.toPrecision(2)}%. A plant producing `
      + `that little has not run: ${c.name} sits at ${(band.low * 100).toFixed(0)}-`
      + `${(band.high * 100).toFixed(0)}%, so this plant should generate around `
      + `${Math.round(expected).toLocaleString('en-GB')} MWh a year. The figure is refused rather `
      + 'than carried into a disclosure.');
    err.statusCode = 422;
    err.code = 'GENERATION_NOT_PHYSICALLY_POSSIBLE';
    err.remedy = thousandish
      ? `The two figures are out by a factor of about ${outBy.toLocaleString('en-GB')}, which is the `
        + 'signature of a thousands mix-up — capacity entered in kW where the field asks for MW, or '
        + 'generation entered in GWh where it asks for MWh. Check both.'
      : `Check the units on both fields. At the bottom of ${c.name}'s band this plant would generate `
        + `about ${Math.round(expected).toLocaleString('en-GB')} MWh a year.`;
    throw err;
  }

  if (cf < band.low || cf > band.high) {
    return {
      ...shared,
      status: cf > band.high ? 'above_band' : 'below_band',
      /* "Not NECESSARILY an error". The check cannot establish innocence, and
         asserting it is how a reviewer stops reading the sentence. */
      note: `A capacity factor of ${(cf * 100).toFixed(1)}% sits outside the ${(band.low * 100).toFixed(0)}-`
        + `${(band.high * 100).toFixed(0)}% band indicative for ${c.name}. That is not necessarily an `
        + 'error — a tracking array, a curtailed connection or an unusual site can all put a plant '
        + 'outside the band — but it should be explained rather than left for a reviewer to notice.',
    };
  }

  return {
    ...shared,
    status: 'within_band',
    note: `A capacity factor of ${(cf * 100).toFixed(1)}% is within the `
      + `${(band.low * 100).toFixed(0)}-${(band.high * 100).toFixed(0)}% band indicative for ${c.name}.`,
  };
}

/** A factor resolved from the store, shaped for the report and the screen. */
function _factorBlock(f) {
  return {
    value: f.value,
    unit: 'tCO2e/MWh',
    basis: f.basis,
    basisLabel: f.basisLabel,
    country: f.country,
    countryCode: f.countryCode,
    vintage: f.vintage,
    source: f.source,
    publisher: f.publisher,
    url: f.url,
    flag: f.flag,
    flagNote: f.flagNote,
    substituted: f.substituted,
    substitutionNote: f.substitutionNote,
  };
}

/**
 * Derive the project's emissions and its displacement from its generation.
 *
 * @param {Object} p
 * @param {number} p.annualGeneration_MWh
 * @param {string} p.country                two-letter code held in the factor store
 * @param {number} [p.installedCapacity_MW] enables the physical check
 * @param {number} [p.auxiliaryConsumption_MWh] metered; replaces the assumed rate
 */
function deriveFromGeneration({
  annualGeneration_MWh, country, installedCapacity_MW, auxiliaryConsumption_MWh,
}) {
  if (!Number.isFinite(annualGeneration_MWh) || annualGeneration_MWh <= 0) {
    const err = new Error('Annual generation must be a positive number of MWh.');
    err.statusCode = 400; err.code = 'INVALID_GENERATION';
    throw err;
  }

  const plausibility = capacityFactorCheck({ annualGeneration_MWh, installedCapacity_MW, country });

  const consumption  = grid.resolve(country, 'consumption');
  const displacement = grid.resolve(country, 'displacement');
  const aux = grid.auxiliaryRate();

  /* Auxiliary draw: metered where it exists, otherwise the store's rate. The
     difference between the two is the difference between a measurement and an
     assumption, and the basis says which one this is. */
  const metered = Number.isFinite(auxiliaryConsumption_MWh) && auxiliaryConsumption_MWh >= 0;
  const auxMWh = metered
    ? auxiliaryConsumption_MWh
    : annualGeneration_MWh * aux.rateOfGrossGeneration;

  const assumptions = [];
  if (!metered) {
    assumptions.push(`Auxiliary consumption assumed at ${(aux.rateOfGrossGeneration * 100).toFixed(1)}% `
      + `of gross generation (${Math.round(auxMWh).toLocaleString('en-GB')} MWh). ${aux.note}`);
  }
  if (consumption.substituted)  assumptions.push(consumption.substitutionNote);
  if (displacement.substituted) assumptions.push(displacement.substitutionNote);
  if (displacement.flagNote)    assumptions.push(`Displacement factor: ${displacement.flagNote}`);
  if (consumption.flagNote && consumption.source !== displacement.source) {
    assumptions.push(`Consumption factor: ${consumption.flagNote}`);
  }

  /* Scope 1 is nil and that is a finding, not a gap. A photovoltaic plant
     burns nothing to generate. Reported as a derived zero with the reason, so
     it cannot be read as a scope nobody measured. */
  const scope1 = traced({
    value: 0,
    unit: 'tCO2e',
    equation: 'project scope 1 = 0 — no combustion in the generation process',
    inputs: { technology: 'photovoltaic generation' },
    basis: 'Derived from the technology: photovoltaic generation involves no fuel combustion',
    reference: 'PCAF Part A Third Edition §5.3, Emission scopes covered',
    assumptions: ['Standby generation, refrigerant and switchgear SF6 fugitives are not included. '
      + 'Where the plant holds a diesel standby set or SF6-insulated switchgear, those are scope 1 '
      + 'and must be added.'],
  });

  const scope2 = traced({
    value: +(auxMWh * consumption.value).toFixed(2),
    unit: 'tCO2e',
    equation: 'project scope 2 = auxiliary consumption × grid emission factor (consumption basis)',
    inputs: {
      auxiliaryConsumption_MWh: +auxMWh.toFixed(2),
      gridFactor_tCO2e_per_MWh: consumption.value,
      basis: consumption.basisLabel,
    },
    basis: metered
      ? 'Measured from metered auxiliary consumption and a published grid factor'
      : 'Calculated from generation and a published grid factor, with auxiliary draw assumed',
    reference: `${consumption.publisher} — ${consumption.source} (${consumption.vintage})`,
    assumptions: [],
  });

  const avoided = traced({
    value: +(annualGeneration_MWh * displacement.value).toFixed(2),
    unit: 'tCO2e',
    equation: 'avoided emissions = annual generation × displaced grid emission factor',
    inputs: {
      annualGeneration_MWh,
      displacedFactor_tCO2e_per_MWh: displacement.value,
      basis: displacement.basisLabel,
    },
    basis: 'Calculated against the displaced grid supply named in the factor store',
    reference: `${displacement.publisher} — ${displacement.source} (${displacement.vintage})`,
    assumptions: [],
  });

  /* The option is decided by the data the run consumed, not chosen from a
     list. Generation is primary physical activity data and the factor is
     specific to that data and that grid, which is Option 2a in Table 5.3-1. */
  const dataQuality = {
    option: '2a',
    derived: true,
    reason: 'Emissions were calculated from primary physical activity data — the plant\'s annual '
      + 'generation and its auxiliary consumption — with a grid emission factor specific to that '
      + 'country and named with its publisher and vintage. Table 5.3-1 places that at Option 2a. '
      + 'The option was derived from the data actually used, not selected.',
    wouldReach: {
      betterBy: 'Option 1b requires emissions reported by the project itself; Option 1a requires '
        + 'those emissions to have been independently verified.',
      worseBy: 'Absent generation data, an estimate from project revenue and a sector factor would '
        + 'be Option 3a.',
    },
  };

  return {
    scope1,
    scope2,
    avoided,
    dataQuality,
    plausibility,
    factors: {
      consumption:  _factorBlock(consumption),
      displacement: _factorBlock(displacement),
      auxiliaryRate: metered ? null : aux.rateOfGrossGeneration,
      auxiliaryConsumption_MWh: +auxMWh.toFixed(2),
      auxiliaryMetered: metered,
    },
    counterfactual: `Grid electricity that would otherwise have been supplied to the `
      + `${displacement.country} national system, valued on the `
      + `${displacement.basis === 'combinedMargin' ? 'CDM combined margin' : 'grid average'} basis.`,
    counterfactualSource: `${displacement.publisher} — ${displacement.source} (${displacement.vintage})`,
    assumptions,
  };
}

module.exports = {
  deriveFromGeneration, capacityFactorCheck, HOURS_PER_YEAR,
  PV_ABSOLUTE_CEILING, PV_ABSOLUTE_FLOOR,
};
