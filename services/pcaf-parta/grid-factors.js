/**
 * Grid emission factors, held by country and by BASIS.
 *
 * The basis is the point of this module. A grid average is what a consumer
 * draws off the system; a combined margin is what a new grid-connected
 * renewable displaces. They answer different questions and they differ
 * materially — Sri Lanka's published combined margin is 0.8108 against a grid
 * average near 0.500, a 62% gap on the same grid. Quoting one where the other
 * applies produces a figure that is wrong by more than half and looks entirely
 * correct on the page.
 *
 * So a basis is never silently borrowed from its neighbour. Where a country's
 * combined margin is not held, that is reported as a substitution with its
 * reason attached to the figure, and the substitution travels into the
 * assumptions register rather than living in a comment here.
 */

'use strict';

const STORE = require('../../data/pcaf-parta/grid-factors.json');

const BY_CODE = new Map(STORE.countries.map(c => [c.code, c]));

/** Every country offered, shaped for a form. */
function list() {
  return STORE.countries.map(c => ({
    code: c.code,
    name: c.name,
    gridAverage: c.gridAverage,
    combinedMargin: c.combinedMargin,
    gridAverageAbsentReason: c.gridAverageAbsentReason || null,
    combinedMarginAbsentReason: c.combinedMarginAbsentReason || null,
    solarCapacityFactor: c.solarCapacityFactor,
  }));
}

function forCountry(code) {
  const c = BY_CODE.get(String(code || '').toUpperCase());
  if (!c) {
    const err = new Error(
      `No grid emission factor is held for country "${code}". `
      + `Held: ${STORE.countries.map(x => `${x.code} (${x.name})`).join(', ')}.`);
    err.statusCode = 501;
    err.code = 'GRID_FACTOR_NOT_HELD';
    err.remedy = 'A factor may only be used where its basis, vintage and publisher are '
      + 'recorded. Add the country to data/pcaf-parta/grid-factors.json with its source '
      + 'rather than entering a value by hand.';
    throw err;
  }
  return c;
}

/**
 * The factor to use for a purpose, and whether it is the right basis.
 *
 * @param {string} code
 * @param {'consumption'|'displacement'} purpose
 */
function resolve(code, purpose) {
  const c = forCountry(code);
  const wanted = purpose === 'displacement' ? 'combinedMargin' : 'gridAverage';
  const other  = purpose === 'displacement' ? 'gridAverage' : 'combinedMargin';

  const preferred = c[wanted];
  if (preferred) {
    return {
      value: preferred.value,
      basis: wanted,
      basisLabel: STORE.bases[wanted],
      country: c.name,
      countryCode: c.code,
      vintage: preferred.vintage,
      source: preferred.source,
      publisher: preferred.publisher,
      url: preferred.url,
      flag: preferred.flag || null,
      flagNote: preferred.flagNote || null,
      substituted: false,
      substitutionNote: null,
    };
  }

  /* The wanted basis is not held. Substituting is allowed, saying so is not
     optional: the substitution is the largest uncertainty in the figure. */
  const fallback = c[other];
  if (!fallback) {
    const err = new Error(`No emission factor of any basis is held for ${c.name}.`);
    err.statusCode = 501; err.code = 'GRID_FACTOR_NOT_HELD';
    throw err;
  }

  return {
    value: fallback.value,
    basis: other,
    basisLabel: STORE.bases[other],
    country: c.name,
    countryCode: c.code,
    vintage: fallback.vintage,
    source: fallback.source,
    publisher: fallback.publisher,
    url: fallback.url,
    flag: fallback.flag || null,
    flagNote: fallback.flagNote || null,
    substituted: true,
    substitutionNote: `The ${STORE.bases[wanted].toLowerCase().replace(/\.$/, '')} is not held for `
      + `${c.name}, so the ${other === 'gridAverage' ? 'grid average' : 'combined margin'} has been `
      + `substituted. ${c[`${wanted}AbsentReason`] || ''} This is a weaker basis for this purpose and `
      + 'the figure should not be disclosed until the correct one is obtained.',
  };
}

const auxiliaryRate = () => STORE.auxiliaryConsumption;

module.exports = { list, forCountry, resolve, auxiliaryRate, STORE };
