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
async function seedDemoBook(registry, orgId) {
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

  const policies = projects.flatMap(p => p.policies || []);
  return {
    settings, clients, projects,
    summary: {
      clients: clients.length,
      projects: projects.length,
      policies: policies.length,
      totalPremium: policies.reduce((n, p) => n + Number(p.premium || 0), 0),
      withUseStage: policies.filter(p => p.scope && p.scope.useStageApplies).length,
      reportingYears: [...new Set(policies.map(p => p.reportingYear))].sort()
    }
  };
}

module.exports = { seedDemoBook, CLIENTS, PROJECTS, SETTINGS };
