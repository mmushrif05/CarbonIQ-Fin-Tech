/**
 * The signable GCF assessment report — Phase 1 Stage 5.
 *
 * The document the assessor's validation produces: the appraisal a committee
 * reads and the assessor signs, built from the record, its validation and the
 * engine's own evidence coverage, rendered through the shared report standard.
 *
 * What is pinned:
 *   • a validated report carries the recommendation, the sign-off (who and
 *     when), the six criteria with the assessor's rating beside the evidence,
 *     and the audit trail;
 *   • a draft is told apart from a sign-off — not validated, no signature;
 *   • the report reference is deterministic — one position, one reference;
 *   • the ratings are words, never a number;
 *   • the PDF is a well-formed document, not just a 200;
 *   • the route serves JSON, PDF and Word, and 404s an unknown project.
 */

'use strict';

const request = require('supertest');
const app = require('../src/server');
const platformStore = require('../src/platform/database/store');
const gcf = require('../src/domains/gcf/infrastructure/store');
const validation = require('../src/domains/gcf/domain/validation');
const { logframe } = require('../src/domains/gcf/domain/logframe');
const report = require('../src/domains/gcf/application/assessment-report');
const { api, auth } = require('./helpers/api');

const base = () => JSON.parse(JSON.stringify(require('../data/gcf/dfcc-starter-projects.json').projects[0]));

/** A project carrying a signed-off validation. */
function validated(id) {
  const p = { ...base(), id };
  let v = validation.apply(p, { to: 'under_review' }, { by: 'Assessor A', at: '2026-09-15T10:00:00Z' });
  v = validation.apply({ validation: v }, {
    to: 'validated',
    ratings: { impactPotential: { rating: 'strong', note: 'Clear MCI-1.' }, countryOwnership: { rating: 'adequate' } },
    recommendation: 'recommend_with_conditions',
    recommendationNote: 'Subject to the NDA no-objection.',
  }, { by: 'Assessor A', at: '2026-09-15T11:00:00Z' });
  p.validation = v;
  return p;
}

/** Collect a pdfkit document stream to a buffer. */
function collect(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

beforeEach(() => platformStore._resetMemory());

describe('the assessment report model', () => {
  test('a validated report carries the recommendation, the sign-off and the ratings', () => {
    const p = validated('gcf_ar_ok');
    const j = report.assessmentJSON(p, { logframe: logframe(p) });
    expect(j.validated).toBe(true);
    expect(j.recommendation).toBe('recommend_with_conditions');
    expect(j.recommendationLabel).toBe('Recommend with conditions');
    expect(j.signedOffBy).toBe('Assessor A');
    expect(j.signedOffAt).toBe('2026-09-15T11:00:00Z');
    expect(j.criteria).toHaveLength(6);
    const impact = j.criteria.find(c => c.id === 'impactPotential');
    expect(impact.rating).toBe('strong');
    expect(impact.ratingLabel).toBe('Strong');
    expect(j.history.length).toBeGreaterThanOrEqual(2);
  });

  test('a draft is told apart from a sign-off', () => {
    const p = { ...base(), id: 'gcf_ar_draft' };
    const j = report.assessmentJSON(p, { logframe: logframe(p) });
    expect(j.validated).toBe(false);
    expect(j.validationState).toBe('draft');
    expect(j.signedOffBy).toBeNull();
    expect(j.signedOffAt).toBeNull();
  });

  test('the report reference is deterministic for one position', () => {
    const a = report.assessmentJSON(validated('gcf_ar_ref'), {});
    const b = report.assessmentJSON(validated('gcf_ar_ref'), {});
    expect(a.reportId).toBe(b.reportId);
    expect(a.reportId).toMatch(/^GCF-ASSESS-[0-9A-F]{12}$/);
  });

  test('the ratings render as words, never a number', () => {
    const model = report.assessmentModel(validated('gcf_ar_words'), {});
    const crit = model.sections.find(s => s.id === 'criteria');
    const table = crit.blocks.find(bl => bl.kind === 'table');
    const flat = JSON.stringify(table.rows);
    expect(flat).toMatch(/Strong|Adequate/);
    expect(flat).not.toMatch(/\/\s*5/);
  });

  test('the PDF is a well-formed document', async () => {
    const buf = await collect(report.assessmentPDF(validated('gcf_ar_pdf'), {}));
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.slice(0, 5).toString()).toBe('%PDF-');
  });
});

describe('the assessment report route', () => {
  test('serves JSON by default', async () => {
    await gcf.put('ui', validated('gcf_ar_route'), { by: 'Analyst' });
    const r = (await auth(api().get('/v1/gcf/pipeline/gcf_ar_route/assessment-report')).expect(200)).body;
    expect(r.report.validated).toBe(true);
    expect(r.report.signedOffBy).toBe('Assessor A');
  });

  test('serves a PDF and a Word document', async () => {
    await gcf.put('ui', validated('gcf_ar_docs'), { by: 'Analyst' });
    const pdf = await auth(api().get('/v1/gcf/pipeline/gcf_ar_docs/assessment-report?format=pdf'))
      .buffer(true).parse((res, cb) => { const d = []; res.on('data', c => d.push(c)); res.on('end', () => cb(null, Buffer.concat(d))); })
      .expect(200);
    expect(pdf.headers['content-type']).toMatch(/application\/pdf/);
    expect(pdf.body.slice(0, 5).toString()).toBe('%PDF-');

    const word = await auth(api().get('/v1/gcf/pipeline/gcf_ar_docs/assessment-report?format=word'))
      .buffer(true).parse((res, cb) => { const d = []; res.on('data', c => d.push(c)); res.on('end', () => cb(null, Buffer.concat(d))); })
      .expect(200);
    expect(word.headers['content-type']).toMatch(/wordprocessingml/);
    expect(word.body.length).toBeGreaterThan(1000);
  });

  test('an unknown project is a 404', async () => {
    const r = await auth(api().get('/v1/gcf/pipeline/nope/assessment-report')).expect(404);
    expect(r.body.error).toBe('PROJECT_NOT_FOUND');
  });
});
