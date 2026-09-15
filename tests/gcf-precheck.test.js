/**
 * The sponsor pre-check, and the results logframe fields on the record.
 *
 * Stage 1 of Phase 1. The pre-check is the plain-language self-screen a
 * sponsor answers before the full intake; it reads the answers into an
 * advisory (held, attention, stop) and stores nothing. The record now also
 * carries a baseline and target per indicator and the pre-check answers, both
 * optional and backward compatible.
 *
 * What is pinned:
 *   • category A is a stop, with a way forward, because DFCC is accredited to
 *     B/I-2 and cannot carry it — grounded in the accreditation, not invented;
 *   • a clean set of answers is all ok;
 *   • the pre-check never persists and needs only a read scope;
 *   • the record accepts results and preCheck and round-trips them.
 */

'use strict';

const request = require('supertest');
const app = require('../src/server');
const platformStore = require('../src/platform/database/store');
const gcf = require('../src/domains/gcf/infrastructure/store');
const record = require('../src/domains/gcf/domain/record');
const { precheck } = require('../src/domains/gcf/domain/precheck');

const KEY = process.env.UI_API_KEY;
const auth = r => r.set('x-api-key', KEY);
const api = () => request(app);
const ORG = 'test-precheck';

beforeEach(() => platformStore._resetMemory());

describe('the pre-check advisory', () => {
  test('category A is a stop and names the way forward', () => {
    const r = precheck({ essCategoryGuess: 'A', counterfactual: 'grid electricity', estimatedCost_usd: 5e6 });
    expect(r.verdict).toBe('stop');
    const ess = r.items.find(i => i.id === 'essCategory');
    expect(ess.verdict).toBe('stop');
    expect(ess.note).toMatch(/B\.36\/10|accreditation/);
    expect(ess.note).toMatch(/separable|component/);
  });

  test('a complete, in-scope set of answers is all ok', () => {
    const r = precheck({
      essCategoryGuess: 'B', counterfactual: 'grid electricity displaced', estimatedCost_usd: 30e6,
      stream: 'mitigation', hasRevenueStream: true, dependsOnGrant: false,
      landAndConsent: 'clear', ndaInformed: true,
    });
    expect(r.verdict).toBe('ok');
    expect(r.items.every(i => i.verdict === 'ok')).toBe(true);
  });

  test('a grant-dependent adaptation design is a mandate question, not a stop', () => {
    const r = precheck({ essCategoryGuess: 'B', counterfactual: 'x', estimatedCost_usd: 5e6, stream: 'adaptation', hasRevenueStream: false, ndaInformed: true, landAndConsent: 'clear' });
    expect(r.verdict).toBe('attention');
    const m = r.items.find(i => i.id === 'mandate');
    expect(m.verdict).toBe('attention');
    expect(m.note).toMatch(/grant modality|mandate/);
  });

  test('a size above the accreditation ceiling is flagged for attention', () => {
    const r = precheck({ essCategoryGuess: 'B', counterfactual: 'x', estimatedCost_usd: 400e6, stream: 'mitigation', hasRevenueStream: true, ndaInformed: true, landAndConsent: 'clear' });
    expect(r.items.find(i => i.id === 'size').verdict).toBe('attention');
  });
});

describe('the pre-check route', () => {
  test('returns the advisory and stores nothing', async () => {
    const before = await gcf.list(ORG);
    const r = (await auth(api().post('/v1/gcf/precheck')).send({ essCategoryGuess: 'A', counterfactual: '' }).expect(200)).body;
    expect(r.precheck.verdict).toBe('stop');
    const after = await gcf.list(ORG);
    expect(after.source).toBe(before.source); // nothing recorded
  });

  test('a bad answer value is refused', async () => {
    await auth(api().post('/v1/gcf/precheck')).send({ essCategoryGuess: 'Z' }).expect(400);
  });
});

describe('the record carries results and preCheck', () => {
  test('a project with a logframe and pre-check validates and round-trips', async () => {
    const base = require('../data/gcf/dfcc-starter-projects.json').projects[0];
    const p = {
      ...JSON.parse(JSON.stringify(base)),
      id: 'gcf_lf_test',
      results: { 'MCI-1': { baseline: { value: 0, tier: 'declared' }, target: { value: 280000, tier: 'modelled' }, targetYear: 2045 } },
      preCheck: { counterfactual: 'grid', essCategoryGuess: 'B', ndaInformed: false },
    };
    expect(() => record.validate(p)).not.toThrow();
    await gcf.put(ORG, p, { by: 'Analyst' });
    const got = await gcf.get(ORG, 'gcf_lf_test');
    expect(got.project.results['MCI-1'].targetYear).toBe(2045);
    expect(got.project.preCheck.essCategoryGuess).toBe('B');
  });
});
