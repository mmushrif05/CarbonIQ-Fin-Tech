/**
 * The results logframe — Stage 2 of Phase 1.
 *
 * GCF reports each core indicator from a baseline to a target by a year. The
 * composer reads the current figure off the record's own indicator field and
 * the baseline and target off the results map added in Stage 1, and lays them
 * in one row per indicator. It computes nothing and it never sums direct and
 * indirect beneficiaries. The readiness route returns it beside the scorecard.
 */

'use strict';

const request = require('supertest');
const app = require('../src/server');
const platformStore = require('../src/platform/database/store');
const gcf = require('../src/domains/gcf/infrastructure/store');
const { logframe } = require('../src/domains/gcf/domain/logframe');

const KEY = process.env.UI_API_KEY;
const auth = r => r.set('x-api-key', KEY);
const api = () => request(app);
const ORG = 'test-logframe';
const base = () => JSON.parse(JSON.stringify(require('../data/gcf/dfcc-starter-projects.json').projects[0]));

beforeEach(() => platformStore._resetMemory());

describe('the logframe composer', () => {
  test('reads current off the record and baseline/target off results, per indicator', () => {
    const p = base();
    p.results = { 'MCI-1': { baseline: { value: 0, tier: 'declared' }, target: { value: 280000, tier: 'modelled' }, targetYear: 2045 } };
    const lf = logframe(p);
    const mci = lf.rows.find(r => r.id === 'MCI-1');
    expect(mci.current.value).toBe(280000); // the record's lifetime figure
    expect(mci.baseline.value).toBe(0);
    expect(mci.target.value).toBe(280000);
    expect(mci.targetYear).toBe(2045);
    expect(mci.present).toBe(true);
  });

  test('direct and indirect are separate rows, never one', () => {
    const lf = logframe(base());
    const ids = lf.rows.map(r => r.id);
    expect(ids).toContain('ACI-1');
    expect(ids).toContain('ACI-2');
    expect(lf.note).toMatch(/never summed/i);
  });

  test('an indicator the project does not touch is absent, not zeroed', () => {
    const p = base();
    delete p.area; delete p.assets;
    const lf = logframe(p);
    const area = lf.rows.find(r => r.id === 'SUP-AREA');
    expect(area.present).toBe(false);
    expect(area.current).toBeNull();
  });
});

describe('the readiness route carries the logframe', () => {
  test('a recorded project returns the logframe beside the scorecard', async () => {
    const p = base();
    p.id = 'gcf_lf_route';
    p.results = { 'ACI-1': { baseline: { value: 100, tier: 'declared' }, target: { value: 12000, tier: 'modelled' }, targetYear: 2030 } };
    await gcf.put('ui', p, { by: 'Analyst' }); // the UI API key's organisation
    const r = (await auth(api().get('/v1/gcf/pipeline/gcf_lf_route/readiness')).expect(200)).body;
    expect(r.criteria).toBeTruthy();
    expect(r.logframe).toBeTruthy();
    const aci = r.logframe.rows.find(x => x.id === 'ACI-1');
    expect(aci.target.value).toBe(12000);
    expect(aci.targetYear).toBe(2030);
  });
});
