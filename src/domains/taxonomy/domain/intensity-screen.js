// @ts-check
/**
 * CarbonIQ FinTech — the embodied-carbon intensity screen, five frameworks
 *
 * The Taxonomy Alignment screen and the new-project wizard's quick-check
 * screen one figure — kgCO2e per square metre — against five frameworks and
 * draw a tier for each. The tier table lived in the browser, where anyone
 * who loaded the page could read it and where the wizard had grown a second,
 * different set of thresholds (1,000 and 900) that no framework publishes.
 * It lives here now, once, and both screens ask for the answer.
 *
 * What each band is has to be said, because they are not all the same kind
 * of fact. ASEAN v3 publishes an embodied-carbon threshold per unit area and
 * the band is that figure. The Sri Lanka bands are this product's own screen
 * under baseline governance — the SLGFT sets no absolute figure. The
 * Singapore, Hong Kong and EU bands are **indicative proxies** this product
 * uses to place an embodied-carbon intensity beside frameworks that decide
 * alignment on other evidence (a Green Mark rating, a BEAM Plus score, a
 * whole-life assessment); each row says so, and none of them is printed as
 * the framework's threshold on any disclosure.
 */

'use strict';

const { TAXONOMY_ASEAN, TAXONOMY_SL } = require('../../../shared/constants');

const ASEAN = TAXONOMY_ASEAN.tiers;

/** The five frameworks in the order the screen draws them. */
const FRAMEWORKS = Object.freeze([
  {
    id: 'asean', label: 'ASEAN Taxonomy v3', region: 'ASEAN',
    basis: 'published', note: 'ASEAN Taxonomy v3 construction embodied-carbon thresholds',
    tiers: [
      { key: 'aligned',    label: ASEAN.green.label,      max: ASEAN.green.construction.maxEmbodiedCarbon_kgCO2e_per_m2 },
      { key: 'transition', label: ASEAN.transition.label, max: ASEAN.transition.construction.maxEmbodiedCarbon_kgCO2e_per_m2 },
      { key: 'risk',       label: 'Not Aligned',          max: null },
    ],
  },
  {
    id: 'sg', label: 'SG Green Mark 2021', region: 'SG',
    basis: 'indicative', note: 'BCA Green Mark 2021 — an indicative embodied-carbon proxy; the rating itself rests on other evidence',
    tiers: [
      { key: 'aligned',    label: 'Certified Green', max: 480 },
      { key: 'transition', label: 'Near Threshold',  max: 700 },
      { key: 'risk',       label: 'Not Aligned',     max: null },
    ],
  },
  {
    id: 'hk', label: 'HK Green Finance 2024', region: 'HK',
    basis: 'indicative', note: 'HKMA Green Classification Framework 2024 — an indicative embodied-carbon proxy',
    tiers: [
      { key: 'aligned',    label: 'Dark Green',  max: 450 },
      { key: 'transition', label: 'Light Green', max: 650 },
      { key: 'risk',       label: 'Not Aligned', max: null },
    ],
  },
  {
    id: 'eu', label: 'EU Taxonomy 2024', region: 'EU',
    basis: 'indicative', note: 'EU Taxonomy Climate Delegated Act — an embodied-carbon proxy; alignment rests on a whole-life assessment and DNSH',
    tiers: [
      { key: 'aligned',    label: 'Aligned',        max: 500 },
      { key: 'transition', label: 'Near Threshold', max: 750 },
      { key: 'risk',       label: 'Not Aligned',    max: null },
    ],
  },
  {
    id: 'sl', label: 'Sri Lanka SLGFT / CBSL', region: 'LK',
    basis: 'governed', note: 'CBSL Direction No. 05/2022 · SLFRS S2 · Sri Lanka Green Finance Taxonomy — this product\'s own intensity screen under baseline governance; the taxonomy sets no absolute figure',
    tiers: [
      { key: 'aligned',    label: TAXONOMY_SL.classifications.green.label,      max: TAXONOMY_SL.classifications.green.maxIntensity },
      { key: 'transition', label: TAXONOMY_SL.classifications.transition.label, max: TAXONOMY_SL.classifications.transition.maxIntensity },
      { key: 'risk',       label: 'Not Aligned',                                max: null },
    ],
  },
]);

/** The bar's full length on the screen, so every framework draws to one scale. */
const SCALE_MAX_KGCO2E_M2 = 1000;

/**
 * The frameworks as the screen lists them, with the Sri Lanka bands replaced
 * by the ones the baseline registry resolved where the caller has them.
 *
 * @param {{sriLanka?: {green: number, transition: number, basis?: string, provisional?: boolean}}} [opts]
 */
function frameworks(opts = {}) {
  return FRAMEWORKS.map(fw => {
    /** @type {{id: string, label: string, region: string, basis: string, note: string, baselineBasis: string|null, provisional: boolean, tiers: Array<{key: string, label: string, max: number|null}>}} */
    const out = {
      ...fw,
      tiers: fw.tiers.map(t => ({ ...t })),
      baselineBasis: null,
      provisional: fw.id === 'sl',
    };
    if (fw.id === 'sl' && opts.sriLanka) {
      const b = opts.sriLanka;
      out.tiers[0].max = b.green;
      out.tiers[1].max = b.transition;
      out.baselineBasis = b.basis || null;
      out.provisional = b.provisional !== false;
    }
    return out;
  });
}

/**
 * One intensity screened against every framework.
 *
 * @param {number} intensity kgCO2e per square metre
 * @param {{sriLanka?: {green: number, transition: number, basis?: string, provisional?: boolean}}} [opts]
 */
function screenIntensity(intensity, opts = {}) {
  const value = Number(intensity);
  if (!Number.isFinite(value) || value < 0) {
    throw Object.assign(new Error('The intensity must be a number of kgCO2e per square metre, zero or more.'),
      { statusCode: 400, code: 'INVALID_INPUT' });
  }
  const rows = frameworks(opts).map(fw => {
    const tier = fw.tiers.find(t => t.max === null || value <= t.max) || fw.tiers[fw.tiers.length - 1];
    const threshold = Number(fw.tiers[0].max);
    return {
      id: fw.id, label: fw.label, region: fw.region, basis: fw.basis, note: fw.note,
      provisional: fw.provisional, baselineBasis: fw.baselineBasis || null,
      tier: tier.key, tierLabel: tier.label,
      threshold_kgCO2e_m2: threshold,
      barPct: Math.min(100, Math.round((value / SCALE_MAX_KGCO2E_M2) * 100)),
      limitPct: Math.min(100, Math.round((threshold / SCALE_MAX_KGCO2E_M2) * 100)),
    };
  });
  const aligned = rows.filter(r => r.tier === 'aligned').length;
  return {
    intensity_kgCO2e_m2: value,
    scaleMax_kgCO2e_m2: SCALE_MAX_KGCO2E_M2,
    frameworks: rows,
    summary: { aligned, total: rows.length, label: `${aligned} of ${rows.length} frameworks aligned` },
  };
}

module.exports = { frameworks, screenIntensity, SCALE_MAX_KGCO2E_M2 };
