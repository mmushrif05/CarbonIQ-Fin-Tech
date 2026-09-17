/**
 * The SLFRS S2 climate facts the bank states about itself.
 *
 * Three claims are worth a test here and the third is the one that matters.
 *
 * The registry is the single source: the Joi schema, the normaliser, the
 * readiness and the form all read `domain/climate/items.js`, so a field added
 * in one place is accepted in every other on the same commit. The test proves
 * it by walking the registry rather than by naming fields.
 *
 * A patch merges path by path, so a form that renders one pillar can save it
 * without clearing the other three.
 *
 * And provenance is derived by comparison, never stored. The product ships an
 * illustrative pack so a trial opens on a whole disclosure, and every sentence
 * in it is the tool provider's rather than the bank's. An item still equal to
 * the pack reads as illustrative; change one word and it is the bank's. That
 * is what stops a governance paragraph we wrote printing as a statement the
 * bank made.
 */

'use strict';

const request = require('supertest');
const climate = require('../src/domains/pcaf-part-a/domain/climate');
const facts = require('../src/domains/pcaf-part-a/domain/climate/facts');
const { climateSchema } = require('../src/domains/pcaf-part-a/interface/schemas/climate');
const settings = require('../src/domains/pcaf-part-a/application/parta-settings');
const app = require('../src/server');
const store = require('../src/platform/database/store');
const repo = require('../src/domains/pcaf-part-a/infrastructure/store');
const { issueKey } = require('./helpers/key');

let ORG = 'climate-facts-test';
let KEY = null;

/* The settings are one row per organisation, so a suite that installs the
   illustrative pack has to clear it or its next install is the 409 it proves
   elsewhere. */
async function clear() {
  try { await store.remove(repo.SETTINGS, ORG, 'default'); } catch (_) { /* nothing held */ }
}

beforeAll(async () => {
  const k = await issueKey({ orgId: ORG, keyName: 'climate facts suite' });
  KEY = k.key; ORG = k.orgId;
});
beforeEach(clear);
afterAll(clear);

describe('the registry is the one source', () => {
  test('every item names a pillar, a paragraph and a kind the normaliser knows', () => {
    const pillars = new Set(climate.PILLARS.map(p => p.id));
    const kinds = new Set(['text', 'enum', 'number', 'figure', 'carbonPrice', 'remuneration', 'list']);
    for (const item of climate.ITEMS) {
      expect({ path: item.path, pillar: pillars.has(item.pillar) }).toEqual({ path: item.path, pillar: true });
      expect({ path: item.path, kind: kinds.has(item.kind) }).toEqual({ path: item.path, kind: true });
      expect(item.paragraph).toMatch(/^S2 §/);
      expect(typeof item.label).toBe('string');
    }
  });

  test('every enum item names a list the vocabulary holds, and every row field too', () => {
    const lists = new Set(Object.keys(climate.VOCABULARY));
    for (const item of climate.ITEMS.filter(i => i.kind === 'enum')) {
      expect({ path: item.path, list: lists.has(item.list) }).toEqual({ path: item.path, list: true });
    }
    for (const [name, shape] of Object.entries(climate.ROW_SHAPES)) {
      for (const field of shape.filter(f => f.kind === 'enum')) {
        expect({ name, key: field.key, list: lists.has(field.list) }).toEqual({ name, key: field.key, list: true });
      }
    }
  });

  test('the schema accepts every path the registry declares, and refuses one it does not', () => {
    for (const item of climate.ITEMS) {
      const [group, key] = item.path.split('.');
      const probe = { [group]: { [key]: item.kind === 'list' ? [] : item.kind === 'number' ? 1 : null } };
      const { error } = climateSchema.validate(probe);
      expect({ path: item.path, error: error ? error.message : null }).toEqual({ path: item.path, error: null });
    }
    expect(climateSchema.validate({ governance: { oversite: 'x' } }).error.message).toMatch(/is not allowed/);
  });

  test('an answer outside its vocabulary is refused by the schema and cleared by the normaliser', () => {
    expect(climateSchema.validate({ governance: { frequency: 'fortnightly' } }).error).toBeTruthy();
    const out = facts.normalise({}, { governance: { frequency: 'fortnightly' } });
    expect(out.governance.frequency).toBeNull();
  });
});

describe('recording', () => {
  test('a patch merges path by path, so one pillar does not clear the rest', () => {
    const first = facts.normalise({}, { governance: { body: 'Board Risk Committee' } });
    const second = facts.normalise(first, { riskManagement: { monitoring: 'Reviewed quarterly.' } });
    expect(second.governance.body).toBe('Board Risk Committee');
    expect(second.riskManagement.monitoring).toBe('Reviewed quarterly.');
  });

  test('a repeating row missing a required field is dropped rather than stored half-empty', () => {
    const out = facts.normalise({}, {
      strategy: {
        exposures: [
          { title: 'Flood exposure', nature: 'risk', horizon: 'medium' },
          { title: 'No horizon given', nature: 'risk' },
        ],
      },
    });
    expect(out.strategy.exposures).toHaveLength(1);
    expect(out.strategy.exposures[0].title).toBe('Flood exposure');
  });

  test('a figure states a number or a reason it is absent, and the two are different answers', () => {
    const stated = facts.normalise({}, { inventory: { scope1: { value: 412, basis: 'calculated' } } });
    expect(stated.inventory.scope1.value).toBe(412);
    expect(stated.inventory.scope1.absentReason).toBeNull();

    const absent = facts.normalise({}, { inventory: { scope1: { absentReason: 'Not yet measured.' } } });
    expect(absent.inventory.scope1.value).toBeNull();
    expect(absent.inventory.scope1.absentReason).toBe('Not yet measured.');

    const neither = facts.normalise({}, { inventory: { scope1: {} } });
    expect(neither.inventory.scope1).toBeNull();
  });
});

describe('the illustrative pack, and telling its words from the bank\'s', () => {
  test('the shipped pack answers almost every item and carries no endorsement language', () => {
    expect(climate.ILLUSTRATIVE_ITEMS).toBeGreaterThanOrEqual(climate.ITEMS.length - 2);
    const integrity = require('../src/shared/report-integrity');
    expect(integrity.containsForbiddenLanguage(JSON.stringify(climate.ILLUSTRATIVE))).toEqual([]);
  });

  test('an item equal to the pack is illustrative, and one word of difference makes it the bank\'s', () => {
    const asShipped = climate.readiness(climate.ILLUSTRATIVE);
    expect(asShipped.stated).toBe(0);
    expect(asShipped.illustrative).toBe(climate.ILLUSTRATIVE_ITEMS);

    const edited = facts.normalise(climate.ILLUSTRATIVE, { governance: { body: 'Board Sustainability Committee' } });
    const after = climate.readiness(edited);
    expect(after.stated).toBe(1);
    expect(after.illustrative).toBe(climate.ILLUSTRATIVE_ITEMS - 1);
    expect(after.items.find(i => i.path === 'governance.body').state).toBe('stated');
  });

  test('an empty record is absent throughout, and every pillar says so', () => {
    const r = climate.readiness({});
    expect(r.stated + r.illustrative).toBe(0);
    expect(r.absent).toBe(climate.ITEMS.length);
    expect(r.pillars.map(p => p.state)).toEqual(['absent', 'absent', 'absent', 'absent']);
  });
});

describe('over the store', () => {
  test('the settings round-trip and readiness is derived on read, never stored', async () => {
    await settings.saveSettings(ORG, { climate: { governance: { body: 'Board Risk Committee' } } });
    const held = await settings.getSettings(ORG);
    expect(held.climate.governance.body).toBe('Board Risk Committee');
    expect(held.climateReadiness.stated).toBe(1);

    /* The derived answer is never written back, so there is no second copy to
       disagree with the first. */
    const repo = require('../src/domains/pcaf-part-a/infrastructure/store');
    const raw = await repo.getSettings(ORG);
    expect(raw.climateReadiness).toBeUndefined();
  });

  test('the illustrative pack installs once and refuses over facts already recorded', async () => {
    const first = await settings.installIllustrativeClimate(ORG);
    expect(first.installed).toBe(climate.ILLUSTRATIVE_ITEMS);
    expect(first.settings.climateReadiness.illustrative).toBe(climate.ILLUSTRATIVE_ITEMS);

    await expect(settings.installIllustrativeClimate(ORG)).rejects.toMatchObject({
      statusCode: 409, code: 'CLIMATE_NOT_EMPTY',
    });
  });

  test('recording the entity name does not disturb the climate facts beside it', async () => {
    await settings.installIllustrativeClimate(ORG);
    await settings.saveSettings(ORG, { reportingEntity: 'A Licensed Commercial Bank' });
    const held = await settings.getSettings(ORG);
    expect(held.reportingEntity).toBe('A Licensed Commercial Bank');
    expect(held.climateReadiness.illustrative).toBe(climate.ILLUSTRATIVE_ITEMS);
  });
});

describe('over the route', () => {
  test('the reference serves the registry the form draws itself from', async () => {
    const res = await request(app).get('/v1/pcaf/part-a/climate/reference').set('X-API-Key', KEY);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(climate.ITEMS.length);
    expect(res.body.pillars).toHaveLength(4);
    expect(Object.keys(res.body.vocabulary).length).toBeGreaterThan(8);
    expect(res.body.rowShapes.target.some(f => f.key === 'targetYear')).toBe(true);
  });

  test('a patch is recorded and the position carries the readiness with the entity', async () => {
    const put = await request(app).put('/v1/pcaf/part-a/settings').set('X-API-Key', KEY)
      .send({ climate: { riskManagement: { monitoring: 'Reviewed by the committee each quarter.' } } });
    expect(put.status).toBe(200);
    expect(put.body.settings.climateReadiness.stated).toBe(1);

    const get = await request(app).get('/v1/pcaf/part-a/settings').set('X-API-Key', KEY);
    expect(get.body.settings.climate.riskManagement.monitoring).toMatch(/each quarter/);
  });

  test('a field the registry does not hold is a named 400, not a silent no-op', async () => {
    const res = await request(app).put('/v1/pcaf/part-a/settings').set('X-API-Key', KEY)
      .send({ climate: { governance: { oversite: 'typo' } } });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/oversite/);
  });

  test('the illustrative pack loads over the route and refuses a second time', async () => {
    const first = await request(app).post('/v1/pcaf/part-a/settings/climate/illustrative')
      .set('X-API-Key', KEY).send({});
    expect(first.status).toBe(201);
    expect(first.body.installed).toBe(climate.ILLUSTRATIVE_ITEMS);

    const second = await request(app).post('/v1/pcaf/part-a/settings/climate/illustrative')
      .set('X-API-Key', KEY).send({});
    expect(second.status).toBe(409);
    expect(second.body.error || second.body.code).toBe('CLIMATE_NOT_EMPTY');
  });
});
