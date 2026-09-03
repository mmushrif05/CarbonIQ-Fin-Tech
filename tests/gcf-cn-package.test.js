/**
 * The Concept Note input package.
 *
 * The rule: this hands an author every input the system holds, in GCF's order,
 * and names what it cannot supply. It does not write the Concept Note. The
 * external list is the deliverable most people actually need — the worklist
 * between a pipeline entry and a submission, which otherwise lives in one
 * person's head.
 */

'use strict';

process.env.STORAGE_BACKEND = 'memory';
process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const request = require('supertest');
const app = require('../server');
const partcStore = require('../services/partc-store');
const cn = require('../services/gcf/cn-package');
const { assertWellFormedPdf, toBuffer } = require('../services/pdf-response');
const SEED = require('../data/gcf/pipeline.seed.json');

const KEY = process.env.UI_API_KEY;
const auth = r => r.set('x-api-key', KEY);
const api = () => request(app);
const ACC = SEED._meta.accreditation;
const byCode = c => SEED.projects.find(p => p.code === c);
const build = (code, opts = {}) =>
  cn.buildPackage(byCode(code), { accreditation: ACC, ...opts });

beforeEach(() => partcStore._resetMemory());

describe('Eight sections, in the order a Concept Note reads', () => {
  const pkg = build('GCF-P4');

  test('sections A through H are present and in order', () => {
    expect(pkg.sections.map(s => s.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  });

  test('every field carries one of exactly three states', () => {
    for (const s of pkg.sections) {
      expect(s.fields.length).toBeGreaterThan(0);
      for (const f of s.fields) {
        expect([cn.HELD, cn.PARTIAL, cn.EXTERNAL]).toContain(f.status);
      }
    }
  });

  test('the figures come from the engines, not re-keyed', () => {
    const emissions = require('../services/gcf/emissions');
    const { N } = require('../services/partc-docgen');
    const e = emissions.projectEmissions(byCode('GCF-P4'));
    const flat = JSON.stringify(pkg.sections);
    /* Rendered through the shared number formatter, so the assertion is on the
       formatted form — comparing against the raw one would fail on a thousands
       separator and say nothing about provenance. */
    expect(flat).toContain(N(e.mitigation.annual_tCO2e));
    expect(flat).toContain(N(e.mitigation.lifetime_tCO2e));
  });

  test('a removal is presented as a removal, reported apart from reduction', () => {
    const e = pkg.sections.find(s => s.id === 'E');
    const line = e.fields.find(f => /NDC period/.test(f.label));
    expect(line.value).toMatch(/removal/);
    expect(line.value).toMatch(/never summed/);
  });

  test("an adaptation project's carbon is labelled a co-benefit, not a mitigation claim", () => {
    const d = pkg.sections.find(s => s.id === 'D');
    const line = d.fields.find(f => /Impact potential — mitigation/.test(f.label));
    expect(line.value).toMatch(/co-benefit/);
    expect(line.value).toMatch(/not ranked as one/);
  });

  test('direct and indirect beneficiaries are never added together', () => {
    const d = pkg.sections.find(s => s.id === 'D');
    const line = d.fields.find(f => /beneficiaries/.test(f.label));
    expect(line.value).toMatch(/never added/);
  });
});

describe('External is the useful state', () => {
  const pkg = build('GCF-P4');

  test('the external worklist is substantial and each entry says what and from whom', () => {
    expect(pkg.externalInputs.length).toBeGreaterThan(12);
    for (const x of pkg.externalInputs) {
      expect(x.needs.length).toBeGreaterThan(20);
      expect(x.from).toBeTruthy();
    }
  });

  test('the legal instruments no model can produce are named as external', () => {
    const labels = pkg.externalInputs.map(x => x.input).join(' | ');
    expect(labels).toMatch(/NDA no-objection letter/);
    expect(labels).toMatch(/Gender assessment/);
    expect(labels).toMatch(/ESIA|ESMP/);
    expect(labels).toMatch(/Signed co-financing commitments/);
  });

  test("the three unscorable GCF criteria arrive here as external inputs", () => {
    const labels = pkg.externalInputs.map(x => x.input);
    expect(labels).toEqual(expect.arrayContaining(
      ['Paradigm-shift potential', 'Sustainable development potential', 'Needs of the recipient']));
  });

  test('FPIC appears only where the project actually flags it', () => {
    const withFpic = build('GCF-P4').externalInputs.map(x => x.input).join(' ');
    const without = build('GCF-P1').externalInputs.map(x => x.input).join(' ');
    expect(withFpic).toMatch(/Free, Prior and Informed Consent/);
    expect(without).not.toMatch(/Free, Prior and Informed Consent/);
  });

  test('FPIC is described as a process with communities, not a document to draft', () => {
    const f = build('GCF-P4').externalInputs.find(x => /FPIC/.test(x.input));
    expect(f.needs).toMatch(/not a document that can be drafted for them/);
  });

  test('a half-filled field is partial, not held', () => {
    /* A district population share is not a beneficiary disaggregation, and
       letting it pass as one would put a benchmark into a GCF core indicator. */
    expect(pkg.partialInputs).toHaveLength(1);
    expect(pkg.partialInputs[0].input).toMatch(/Disaggregation of beneficiaries by sex/);
    expect(pkg.partialInputs[0].missing).toMatch(/disaggregated at source/);
  });

  test('the package is never complete while anything is outstanding', () => {
    expect(pkg.readiness.complete).toBe(false);
    expect(pkg.readiness.note).toMatch(/not complete while an external input is outstanding/);
    expect(pkg.readiness.note).toMatch(/not how close the submission is/);
  });

  test('it says plainly that it does not write the Concept Note', () => {
    expect(pkg.limits).toMatch(/does not write the Concept Note/);
    expect(pkg.limits).toMatch(/judgements, processes and legal instruments/);
  });
});

describe("DFCC's own accreditation conditions travel with the package", () => {
  const pkg = build('GCF-P1');

  test('the grant modality is stated as not held, with its caveat', () => {
    const g = pkg.sections.find(s => s.id === 'G');
    const line = g.fields.find(f => f.label === 'Grant modality');
    expect(line.value).toMatch(/Not held/);
    expect(line.value).toMatch(/verify with DFCC or the NDA/i);
  });

  test('the two open accreditation conditions appear as external inputs', () => {
    const labels = pkg.externalInputs.map(x => x.input).join(' | ');
    expect(labels).toMatch(/Grievance redress mechanism/);
    expect(labels).toMatch(/Procurement plan/);
  });

  test('the arithmetic check travels into the annex', () => {
    const h = pkg.sections.find(s => s.id === 'H');
    const check = h.fields.find(f => f.label === 'Arithmetic check');
    expect(check.value).toMatch(/agrees/);
  });
});

describe('Documents', () => {
  test('the PDF is well formed and declares a version covering what it draws', async () => {
    const pkg = build('GCF-P4', { sample: true, sampleNote: SEED._meta.sampleNote });
    const buf = await toBuffer(cn.buildPackagePDF(pkg));
    expect(() => assertWellFormedPdf(buf, 'CN package')).not.toThrow();
    expect(buf.slice(0, 8).toString('latin1')).toMatch(/^%PDF-1\.[4-9]/);
  });

  test('the Word document builds and is a real docx', async () => {
    const buf = await cn.buildPackageDOCX(build('GCF-P1'));
    expect(buf.length).toBeGreaterThan(5000);
    expect(buf.slice(0, 2).toString('latin1')).toBe('PK');
  });

  test('a sample package is stamped on its face', async () => {
    const pkg = build('GCF-P1', { sample: true, sampleNote: SEED._meta.sampleNote });
    expect(pkg.meta.sample).toBe(true);
    const buf = await toBuffer(cn.buildPackagePDF(pkg));
    expect(buf.length).toBeGreaterThan(3000);
  });
});

describe('Over HTTP', () => {
  test('the package comes back as JSON with its readiness', async () => {
    const res = await auth(api().get('/v1/gcf/cn/gcf_p4_mangrove_coast')).expect(200);
    expect(res.body.package.sections).toHaveLength(8);
    expect(res.body.package.readiness.complete).toBe(false);
    expect(res.body.sample).toBe(true);
  });

  test('the PDF downloads as bytes with an explicit length', async () => {
    const res = await auth(api().get('/v1/gcf/cn/gcf_p1_jaffna_solar?format=pdf')).expect(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(Number(res.headers['content-length'])).toBeGreaterThan(3000);
  });

  test('the Word document downloads', async () => {
    const res = await auth(api().get('/v1/gcf/cn/gcf_p1_jaffna_solar?format=docx')).expect(200);
    expect(res.headers['content-type']).toMatch(/wordprocessingml/);
  });

  test('an unknown format is refused rather than guessed', async () => {
    await auth(api().get('/v1/gcf/cn/gcf_p1_jaffna_solar?format=rtf')).expect(400);
  });

  test('an unknown project is a 404', async () => {
    await auth(api().get('/v1/gcf/cn/nope')).expect(404);
  });

  test('it needs a key', async () => {
    await api().get('/v1/gcf/cn/gcf_p1_jaffna_solar').expect(401);
  });
});
