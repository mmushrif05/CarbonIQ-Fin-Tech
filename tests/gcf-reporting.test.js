/**
 * The GCF pipeline as a statutory disclosure — Lot 1 Milestone 4 complete.
 *
 * The rule this suite exists to hold: a pipeline of financed projects avoiding
 * 65,800 tCO2e a year is a real fact and is not the bank's inventory. It cannot
 * fill SLFRS S2 §29(a) or GRI 305-1/2/3, and putting it there would report an
 * emission the entity does not have in place of one it does.
 *
 * The rest is the discipline services/report-integrity.js already enforces
 * elsewhere, applied to a new standard: measured, declared or absent, and
 * never filled in.
 */

'use strict';

process.env.STORAGE_BACKEND = 'memory';
process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const request = require('supertest');
const app = require('../server');
const partcStore = require('../services/partc-store');
const reporting = require('../services/gcf/reporting');
const emissions = require('../services/gcf/emissions');
const integrity = require('../services/report-integrity');
const SEED = require('../data/gcf/pipeline.seed.json');

const KEY = process.env.UI_API_KEY;
const auth = r => r.set('x-api-key', KEY);
const api = () => request(app);
const P = SEED.projects;

const ENTITY = {
  entityName: 'DFCC Bank PLC',
  climateGovernance: 'The Board Integrated Risk Management Committee reviews climate matters.',
  managementRole: 'The Chief Risk Officer holds the mandate.',
  strategyNarrative: 'Green finance origination through the GCF accreditation.',
  riskManagementProcess: 'Taxonomy screening at origination, ESS categorisation at appraisal.',
  climateTargets: ['Portfolio alignment with the Sri Lanka Green Finance Taxonomy'],
};

beforeEach(() => partcStore._resetMemory());

describe('The pipeline is not the entity inventory, and the report says so', () => {
  const report = reporting.buildDisclosure(P, { reportingYear: 2026 });

  test('scope 1, 2 and 3 are reported absent, not filled from the pipeline', () => {
    const inv = report.metricsAndTargets.inventory;
    for (const k of ['scope1', 'scope2', 'scope3']) {
      expect(integrity.isPlaceholder(inv[k])).toBe(true);
      expect(inv[k]._status).toBe('not_measured');
    }
    expect(inv.scope3.reason).toMatch(/Category 15/);
    expect(inv.standardRef).toMatch(/§29\(a\)/);
  });

  test('the mitigation total never appears on an inventory line', () => {
    const inv = JSON.stringify(report.metricsAndTargets.inventory);
    expect(inv).not.toContain('65800');
    expect(inv).not.toContain('1202600');
  });

  test('GRI 305-1 through 305-5 are all answered absent, each with its reason', () => {
    for (const k of ['305-1', '305-2', '305-3', '305-4', '305-5']) {
      expect(integrity.isPlaceholder(report.gri[k])).toBe(true);
      expect(report.gri[k].reason.length).toBeGreaterThan(30);
    }
    expect(report.gri['305-5'].reason).toMatch(/own emissions/);
  });

  test('the pipeline is disclosed where it belongs, on three §29 lines', () => {
    const m = report.metricsAndTargets;
    expect(m.climateOpportunities.standardRef).toMatch(/§29\(d\)/);
    expect(m.climateOpportunities.alignedAmount).toBe(196500000);
    expect(m.capitalDeployment.standardRef).toMatch(/§29\(e\)/);
    expect(m.capitalDeployment.pipelineTotalCost).toBe(196500000);
    expect(m.capitalDeployment.gcfAsk).toBe(72000000);
    expect(m.avoidedAndReduced.annual_tCO2e).toBe(65800);
  });

  test('avoided emissions are stated apart and never netted', () => {
    const a = report.metricsAndTargets.avoidedAndReduced;
    expect(a.standardRef).toMatch(/never\s+deducted/);
    expect(a.note).toMatch(/not added to, and not subtracted from/);
    expect(a.adaptationCoBenefit.annual_tCO2e).toBe(9000);
    expect(a.annual_tCO2e).not.toBe(65800 + 9000);
    expect(a.annual_tCO2e).not.toBe(65800 - a.embodiedCarbon.a1a5_tCO2e);
  });

  test('the report says on its face that it is not a complete S2 disclosure', () => {
    expect(report.basis.covers).toMatch(/NOT a complete SLFRS S2 disclosure/);
    expect(report.basis.covers).toMatch(/one input to the entity's disclosure/);
  });

  test('the GRI supplementary line carries the same figures, not re-keyed ones', () => {
    const roll = emissions.portfolioEmissions(P);
    expect(report.gri.supplementary.annual_tCO2e).toBe(roll.headline.annual_tCO2e);
    expect(report.gri.supplementary.lifetime_tCO2e).toBe(roll.headline.lifetime_tCO2e);
  });
});

describe('Entity facts are declared or absent, never invented', () => {
  test('with nothing recorded, every entity item is absent with its clause', () => {
    const r = reporting.buildDisclosure(P);
    expect(integrity.isPlaceholder(r.governance.oversight)).toBe(true);
    expect(r.governance.oversight.standardRef).toBe('SLFRS S2 §6(a)');
    expect(integrity.isPlaceholder(r.metricsAndTargets.targets.entityTargets)).toBe(true);
    expect(r.gaps.length).toBeGreaterThan(5);
  });

  test('nothing resembling a board meeting or an FTE count is manufactured', () => {
    /* The exact failure the portfolio reports had: a quarterly board meeting,
       a three-person ESG team and a $340M pipeline, all literals under a cited
       clause. */
    const flat = JSON.stringify(reporting.buildDisclosure(P));
    expect(flat).not.toMatch(/quarterly/i);
    expect(flat).not.toMatch(/\b\d+\s*(FTE|full[- ]time)/i);
  });

  test('recorded facts pass through and the gaps close', () => {
    const bare = reporting.buildDisclosure(P);
    const full = reporting.buildDisclosure(P, { entityDisclosures: ENTITY });
    expect(full.governance.oversight).toBe(ENTITY.climateGovernance);
    expect(full.gaps.length).toBeLessThan(bare.gaps.length);
  });

  test('an empty string is an absent disclosure, not a made statement', () => {
    const r = reporting.buildDisclosure(P, { entityDisclosures: { ...ENTITY, climateGovernance: '   ' } });
    expect(integrity.isPlaceholder(r.governance.oversight)).toBe(true);
  });
});

describe('The checklist is answered from the report, so it can fail', () => {
  test('items depending on entity facts fail until those facts exist', () => {
    const bare = reporting.buildDisclosure(P);
    expect(bare.complete).toBe(false);
    expect(bare.checklist.filter(i => !i.met).length).toBeGreaterThan(4);
    for (const i of bare.checklist.filter(x => !x.met)) {
      expect(i.standardRef).toBeTruthy();
      expect(i.basis.length).toBeGreaterThan(10);
    }
  });

  test('the inventory item stays unmet even with every entity fact recorded', () => {
    /* And that is correct. This report is one input to an S2 disclosure, not
       the disclosure; a checklist that could reach 100% would be claiming
       otherwise. */
    const full = reporting.buildDisclosure(P, { entityDisclosures: ENTITY });
    const unmet = full.checklist.filter(i => !i.met);
    expect(unmet).toHaveLength(1);
    expect(unmet[0].item).toMatch(/scope 1, 2 and 3/);
    expect(full.complete).toBe(false);
    expect(full.completenessNote).toMatch(/does not claim to be/);
  });

  test('the measured items are met, because they are actually present', () => {
    const full = reporting.buildDisclosure(P, { entityDisclosures: ENTITY });
    const met = full.checklist.filter(i => i.met).map(i => i.item);
    expect(met).toEqual(expect.arrayContaining([
      expect.stringMatching(/Assets aligned/),
      expect.stringMatching(/Capital deployed/),
      expect.stringMatching(/stated separately/),
    ]));
  });
});

describe('A period package survives a transfer, or is refused', () => {
  test('export and re-import produce an identical roll-up', () => {
    const pkg = reporting.exportPeriod(P, { reportingYear: 2026 });
    const back = reporting.importPeriod(pkg);
    expect(back.projects).toHaveLength(5);
    expect(emissions.portfolioEmissions(back.projects).headline)
      .toEqual(emissions.portfolioEmissions(P).headline);
  });

  test('two exports of the same records checksum the same, despite the timestamp', () => {
    const a = reporting.exportPeriod(P, { reportingYear: 2026 });
    const b = reporting.exportPeriod([...P].reverse(), { reportingYear: 2026 });
    expect(a.checksum).toBe(b.checksum);
    expect(a.projects.map(p => p.id)).toEqual(b.projects.map(p => p.id));
  });

  test('a changed figure changes the checksum', () => {
    const pkg = reporting.exportPeriod(P, { reportingYear: 2026 });
    const tampered = JSON.parse(JSON.stringify(pkg));
    tampered.projects[0].mitigation.annual_tCO2e.value = 999999;
    expect(() => reporting.importPeriod(tampered)).toThrow(/checksum does not match/);
  });

  test('a truncated package is refused whole, not imported in part', () => {
    const pkg = reporting.exportPeriod(P, { reportingYear: 2026 });
    const short = { ...pkg, projects: pkg.projects.slice(0, 2) };
    expect(() => reporting.importPeriod(short)).toThrow(/CHECKSUM|checksum/);
  });

  test('a package with no checksum cannot be verified and is refused', () => {
    const pkg = reporting.exportPeriod(P, {});
    delete pkg.checksum;
    expect(() => reporting.importPeriod(pkg)).toThrow(/no checksum/);
  });

  test('an unknown format is refused rather than guessed at', () => {
    expect(() => reporting.importPeriod({ format: 'something/else', projects: [], checksum: 'x' }))
      .toThrow(/Unrecognised package format/);
  });

  test('a package is a transfer format, not an exemption from the schema', () => {
    const projects = JSON.parse(JSON.stringify(P));
    delete projects[0].mitigation.annual_tCO2e.tier;      // a bare number
    const pkg = reporting.exportPeriod(projects, {});
    expect(() => reporting.importPeriod(pkg)).toThrow(/invalid/i);
  });

  test('the canonical form is key-order independent', () => {
    const a = reporting.canonical({ b: 1, a: { d: 2, c: 3 } });
    const b = reporting.canonical({ a: { c: 3, d: 2 }, b: 1 });
    expect(a).toBe(b);
  });
});

describe('Over HTTP', () => {
  test('the report comes back with its gaps and does not claim completeness', async () => {
    const res = await auth(api().get('/v1/gcf/report?year=2026')).expect(200);
    expect(res.body.report.complete).toBe(false);
    expect(res.body.report.gaps.length).toBeGreaterThan(0);
    expect(res.body.report.basis.sample).toBe(true);
  });

  test('recording entity facts closes their gaps on the next read', async () => {
    const before = await auth(api().get('/v1/gcf/report')).expect(200);
    await auth(api().put('/v1/gcf/entity').send(ENTITY)).expect(200);
    const after = await auth(api().get('/v1/gcf/report')).expect(200);
    expect(after.body.report.gaps.length).toBeLessThan(before.body.report.gaps.length);
    expect(after.body.report.governance.oversight).toBe(ENTITY.climateGovernance);
  });

  test('an unrecorded entity says so rather than returning an empty object', async () => {
    const res = await auth(api().get('/v1/gcf/entity')).expect(200);
    expect(res.body.recorded).toBe(false);
    expect(res.body.note).toMatch(/reported absent/);
  });

  test('a field the schema does not know is refused, not silently stored', async () => {
    const res = await auth(api().put('/v1/gcf/entity').send({ ...ENTITY, boardMeetings: 4 })).expect(400);
    expect(res.body.error).toBe('INVALID_ENTITY_DISCLOSURES');
  });

  test('export then import round-trips over the wire', async () => {
    const pkg = (await auth(api().get('/v1/gcf/export?year=2026')).expect(200)).body;
    expect(pkg.checksum).toMatch(/^[0-9a-f]{64}$/);
    const res = await auth(api().post('/v1/gcf/import').send(pkg)).expect(201);
    expect(res.body.imported).toBe(5);
    const after = await auth(api().get('/v1/gcf/emissions')).expect(200);
    expect(after.body.source).toBe('recorded');
    expect(after.body.emissions.headline.annual_tCO2e).toBe(65800);
  });

  test('a tampered package is refused at the door and writes nothing', async () => {
    const pkg = (await auth(api().get('/v1/gcf/export')).expect(200)).body;
    pkg.projects[0].financing.gcfAsk = 1;
    await auth(api().post('/v1/gcf/import').send(pkg)).expect(400);
    const after = await auth(api().get('/v1/gcf/pipeline')).expect(200);
    expect(after.body.pipeline.source).toBe('seed');
  });

  test('a year that is not a year is refused', async () => {
    await auth(api().get('/v1/gcf/report?year=soon')).expect(400);
  });

  test('every reporting endpoint needs a key', async () => {
    await api().get('/v1/gcf/report').expect(401);
    await api().get('/v1/gcf/export').expect(401);
    await api().post('/v1/gcf/import').send({}).expect(401);
    await api().get('/v1/gcf/entity').expect(401);
  });
});
