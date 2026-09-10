/**
 * The master baseline table.
 *
 * PCAF sets the method; it does not set Sri Lanka's baseline. Somebody
 * credible and in-region has to, and the whole value of that position rests on
 * one thing: a baseline that cannot be moved quietly. If one institution can
 * change its number without a recorded reason, every number in the market
 * becomes negotiable — so these tests are about governance, not arithmetic.
 */

'use strict';


const request = require('supertest');
const app = require('../src/server');
const store = require('../src/platform/database/store');
const registry = require('../src/domains/baseline/application/registry');
const baseline = require('../src/domains/baseline/domain/baseline');
const { resolve } = require('../src/domains/baseline/domain/resolve');

const KEY = process.env.UI_API_KEY;
const auth = req => req.set('x-api-key', KEY);
const ORG = 'ui';

const LK = {
  metric: 'construction_intensity_kgCO2e_m2',
  scope: 'country',
  country: 'LK',
  values: { green: 500, transition: 760 },
  source: 'CBSL consultation response, March 2026',
  authority: 'Datum Solutions',
};

const market = { orgId: ORG, actor: 'admin@datum.lk', mayGovernMarket: true };
const tenant = { orgId: ORG, actor: 'analyst@bank.lk', mayGovernMarket: false };

beforeEach(async () => { await store._resetMemory(); });

describe('One screen, and every reader agrees', () => {
  test('the taxonomy endpoint and the certificate assign from the same bands', async () => {
    /* They did not. 520/780 screened the taxonomy and 600/900 assigned the
       certificate tier, so a building at 560 kgCO2e/m² was Green from one and
       Transition from the other, and a bank had two answers to one question
       about what it may call a green loan. */
    const { checkAllTaxonomies } = require('../src/domains/taxonomy/domain/taxonomy');
    const { generateCertificate } = require('../src/domains/taxonomy/domain/certificate');

    const screened = checkAllTaxonomies({ totalEmission_tCO2e: 5.6, buildingArea_m2: 10 });
    const cert = generateCertificate({
      projectName: 'Border case', bankName: 'DFCC', emissions_tCO2e: 5.6, buildingArea_m2: 10,
    });
    expect(screened.sriLanka.intensity_kgCO2e_m2).toBe(560);
    expect(screened.sriLanka.classification).toBe('transition');
    expect(cert.classification.tier).toBe('transition');
  });

  test('the screen says it is not a taxonomy threshold, wherever it appears', async () => {
    const { checkAllTaxonomies } = require('../src/domains/taxonomy/domain/taxonomy');
    const r = checkAllTaxonomies({ totalEmission_tCO2e: 4, buildingArea_m2: 10 });
    expect(r.sriLanka.screen.isTaxonomyThreshold).toBe(false);

    const res = await auth(request(app).get('/v1/ndc-sdg/framework'));
    expect(res.status).toBe(200);
    expect(res.body.intensityScreen.isTaxonomyThreshold).toBe(false);
    expect(res.body.intensityScreen.note).toMatch(/sets no absolute/);
  });
});

describe('What is in force, and why that one', () => {
  test('nothing released resolves to the shipped seed, marked provisional', async () => {
    const eff = await registry.effective('construction_intensity_kgCO2e_m2', { country: 'LK', orgId: ORG });
    expect(eff.values).toEqual({ green: 520, transition: 780 });
    expect(eff.scope).toBe('seed');
    expect(eff.provisional).toBe(true);
    expect(eff.basis).toMatch(/illustrative/i);
  });

  test('a country baseline replaces the seed entirely once released', async () => {
    const draft = await registry.createDraft(LK, market);
    const live = await registry.releaseDraft(draft.baselineId, market);
    expect(live.status).toBe('released');

    const eff = await registry.effective('construction_intensity_kgCO2e_m2', { country: 'LK', orgId: ORG });
    expect(eff.values).toEqual({ green: 500, transition: 760 });
    expect(eff.scope).toBe('country');
    expect(eff.provisional).toBe(false);
    expect(eff.version).toBe(1);
  });

  test("an organisation's own baseline beats the country's, for that organisation only", async () => {
    const country = await registry.createDraft(LK, market);
    await registry.releaseDraft(country.baselineId, market);

    const own = await registry.createDraft({ ...LK, scope: 'organisation', orgId: ORG,
      values: { green: 420, transition: 700 }, source: 'Board-approved lending standard 2026' }, tenant);
    await registry.releaseDraft(own.baselineId, tenant);

    const mine = await registry.effective('construction_intensity_kgCO2e_m2', { country: 'LK', orgId: ORG });
    expect(mine.values).toEqual({ green: 420, transition: 700 });
    expect(mine.scope).toBe('organisation');

    const theirs = await registry.effective('construction_intensity_kgCO2e_m2', { country: 'LK', orgId: 'another-bank' });
    expect(theirs.values).toEqual({ green: 500, transition: 760 });
    expect(theirs.scope).toBe('country');
  });

  test('a country with no baseline is absent, not defaulted', async () => {
    /* A number invented to fill the gap would be quoted as regional judgement,
       which is the one thing this registry exists to make trustworthy. */
    const eff = await registry.effective('construction_intensity_kgCO2e_m2', { country: 'SG', orgId: ORG });
    expect(eff.resolved).toBe(false);
    expect(eff.values).toBeNull();
    expect(eff.needs).toMatch(/Release a country baseline/);
  });

  test('every figure that rests on a baseline can name the version behind it', async () => {
    const draft = await registry.createDraft(LK, market);
    await registry.releaseDraft(draft.baselineId, market);

    const cert = await auth(request(app).post('/v1/ndc-sdg/certificate'))
      .send({ projectName: 'Harbour', bankName: 'DFCC', emissions_tCO2e: 5.0, buildingArea_m2: 10 });
    expect(cert.status).toBe(201);
    const thresholds = cert.body.certificate.classification.thresholds;
    expect(thresholds.green).toBe('≤500 kgCO2e/m²');
    expect(thresholds.baselineVersion).toBe(1);
    expect(thresholds.provisional).toBe(false);
  });
});

describe('A released baseline does not move quietly', () => {
  test('a draft is not in force until it is released', async () => {
    await registry.createDraft(LK, market);
    const eff = await registry.effective('construction_intensity_kgCO2e_m2', { country: 'LK', orgId: ORG });
    expect(eff.scope).toBe('seed');
  });

  test('a released baseline cannot be created over — it is superseded', async () => {
    const d = await registry.createDraft(LK, market);
    await registry.releaseDraft(d.baselineId, market);
    await expect(registry.createDraft(LK, market)).rejects.toMatchObject({ code: 'ALREADY_RELEASED', statusCode: 409 });
  });

  test('a movement at or above the threshold requires a reason', async () => {
    const d = await registry.createDraft(LK, market);
    const live = await registry.releaseDraft(d.baselineId, market);

    await expect(registry.supersede(live.baselineId, { values: { green: 400, transition: 700 } }, market))
      .rejects.toMatchObject({ code: 'REASON_REQUIRED', statusCode: 400 });

    const next = await registry.supersede(live.baselineId,
      { values: { green: 400, transition: 700 }, reason: 'CBSL Direction 05 revision, February 2026' }, market);
    expect(next.version).toBe(2);
    expect(next.restatement.isRestatement).toBe(true);
    expect(next.restatement.previousValues).toEqual({ green: 500, transition: 760 });
    expect(next.restatement.movementPct).toBeGreaterThanOrEqual(5);
  });

  test('a movement below the threshold is a version, not a restatement', async () => {
    const d = await registry.createDraft(LK, market);
    const live = await registry.releaseDraft(d.baselineId, market);
    const next = await registry.supersede(live.baselineId, { values: { green: 505, transition: 765 } }, market);
    expect(next.restatement.isRestatement).toBe(false);
    expect(next.version).toBe(2);
  });

  test('releasing the next version supersedes the last one, and only one is ever in force', async () => {
    const d = await registry.createDraft(LK, market);
    const v1 = await registry.releaseDraft(d.baselineId, market);
    const v2 = await registry.supersede(v1.baselineId,
      { values: { green: 400, transition: 700 }, reason: 'CBSL revision' }, market);
    await registry.releaseDraft(v2.baselineId, market);

    const table = await registry.list(ORG, { metric: LK.metric });
    const released = table.baselines.filter(b => b.status === 'released');
    expect(released.length).toBe(1);
    expect(released[0].version).toBe(2);
    expect(table.baselines.find(b => b.version === 1).status).toBe('superseded');
  });

  test('the record hashes to what it says, so a quoted figure can be traced', async () => {
    const d = await registry.createDraft(LK, market);
    const live = await registry.releaseDraft(d.baselineId, market);
    expect(live.verified).toBe(true);

    const tampered = { ...live, values: { green: 999, transition: 1200 } };
    expect(baseline.verify(tampered).valid).toBe(false);
  });
});

describe("A tenant governs its own figure and nobody else's", () => {
  test("a country baseline is the market's, and needs the admin scope", async () => {
    await expect(registry.createDraft(LK, tenant))
      .rejects.toMatchObject({ code: 'MARKET_SCOPE_REFUSED', statusCode: 403 });
  });

  test('an organisation cannot govern another organisation', async () => {
    await expect(registry.createDraft(
      { ...LK, scope: 'organisation', orgId: 'someone-else' }, tenant))
      .rejects.toMatchObject({ code: 'NOT_YOUR_BASELINE', statusCode: 403 });
  });
});

describe("The pledge is declared, and the position against it is measured", () => {
  test('a pledge needs an organisation baseline to be measured against', async () => {
    await expect(registry.setPledge('construction_intensity_kgCO2e_m2', {
      targetPct: 40, baseYear: 2025, targetYear: 2030,
      statedBy: 'DFCC Bank', reference: 'Sustainability Report 2025, p.12',
    }, tenant)).rejects.toMatchObject({ code: 'NO_ORGANISATION_BASELINE', statusCode: 409 });
  });

  test('a recorded pledge is declared throughout, and the position is measured', async () => {
    const own = await registry.createDraft({ ...LK, scope: 'organisation', orgId: ORG,
      values: { green: 600, transition: 900 }, source: 'Board-approved lending standard 2026' }, tenant);
    await registry.releaseDraft(own.baselineId, tenant);

    const withPledge = await registry.setPledge('construction_intensity_kgCO2e_m2', {
      targetPct: 40, baseYear: 2025, targetYear: 2030,
      basis: 'kgCO2e/m² across the financed construction book',
      statedBy: 'DFCC Bank', reference: 'Sustainability Report 2025, p.12',
    }, tenant);
    expect(withPledge.pledge.kind).toBe('declared');
    expect(withPledge.pledge.statedBy).toBe('DFCC Bank');

    const progress = await registry.pledgeProgress('construction_intensity_kgCO2e_m2',
      { country: 'LK', orgId: ORG }, { currentValue: 540, asOfYear: 2026 });
    expect(progress.available).toBe(true);
    expect(progress.kind).toBe('measured');
    expect(progress.achievedPct).toBe(10);
    expect(progress.remainingPct).toBe(30);
    expect(progress.direction).toBe('reducing');
  });

  test('no pledge is invented where none was recorded', async () => {
    const p = await registry.pledgeProgress('construction_intensity_kgCO2e_m2', { country: 'LK', orgId: ORG }, {});
    expect(p.available).toBe(false);
    expect(p.reason).toMatch(/No pledge has been recorded/);
    expect(p.needs).toMatch(/would not be a commitment/);
  });
});

describe('The vocabulary is closed, and says what is wired', () => {
  test('a metric nobody reads yet says so rather than shipping invented values', () => {
    const { metrics } = registry.metrics();
    const wired = metrics.filter(m => m.wired).map(m => m.key);
    expect(wired).toEqual(['construction_intensity_kgCO2e_m2']);

    const seed = require('../data/baselines/seed.json');
    const seeded = new Set(seed.baselines.map(b => b.metric));
    for (const m of metrics.filter(x => !x.wired)) {
      expect({ metric: m.key, seeded: seeded.has(m.key) }).toEqual({ metric: m.key, seeded: false });
    }
  });

  test('a band set out of order is refused', () => {
    const r = resolve('construction_intensity_kgCO2e_m2', { country: 'LK' }, [], []);
    expect(r.resolved).toBe(false);
    expect(() => baseline.create({ ...LK, values: { green: 900, transition: 500 } }))
      .toThrow(/cannot be above the transition threshold/);
  });
});
