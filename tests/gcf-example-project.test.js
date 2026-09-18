/**
 * The example candidate served for the intake form.
 *
 * Served, never recorded: the route hands the intake form one illustrative
 * project with every figure carrying its tier, and stores nothing. Pressing
 * Record is what records it. What is pinned: the example passes the record
 * schema exactly as a recorded project must; the route is reachable ahead of
 * `/pipeline/:id`; a GET leaves the book unchanged; and once recorded it is
 * on the register like any other candidate.
 */

'use strict';

const platformStore = require('../src/platform/database/store');
const record = require('../src/domains/gcf/domain/record');
const { EXAMPLE_PROJECT } = require('../src/domains/gcf/domain/reference');
const { api, auth } = require('./helpers/api');

beforeEach(() => platformStore._resetMemory());

describe('The example candidate', () => {
  test('passes the record schema, with every figure carrying its tier', () => {
    const v = record.validate({ ...EXAMPLE_PROJECT.project, provenance: { source: 'test' } });
    expect(v.id).toBe('gcf_dfcc_tea_biomass');
    expect(record.weakestTier(v)).toBeTruthy();
    expect(v.mitigation.lifetime_tCO2e.tier).toBe('modelled');
  });

  test('does not share an id or a code with the starter book or the shipped sample', () => {
    const ids = [
      ...require('../data/gcf/dfcc-starter-projects.json').projects,
      ...require('../data/gcf/pipeline.seed.json').projects,
    ];
    expect(ids.some(p => p.id === EXAMPLE_PROJECT.project.id || p.code === EXAMPLE_PROJECT.project.code)).toBe(false);
  });

  test('is served with its provenance, and serving it records nothing', async () => {
    const before = (await auth(api().get('/v1/gcf/pipeline')).expect(200)).body.pipeline;
    const r = (await auth(api().get('/v1/gcf/pipeline/example')).expect(200)).body;
    expect(r.project.id).toBe('gcf_dfcc_tea_biomass');
    expect(r.project.provenance.source).toMatch(/illustrative/);
    expect(r.note).toMatch(/never recorded/);
    const after = (await auth(api().get('/v1/gcf/pipeline')).expect(200)).body.pipeline;
    expect(after.source).toBe(before.source);
    expect(after.count).toBe(before.count);
    await auth(api().get('/v1/gcf/pipeline/gcf_dfcc_tea_biomass')).expect(404);
  });

  test('recording it puts it on the book and on the gap register', async () => {
    const { project } = (await auth(api().get('/v1/gcf/pipeline/example')).expect(200)).body;
    await auth(api().post('/v1/gcf/pipeline')).send(project).expect(201);
    const reg = (await auth(api().get('/v1/gcf/gaps')).expect(200)).body.register;
    expect(reg.byProject.map(p => p.id)).toEqual(['gcf_dfcc_tea_biomass']);
    expect(reg.byProject[0].now).toBeGreaterThan(0);
    await auth(api().post('/v1/gcf/pipeline')).send(project).expect(201);
    const list = (await auth(api().get('/v1/gcf/pipeline')).expect(200)).body.pipeline;
    expect(list.count).toBe(1);
  });

  test('needs a key', async () => {
    await api().get('/v1/gcf/pipeline/example').expect(401);
  });
});
