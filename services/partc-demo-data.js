/**
 * CarbonIQ FinTech — PCAF Part C demo book
 *
 * Ceylon Insurance PLC, FY2026. Shaped so a demo shows the things that
 * actually matter rather than five identical rows:
 *
 *   · a CAR policy and a later IDI policy on the SAME building, so the
 *     scope gate is visible in both states
 *   · a project with no BOQ, which will sit at the weakest data quality and
 *     give the improvement plan something real to rank
 *   · a road project, so the book is not all buildings
 *   · premiums spanning two orders of magnitude, so the weighted data
 *     quality score differs visibly from a simple average
 */

'use strict';

const fx = require('../tests/fixtures/fisheries');

/**
 * Haul distances belong ON the BOQ line, not in a separate map keyed by id.
 * A revision is a self-contained statement of what is being built and where
 * it comes from, so a comparison between two revisions needs nothing else to
 * reproduce A4. Without this, transport silently drops out of the diff.
 */
const withDistances = items => items.map(m => ({
  ...m,
  distance: fx.DISTANCES[m.id] || {},
  // The wording a quantity surveyor would actually write, so a client who
  // re-pastes an amended BOQ matches these lines and inherits their mapping.
  sourceText: BOQ_DESCRIPTIONS[m.id] || m.name
}));

const BOQ_DESCRIPTIONS = {
  concrete:   'Providing and laying 1:2:4 cement concrete in foundations and floors',
  rubble:     'Rubble masonry in 1:5 cement mortar',
  timber_dw:  'Supplying and fixing timber doors and windows',
  tiles:      'Supplying and laying ceramic/porcelain floor tiles',
  timber_cup: 'Timber cupboards and fitted joinery',
  ms_grills:  'Mild steel grills to windows',
  aluminium:  'Aluminium doors and cladding panels',
  rebar:      'High tensile reinforcement steel (Tor)',
  pvc110:     'PVC pipe 110mm diameter',
  pvc63:      'PVC pipe 63mm diameter'
};

/**
 * BOQ revisions for the reference project, so the demo can show the thing
 * that actually happens on site: a bill of quantities that changes.
 *
 *   R1  tender
 *   R2  variation order — more concrete. Moves the figure by well under 1%,
 *       which is the useful lesson: material quantities barely shift a figure
 *       that site energy dominates.
 *   R3  as-built with a corrected fuel log — the change that DOES breach the
 *       5% threshold and forces a restatement.
 */
const BOQ_REVISIONS = [
  { note: 'Tender BOQ', source: 'seed',
    materials: withDistances(fx.MATERIALS), demolitionItems: fx.DEMOLITION_ITEMS },
  { note: 'VO-01 — additional foundation concrete', source: 'seed',
    materials: withDistances(fx.MATERIALS.map(m => m.id === 'concrete' ? { ...m, quantity: 22.65 } : m)),
    demolitionItems: fx.DEMOLITION_ITEMS },
  { note: 'As-built — final quantities', source: 'seed',
    materials: withDistances(fx.MATERIALS.map(m =>
      m.id === 'concrete' ? { ...m, quantity: 24.10 } :
      m.id === 'rubble'   ? { ...m, quantity: 7.20 }  : m)),
    demolitionItems: fx.DEMOLITION_ITEMS }
];

const CLIENTS = [
  { key: 'fisheries', name: 'Department of Fisheries', sector: 'Government — fisheries', country: 'Sri Lanka',
    contactName: 'Ministry Projects Unit', notes: 'Coastal infrastructure programme.' },
  { key: 'harbour',   name: 'Harbour Developments (Pvt) Ltd', sector: 'Property development', country: 'Sri Lanka',
    contactName: 'Development Office' },
  { key: 'rda',       name: 'Road Development Authority', sector: 'Government — transport', country: 'Sri Lanka' }
];

const PROJECTS = [
  {
    clientKey: 'fisheries', name: 'Negombo Fisheries Complex', projectType: 'building',
    gifa_m2: 1000, location: 'Negombo, Western Province', projectCost: 6499442,
    constructionStart: '2026-03-01T00:00:00.000Z', constructionEnd: '2027-06-30T00:00:00.000Z',
    notes: 'Reference project. Matches the Fisheries A4 workbook.',
    policies: [
      { reference: 'CAR-2026-0041', lineType: 'CAR', premium: 24448.16,
        inception: '2026-03-01T00:00:00.000Z', expiry: '2027-09-01T00:00:00.000Z', whoPays: 'OCIP' },
      // Same building, ten years later — the use-stage line becomes visible.
      { reference: 'IDI-2027-0007', lineType: 'IDI', premium: 41200, yearsOfCover: 10,
        inception: '2027-09-01T00:00:00.000Z', expiry: '2037-09-01T00:00:00.000Z', whoPays: 'OCIP' }
    ]
  },
  {
    clientKey: 'harbour', name: 'Galle Marina Retail Block', projectType: 'building',
    gifa_m2: 3400, location: 'Galle, Southern Province', projectCost: 41800000,
    constructionStart: '2026-01-15T00:00:00.000Z', constructionEnd: '2027-04-30T00:00:00.000Z',
    policies: [
      { reference: 'CAR-2026-0012', lineType: 'CAR', premium: 156750, reinsuranceCeded: 39187,
        inception: '2026-01-15T00:00:00.000Z', expiry: '2027-07-15T00:00:00.000Z', whoPays: 'CCIP' }
    ]
  },
  {
    clientKey: 'harbour', name: 'Kandy Cold Storage Depot', projectType: 'structure',
    gifa_m2: 780, location: 'Kandy, Central Province', projectCost: 9250000,
    policies: [
      { reference: 'IDI-2026-0112', lineType: 'IDI', premium: 18400, yearsOfCover: 10,
        inception: '2026-06-01T00:00:00.000Z', expiry: '2036-06-01T00:00:00.000Z' }
    ]
  },
  {
    clientKey: 'rda', name: 'Puttalam Coastal Road Section B', projectType: 'road',
    gifa_m2: 24000, location: 'Puttalam, North Western Province', projectCost: 118400000,
    policies: [
      { reference: 'EAR-2026-0033', lineType: 'EAR', premium: 402000,
        inception: '2026-05-20T00:00:00.000Z', expiry: '2028-05-20T00:00:00.000Z', whoPays: 'OCIP' }
    ]
  },
  {
    // Deliberately thin: no BOQ will be supplied, so this sits at the weakest
    // data quality and anchors the improvement plan.
    clientKey: 'rda', name: 'Matara Weighbridge Station', projectType: 'structure',
    gifa_m2: 240, location: 'Matara, Southern Province', projectCost: 1850000,
    notes: 'No bill of quantities supplied — benchmark assessment only.',
    policies: [
      { reference: 'CAR-2026-0098', lineType: 'CAR', premium: 7100,
        inception: '2026-08-10T00:00:00.000Z', expiry: '2027-02-10T00:00:00.000Z' }
    ]
  }
];

const SETTINGS = {
  insurerName: 'Ceylon Insurance PLC',
  reportingYear: 2026,
  currency: 'LKR',
  region: 'Sri Lanka',
  premiumBasis: 'gross',
  restatementThresholdPct: 5,
  reportingYearConvention: 'inception'
};

/**
 * Create the whole demo book against a registry instance.
 * @returns {Promise<{settings, clients, projects, summary}>}
 */
async function seedDemoBook(registry, orgId, boqService = null) {
  const settings = await registry.saveSettings(orgId, SETTINGS);

  const clientsByKey = {};
  const clients = [];
  for (const { key, ...data } of CLIENTS) {
    const created = await registry.createClient(orgId, data);
    clientsByKey[key] = created.clientId;
    clients.push(created);
  }

  const projects = [];
  for (const { clientKey, ...data } of PROJECTS) {
    projects.push(await registry.createProject(orgId, { ...data, clientId: clientsByKey[clientKey] }));
  }

  // BOQ revisions on the reference project only — the others stand at tender
  // or, in the weighbridge's case, with no BOQ at all.
  let boqRevisions = [];
  if (boqService) {
    const negombo = projects.find(p => /Negombo/.test(p.name));
    if (negombo) {
      for (const rev of BOQ_REVISIONS) {
        boqRevisions.push(await boqService.createRevision(orgId, negombo.projectId, rev));
      }
    }
  }

  const policies = projects.flatMap(p => p.policies || []);
  return {
    settings, clients, projects, boqRevisions,
    summary: {
      clients: clients.length,
      projects: projects.length,
      policies: policies.length,
      totalPremium: policies.reduce((n, p) => n + Number(p.premium || 0), 0),
      withUseStage: policies.filter(p => p.scope && p.scope.useStageApplies).length,
      reportingYears: [...new Set(policies.map(p => p.reportingYear))].sort(),
      boqRevisions: boqRevisions.length
    }
  };
}

module.exports = { seedDemoBook, CLIENTS, PROJECTS, SETTINGS, BOQ_REVISIONS };
