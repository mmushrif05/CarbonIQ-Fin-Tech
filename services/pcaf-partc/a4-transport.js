/**
 * CarbonIQ FinTech — PCAF Part C: A4 Transport to Site
 *
 * Spec §5:
 *   mass_tonnes(qty, unit, mass_factor) = qty * mass_factor / 1000
 *   a4_material = mass_t * (road*EFroad + sea*EFsea + rail*EFrail + air*EFair)
 *   a4_total    = sum(a4_material)
 *   pareto_vital_few(items) = { i : sum(emissions > i) / total < 0.80 }
 *
 * The Pareto rule mirrors the reference workbook's SUMIF: an item is in the
 * "vital few" when everything strictly heavier than it accounts for less
 * than 80% of the total. This includes the item that crosses the 80% line,
 * which is the conventional Pareto reading.
 *
 * MVP form scope: the client supplies road / sea / rail km per material.
 * Air is carried by the engine but fixed at 0 (no air freight question in
 * the MVP form).
 */

'use strict';

const { traced, assumption, sumValues } = require('./provenance');
const factors = require('./factors');

const MODES = ['road', 'sea', 'rail', 'air'];

/**
 * Convert a BOQ quantity to tonnes.
 *
 * @param {Object} material - { name, quantity, unit, massFactorKey|massFactor, densityKey }
 * @returns {Object} traced value in tonnes
 */
function massTonnes(material) {
  const qty = Number(material.quantity) || 0;
  const assumptions = [];
  let factorRef = null;

  if (Number.isFinite(Number(material.massFactor)) && Number(material.massFactor) > 0) {
    // Explicit override supplied by the mapping agent or the client.
    factorRef = {
      key: `explicit.${material.name}`, value: Number(material.massFactor),
      unit: 'kg/unit', tier: material.massFactorTier || 'Global',
      reference: material.massFactorReference || 'Explicit mass factor supplied with the material'
    };
  } else if (material.densityKey) {
    factorRef = factors.density(material.densityKey);
  } else if (material.massFactorKey) {
    factorRef = factors.massFactor(material.massFactorKey);
  } else {
    factorRef = {
      key: 'unresolved', value: 0, unit: 'kg/unit', tier: 'Global',
      reference: 'No density or mass factor could be resolved',
      gap: `No factor mapping for "${material.name}"`, fallback: true
    };
  }

  if (factorRef.fallback) {
    assumptions.push(assumption('A4_FACTOR_FALLBACK',
      `Mass factor for "${material.name}" fell back to a table default. ${factorRef.gap || ''}`.trim(),
      'notable', { material: material.name, factorKey: factorRef.key }));
  }

  const value = qty * (Number(factorRef.value) || 0) / 1000;

  return traced({
    value, unit: 't', module: 'A4', label: `Mass — ${material.name}`,
    equation: 'mass_t = quantity × mass_factor / 1000',
    inputs: { quantity: qty, unit: material.unit || null, massFactor: factorRef.value },
    factors: [factorRef],
    assumptions
  });
}

/**
 * A4 for a single material.
 *
 * @param {Object} material - BOQ line with mapped factor keys
 * @param {Object} distance - { road, sea, rail, air } in km
 */
function a4Material(material, distance = {}) {
  const mass = massTonnes(material);
  const usedFactors = [];
  const assumptions = [];
  let perTonne = 0;
  const legs = {};

  for (const mode of MODES) {
    const km = Number(distance[mode]) || 0;
    legs[`${mode}_km`] = km;
    if (km <= 0) continue;
    const ef = factors.transportEF(mode);
    usedFactors.push(ef);
    perTonne += km * (Number(ef.value) || 0);
  }

  if (perTonne === 0) {
    assumptions.push(assumption('A4_NO_DISTANCE',
      `No transport distance supplied for "${material.name}" — its A4 contribution is zero. Confirm the material is site-batched or supply a haul distance.`,
      'notable', { material: material.name }));
  }

  const value = mass.value * perTonne;

  return traced({
    value, unit: 'kgCO2e', module: 'A4', label: material.name,
    equation: 'A4 = mass_t × (road_km×EF_road + sea_km×EF_sea + rail_km×EF_rail + air_km×EF_air)',
    inputs: { mass_t: mass.value, ...legs },
    factors: usedFactors,
    assumptions,
    children: [mass]
  });
}

/**
 * A4 across all materials, with contribution shares and the Pareto vital few.
 *
 * @param {Object[]} materials - mapped BOQ lines
 * @param {Object} distances   - { [materialId|name]: {road,sea,rail,air} }
 * @returns {Object} traced total, with .items carrying per-material detail
 */
function a4Total(materials = [], distances = {}) {
  const items = materials.map(m => {
    const key = m.id || m.name;
    const node = a4Material(m, distances[key] || m.distance || {});
    node.materialId = key;
    return node;
  });

  const total = sumValues(items);

  // Contribution share + Pareto flag, matching the workbook's SUMIF logic.
  for (const item of items) {
    item.contributionPct = total > 0 ? item.value / total : 0;
    const heavier = items.reduce((acc, o) => acc + (o.value > item.value ? o.value : 0), 0);
    item.inParetoVitalFew = total > 0 ? (heavier / total) < 0.80 : false;
  }

  const vitalFew = items.filter(i => i.inParetoVitalFew);

  const node = traced({
    value: total, unit: 'kgCO2e', module: 'A4', label: 'A4 Transport to site',
    equation: 'A4_total = Σ A4_material',
    inputs: { materialCount: items.length, totalMass_t: sumValues(items.map(i => i.children[0])) },
    children: items
  });

  node.items    = items;
  node.vitalFew = vitalFew.map(i => ({ name: i.label, value: i.value, contributionPct: i.contributionPct }));
  return node;
}

module.exports = { massTonnes, a4Material, a4Total, MODES };
