// @ts-check
/**
 * The §5.4 / §5.5 gate: is this exposure commercial real estate, a mortgage, or
 * something the standard sends elsewhere?
 *
 * Both classes finance property and share the denominator, the energy equation
 * and the data-quality table, so one engine serves both; the class decides only
 * the boundary rules and which chapter a reviewer is sent to.
 *
 * What is NOT this class is redirected by name rather than assessed here by
 * default (the §5.2 discipline): listed CRE is §5.1 (its emissions are already
 * in the corporate inventory the listed price carries); a loan secured on
 * property for another purpose is a business loan (§5.2); a home-equity line
 * (HEL/HELOC) is not required for mortgages, and a construction or renovation
 * mortgage is not required — the homeowner does not account for the builder's
 * emissions (§5.5, fn 132).
 */

'use strict';

/** @param {string} code @param {string} message @param {number} [statusCode] @param {string} [remedy] */
function refuse(code, message, statusCode = 400, remedy) {
  const err = /** @type {any} */ (new Error(message));
  err.statusCode = statusCode; err.code = code;
  if (remedy) err.remedy = remedy;
  return err;
}

const CLASSES = { 'commercial-real-estate': '§5.4', 'mortgages': '§5.5' };

/**
 * @param {Object} input
 * @param {'commercial-real-estate'|'mortgages'} input.class
 * @param {boolean} [input.borrowerListed]        a listed CRE owner → §5.1
 * @param {boolean} [input.securedForOtherPurpose] property-secured loan for another use → §5.2
 * @param {'purchase'|'refinance'|'construction'|'renovation'|'hel'|'heloc'} [input.productType]
 * @returns {{ class: string, section: string, notes: string[] }}
 */
function classify(input) {
  const cls = input.class;
  if (!CLASSES[cls]) {
    throw refuse('REAL_ESTATE_CLASS_REQUIRED',
      `class must be one of ${Object.keys(CLASSES).join(', ')}.`, 400,
      'Set class to "commercial-real-estate" (§5.4) or "mortgages" (§5.5).');
  }

  /* Listed CRE is already inside a listed company's inventory: send it to §5.1
     rather than count the building's energy a second time. */
  if (input.borrowerListed) {
    throw refuse('REDIRECT_LISTED_EQUITY',
      'A listed property owner is listed equity and corporate bonds (§5.1), not real estate: '
      + 'the building’s emissions are already in the corporate inventory the listed value carries.',
      422, 'Assess this exposure under §5.1 (listed-equity-corporate-bonds).');
  }
  /* A property-secured loan for another purpose is a business loan. */
  if (input.securedForOtherPurpose) {
    throw refuse('REDIRECT_BUSINESS_LOANS',
      'A loan secured on property but taken for another purpose is a business loan (§5.2), '
      + 'not a real-estate loan: the collateral is not the financed asset.',
      422, 'Assess this exposure under §5.2 (business-loans-unlisted-equity).');
  }

  const notes = [];
  const pt = input.productType;
  if (cls === 'mortgages') {
    if (pt === 'hel' || pt === 'heloc') {
      throw refuse('OUT_OF_SCOPE_HEL',
        'Home-equity loans and lines (HEL/HELOC) are not required under §5.5 and are out of this class.',
        422, 'PCAF §5.5 does not require HEL/HELOC; exclude it, or account for it voluntarily elsewhere.');
    }
    if (pt === 'construction' || pt === 'renovation') {
      throw refuse('OUT_OF_SCOPE_CONSTRUCTION_MORTGAGE',
        'Construction and renovation mortgages are not required under §5.5: the homeowner does not '
        + 'account for the builder’s emissions (fn 132).',
        422, 'Exclude a construction/renovation mortgage, or assess the building once complete.');
    }
  } else if (pt === 'construction' || pt === 'renovation') {
    /* CRE construction/renovation is OPTIONAL, not excluded: it runs, with a note. */
    notes.push('Construction and renovation lending is optional under §5.4; it is assessed here on the '
      + 'building’s operational energy. Any developer-reported construction emissions are scope 3 '
      + 'category 15, reported separately and never summed with operational scope 1 and 2.');
  }

  return { class: cls, section: CLASSES[cls], notes };
}

module.exports = { classify, CLASSES, refuse };
