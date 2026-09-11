/**
 * The exit criterion of the data layer: a ten-thousand-row book rolls up in
 * under a second. Needs PostgreSQL (TEST_DATABASE_URL); skipped otherwise.
 *
 * The book is built from one genuine locked assessment — produced by the
 * engine, not typed — cloned across 2,000 projects with five policies each,
 * so every row has exactly the shape the roll-up reads.
 *
 * A timing is only a measurement on a quiet machine. Inside the parallel
 * suite this file shares the CPU with a dozen workers, so there it holds a
 * regression guard of three seconds; `npm run test:scale` runs it alone,
 * in band, with SCALE_STRICT=1, and there the second is enforced. CI runs
 * both. The measured figure is printed either way.
 */

'use strict';

const URL = process.env.TEST_DATABASE_URL;
const suite = URL ? describe : describe.skip;

const db = require('../src/platform/database');
const store = require('../src/platform/database/store');
const registry = require('../src/domains/pcaf-part-c/application/partc-registry');
const boq = require('../src/domains/pcaf-part-c/application/partc-boq');
const A = require('../src/domains/pcaf-part-c/application/partc-assessments');
const P = require('../src/domains/pcaf-part-c/application/partc-portfolio');
const { seedDemoBook } = require('../src/domains/pcaf-part-c/application/partc-demo-data');
const partaRegister = require('../src/domains/pcaf-part-a/application/register');
const partaRepo = require('../src/domains/pcaf-part-a/infrastructure/store');
const fx = require('../data/partc/fisheries-reference');

const ORG = 'scale-org';
const PROJECTS = 2000;
const POLICIES_PER = 5;
const withDist = mats => mats.map(m => ({ ...m, distance: fx.DISTANCES[m.id] || {} }));

jest.setTimeout(120_000);

async function bulk(collection, orgId, records) {
  const { table } = db.collections.definition(collection);
  for (let i = 0; i < records.length; i += 2500) {
    const chunk = records.slice(i, i + 2500);
    await db.client.query(
      `INSERT INTO ${table} (org_id, id, data, created_at)
       SELECT $1, e->>'__id', e - '__id', COALESCE((e->>'createdAt')::timestamptz, now())
       FROM jsonb_array_elements($2::jsonb) e`,
      [orgId, JSON.stringify(chunk)]);
  }
}

suite('Scale — a 10,000-policy book', () => {
  let template, projectTemplate;

  beforeAll(async () => {
    await store._resetMemory();
    const seeded = await seedDemoBook(registry, ORG, boq);
    const pj = seeded.projects.find(p => /Negombo/.test(p.name));
    const pol = pj.policies.find(x => x.reportingYear === 2026);
    const rev = (await boq.listRevisions(ORG, pj.projectId))[0]
      || await boq.createRevision(ORG, pj.projectId, { materials: withDist(fx.MATERIALS), demolitionItems: fx.DEMOLITION_ITEMS });
    const { assessment } = await A.createAssessment(ORG, {
      projectId: pj.projectId, policyId: pol.policyId, boqRevisionId: rev.revisionId,
      siteInputs: { demolitionKm: 100, wasteDisposalKm: 40, previousProject: fx.PREVIOUS_PROJECT },
    });
    await A.changeStatus(ORG, assessment.assessmentId, 'under_review');
    template = await A.changeStatus(ORG, assessment.assessmentId, 'locked', { actor: 'Ceylon Insurance PLC' });
    projectTemplate = pj;

    const projects = [], revisions = [], assessments = [];
    const t0 = new Date('2026-01-01T00:00:00.000Z').getTime();
    for (let i = 0; i < PROJECTS; i++) {
      const projectId = `pj_s${i}`;
      const revisionId = `rev_s${i}`;
      const policies = [];
      for (let k = 0; k < POLICIES_PER; k++) {
        const policyId = `pol_s${i}_${k}`;
        policies.push({ ...pol, policyId, reference: `${policyId}`, premium: 10000 + (i * POLICIES_PER + k), reportingYear: 2026 });
        assessments.push({
          ...template, __id: `as_s${i}_${k}`, assessmentId: `as_s${i}_${k}`,
          projectId, policyId, boqRevisionId: revisionId, projectName: `Scale project ${i}`,
          createdAt: new Date(t0 + (i * POLICIES_PER + k) * 1000).toISOString(),
        });
      }
      projects.push({ ...pj, __id: projectId, projectId, name: `Scale project ${i}`, policies, createdAt: new Date(t0 + i * 1000).toISOString() });
      revisions.push({ __id: revisionId, revisionId, projectId, orgId: ORG, label: 'R1', materials: [], demolitionItems: [], createdAt: new Date(t0 + i * 1000).toISOString() });
    }
    await bulk('projects', ORG, projects);
    await bulk('boqRevisions', ORG, revisions);
    await bulk('assessments', ORG, assessments);
  });

  afterAll(() => (process.env.KEEP_SCALE ? undefined : store._resetMemory()));

  test('the book holds what was written', async () => {
    expect(await store.count('assessments', ORG, { status: 'locked' })).toBe(PROJECTS * POLICIES_PER + 1);
    expect(await store.count('projects', ORG)).toBeGreaterThanOrEqual(PROJECTS);
  });

  test('an indexed lookup of one policy-year is answered in milliseconds', async () => {
    const started = process.hrtime.bigint();
    const rows = await A.listAssessments(ORG, { policyId: 'pol_s777_3', reportingYear: 2026, status: 'locked' });
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    expect(rows).toHaveLength(1);
    expect(rows[0].assessmentId).toBe('as_s777_3');
    expect(ms).toBeLessThan(100);
  });

  test('the reporting-year roll-up over 10,000 locked assessments returns in under a second', async () => {
    const times = [];
    let r;
    for (let i = 0; i < 3; i++) {
      const started = process.hrtime.bigint();
      r = await P.rollUp(ORG, 2026);
      times.push(Number(process.hrtime.bigint() - started) / 1e6);
    }
    const best = Math.min(...times);
    expect(r.assessments.locked).toBe(PROJECTS * POLICIES_PER + 1);
    expect(r.construction.total_kgCO2e).toBeCloseTo(template.summary.construction_kgCO2e * (PROJECTS * POLICIES_PER + 1), 0);
    const bound = process.env.SCALE_STRICT ? 1000 : 3000;
    console.log(`roll-up over ${r.assessments.locked} locked assessments: best ${best.toFixed(0)} ms of ${times.map(t => t.toFixed(0)).join(' / ')} ms (bound ${bound} ms${process.env.SCALE_STRICT ? ', strict' : ', regression guard'})`);
    expect(best).toBeLessThan(bound);
    expect(projectTemplate).toBeTruthy();
  });
});

/**
 * The same exit criterion for the Part A register, and the same reason for it.
 *
 * A stored exposure is several kilobytes, most of it the provenance trace, and
 * the reporting-year position needs about twenty fields of it. Reading ten
 * thousand whole records to use twenty fields is the defect
 * `partc_assessments.rollup` was built to end; migration 0008 gives Part A the
 * same projection, and this is what proves the column is actually being read
 * rather than the record being fetched and thrown away.
 */
suite('Scale — a 10,000-exposure Part A book', () => {
  const PARTA_ORG = 'scale-org-parta';
  const EXPOSURES = 10000;
  const YEAR = '2026';

  beforeAll(async () => {
    /* One genuine exposure from the engine, cloned — so every row has exactly
       the shape the projection reads, rather than a hand-typed approximation
       of it. */
    const template = await partaRegister.record(PARTA_ORG, {
      reportingYear: Number(YEAR),
      instrument: 'business-loan',
      borrowerListed: false,
      counterparty: { name: 'Scale borrower', sector: 'Textiles' },
      outstanding: { amount: 100000, asOf: '2026-12-31', currency: 'LKR' },
      denominator: { totalEquity: 600000, totalDebt: 400000, asOf: '2026-12-31', currency: 'LKR' },
      emissions: {
        scope1: { value: 1000, basis: 'reported-unverified', period: '2026' },
        scope2: { value: 100, basis: 'reported-unverified', period: '2026' },
        scope3: { value: 5000, basis: 'reported-unverified', period: '2026' },
      },
    });

    const rows = [];
    const t0 = new Date('2026-01-01T00:00:00.000Z').getTime();
    for (let i = 0; i < EXPOSURES - 1; i++) {
      rows.push({
        ...template,
        __id: `pae_s${i}`,
        exposureId: `pae_s${i}`,
        counterparty: { ...template.counterparty, name: `Scale borrower ${i}` },
        createdAt: new Date(t0 + i * 1000).toISOString(),
      });
    }
    await bulk('parta_exposures', PARTA_ORG, rows);
    await partaRegister.stateBook(PARTA_ORG, {
      reportingYear: Number(YEAR), totalLoansAndInvestments: 1e12, currency: 'LKR', statedBy: 'Scale test',
    });
  });

  afterAll(() => (process.env.KEEP_SCALE ? undefined : store._resetMemory()));

  test('the book holds what was written', async () => {
    expect(await store.count(partaRepo.EXPOSURES, PARTA_ORG)).toBe(EXPOSURES);
  });

  test('the reporting-year position over 10,000 exposures returns in under a second', async () => {
    const times = [];
    let pos;
    for (let i = 0; i < 3; i++) {
      const started = process.hrtime.bigint();
      pos = await partaRegister.position(PARTA_ORG, YEAR);
      times.push(Number(process.hrtime.bigint() - started) / 1e6);
    }
    const best = Math.min(...times);
    expect(pos.exposures).toBe(EXPOSURES);
    expect(pos.total.lines.scope1.value).toBeCloseTo(100 * EXPOSURES, 0);
    expect(pos.coverage.share).toBeGreaterThan(0);
    const bound = process.env.SCALE_STRICT ? 1000 : 3000;
    console.log(`Part A position over ${pos.exposures} exposures: best ${best.toFixed(0)} ms of ${times.map(t => t.toFixed(0)).join(' / ')} ms (bound ${bound} ms${process.env.SCALE_STRICT ? ', strict' : ', regression guard'})`);
    expect(best).toBeLessThan(bound);
  });
});
