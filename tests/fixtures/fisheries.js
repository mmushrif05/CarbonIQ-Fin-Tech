/**
 * Fisheries CAR — reference fixture.
 *
 * Mirrors the Fisheries-A4-Calculator.xlsx reference workbook so the engine
 * can be pinned to its numbers. Quantities, distances and previous-project
 * site data are the real values from that workbook.
 */

'use strict';

const MATERIALS = [
  { id: 'concrete',   name: 'Concrete (all grades)',      quantity: 18.65, unit: 'm3', densityKey: 'concrete_normal', wasteCategory: 'Concrete in situ',                               serviceLifeCategory: 'Structure' },
  { id: 'rubble',     name: 'Rubble masonry (stone)',     quantity: 6,     unit: 'm3', densityKey: 'rubble_masonry',  wasteCategory: 'Stone (cladding)',                                serviceLifeCategory: 'Structure' },
  { id: 'timber_dw',  name: 'Timber doors/windows',       quantity: 32.3,  unit: 'm2', massFactorKey: 'timber_door',  wasteCategory: 'Timber frames (beams, columns, joists, braces)',  serviceLifeCategory: 'Timber joinery' },
  { id: 'tiles',      name: 'Ceramic/porcelain tiles',    quantity: 22,    unit: 'm2', massFactorKey: 'ceramic_tile', wasteCategory: 'Floor finish (tile)',                             serviceLifeCategory: 'Ceramic tile' },
  { id: 'timber_cup', name: 'Timber cupboards',           quantity: 0.5,   unit: 'm3', densityKey: 'timber',          wasteCategory: 'Timber frames (beams, columns, joists, braces)',  serviceLifeCategory: 'Timber joinery' },
  { id: 'ms_grills',  name: 'MS grills (mild steel)',     quantity: 12,    unit: 'm2', massFactorKey: 'ms_grill',     wasteCategory: 'Steel frame (beams, columns, braces)',             serviceLifeCategory: 'MS grills' },
  { id: 'aluminium',  name: 'Aluminium (doors/cladding)', quantity: 8.8,   unit: 'm2', massFactorKey: 'aluminium_sheet', wasteCategory: 'Aluminium extruded profiles/frames',           serviceLifeCategory: 'Aluminium' },
  { id: 'rebar',      name: 'Reinforcement steel (Tor)',  quantity: 0.05,  unit: 'MT', massFactorKey: 'steel_mt',     wasteCategory: 'Steel reinforcement',                             serviceLifeCategory: 'Structure' },
  { id: 'pvc110',     name: 'PVC pipe 110mm',             quantity: 22.8,  unit: 'm',  massFactorKey: 'pvc_110mm',    wasteCategory: 'PVC pipework (not in T18)',                       serviceLifeCategory: 'PVC pipework' },
  { id: 'pvc63',      name: 'PVC pipe 63mm',              quantity: 14,    unit: 'm',  massFactorKey: 'pvc_63mm',     wasteCategory: 'PVC pipework (not in T18)',                       serviceLifeCategory: 'PVC pipework' }
];

const DISTANCES = {
  concrete:   { road: 25 },
  rubble:     { road: 25 },
  timber_dw:  { road: 60 },
  tiles:      { road: 130, sea: 3000 },
  timber_cup: { road: 60 },
  ms_grills:  { road: 40 },
  aluminium:  { road: 130, sea: 3500 },
  rebar:      { road: 130, sea: 3000 },
  pvc110:     { road: 40 },
  pvc63:      { road: 40 }
};

// A5.1 — demolition lines, taken from the BOQ demolition scope.
const DEMOLITION_ITEMS = [
  { name: 'Concrete (demolished)',        quantity: 6,   unit: 'm3', densityKey: 'concrete_normal' },
  { name: 'Brickwork (demolished)',       quantity: 3,   unit: 'm3', densityKey: 'brickwork' },
  { name: 'Brick-paved floor (demolished)', quantity: 130, unit: 'm2', massFactor: 100 },
  { name: 'Glazed tiles (demolished)',    quantity: 32,  unit: 'm2', massFactor: 20 }
];

const POLICY_CAR = {
  policyType: 'CAR',
  basis: 'project_specific',
  premium: 24448.16,
  projectCost: 6499442
};

const POLICY_IDI = { ...POLICY_CAR, policyType: 'IDI', yearsOfCover: 10 };

const SITE_BASE = {
  gifa_m2: 1000,
  demolitionKm: 100,
  wasteDisposalKm: 40,
  demolitionItems: DEMOLITION_ITEMS
};

// Optional previous-project block — reproduces the workbook's Method B path.
const PREVIOUS_PROJECT = { area_m2: 1000, fuel_L: 5000, electricity_kWh: 2400, durationMonths: 12 };

const USE_STAGE = {
  equipmentType: 'Stationary AC (split/unitary)',
  refrigerant: 'R-410A'
};

module.exports = {
  MATERIALS, DISTANCES, DEMOLITION_ITEMS,
  POLICY_CAR, POLICY_IDI, SITE_BASE, PREVIOUS_PROJECT, USE_STAGE,
  /** Workbook path — previous-project site data supplied (A5.2 Method B). */
  workbookInput() {
    return {
      policy: POLICY_CAR,
      materials: MATERIALS,
      distances: DISTANCES,
      siteInputs: { ...SITE_BASE, previousProject: PREVIOUS_PROJECT }
    };
  },
  /** Default path — no previous-project data (A5.2 Method A, RICS 40/m²). */
  defaultInput() {
    return { policy: POLICY_CAR, materials: MATERIALS, distances: DISTANCES, siteInputs: { ...SITE_BASE } };
  },
  /** IDI path — use stage runs. */
  idiInput(extra = {}) {
    return {
      policy: POLICY_IDI,
      materials: MATERIALS,
      distances: DISTANCES,
      siteInputs: { ...SITE_BASE, previousProject: PREVIOUS_PROJECT },
      useStage: { ...USE_STAGE, ...(extra.useStage || {}) },
      ...extra
    };
  }
};
