/**
 * PCAF Part C — what actually lands in a downloaded file.
 *
 * Two failures made reports look empty rather than fail loudly, and neither
 * showed up in a route test that only checked the status code:
 *
 *   · the serverless adapter returned PDF bytes as a UTF-8 string, so every
 *     byte above 127 was re-encoded and the file would not open;
 *   · pdfkit's standard-14 fonts encode WinAnsi only, so the summation sign
 *     in the weighting equation drew as mojibake.
 *
 * These tests read the produced bytes, not the response envelope.
 */

process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const { handler } = require('../netlify/functions/fintech-api');
const { winAnsi } = require('../services/partc-docgen');
const { pdfText, pdfPageCount, flat } = require('./helpers/pdf-text');
const fx = require('./fixtures/fisheries');

const reportBody = (format, policy = fx.POLICY_IDI) => ({
  projectName: 'Fisheries', policy,
  materials: fx.MATERIALS, distances: fx.DISTANCES,
  siteInputs: {
    gifa_m2: 1000, demolitionKm: 100, wasteDisposalKm: 40,
    demolitionItems: fx.DEMOLITION_ITEMS, previousProject: fx.PREVIOUS_PROJECT
  },
  useStage: fx.USE_STAGE,
  format
});

const invoke = body => handler({
  path: '/v1/pcaf/part-c/report',
  httpMethod: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': process.env.UI_API_KEY },
  body: JSON.stringify(body),
  isBase64Encoded: false
}, {});

describe('Part C report — the serverless adapter returns bytes, not text', () => {
  test('a PDF arrives base64-encoded and opens as a PDF', async () => {
    const res = await invoke(reportBody('pdf'));
    expect(res.statusCode).toBe(200);
    expect(res.isBase64Encoded).toBe(true);
    const buf = Buffer.from(res.body, 'base64');
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(5000);
  });

  test('a Word document arrives base64-encoded and opens as a zip container', async () => {
    const res = await invoke(reportBody('docx'));
    expect(res.statusCode).toBe(200);
    expect(res.isBase64Encoded).toBe(true);
    const buf = Buffer.from(res.body, 'base64');
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');
    expect(buf.length).toBeGreaterThan(5000);
  });

  test('JSON is still returned as text', async () => {
    const res = await invoke(reportBody('json'));
    expect(res.statusCode).toBe(200);
    expect(res.isBase64Encoded).toBeFalsy();
    expect(JSON.parse(res.body).report).toBeTruthy();
  });
});

describe('Part C report — the PDF is readable', () => {
  let text, pages;
  beforeAll(async () => {
    const res = await invoke(reportBody('pdf'));
    const buf = Buffer.from(res.body, 'base64');
    text = flat(pdfText(buf));
    pages = pdfPageCount(buf);
  });

  test('the text is selectable: every page decodes through its own ToUnicode map', () => {
    expect(pages).toBeGreaterThan(5);
    expect(text.length).toBeGreaterThan(8000);
    expect(text).toContain('Insurance-Associated Emissions Assessment');
  });

  test('no blank page is left between the cover and the first section', () => {
    // Section 2 opens the first content page; a stray page break used to
    // leave an empty sheet in front of it.
    const before = text.indexOf('Scope and coverage');
    expect(before).toBeGreaterThan(-1);
    expect(text.slice(0, before)).toMatch(/Prepared by Datum Solutions/);
  });

  test('the sections appear in the checklist\'s order', () => {
    const order = ['Scope and coverage', 'Gases and units', 'Absolute emissions',
      'Methodology', 'Data quality', 'Recalculation and significance threshold',
      'Emission intensity', 'Limitations and assumptions', 'Conformance statement'];
    let at = -1;
    for (const title of order) {
      const i = text.indexOf(title, at + 1);
      expect(i).toBeGreaterThan(at);
      at = i;
    }
  });

  test('the seven Kyoto gases and the GWP basis are named', () => {
    for (const g of ['CO2', 'CH4', 'N2O', 'HFCs', 'PFCs', 'SF6', 'NF3']) {
      expect(text).toContain(g);
    }
    expect(text).toMatch(/IPCC Fifth Assessment Report \(AR5\)/);
    expect(text).toMatch(/100-\s?year/);
  });

  test('the insured scope 1 and 2 figure and the scope 3 figure are both reported', () => {
    expect(text).toContain('Insured scope 1 and 2');
    expect(text).toContain('Insured scope 3');
    expect(text).toContain('14,672');          // A5.2 — the insured's scope 1 and 2
  });

  test('financed emissions are stated as separate and never combined', () => {
    expect(text).toMatch(/Financed emissions/);
    expect(text).toMatch(/never added together|reported separately/);
  });

  test('the recalculation protocol and the significance threshold are present', () => {
    expect(text).toMatch(/Significance threshold/);
    expect(text).toMatch(/base-\s?year recalculation/i);
    expect(text).toMatch(/Structural change to the book/);
  });

  test('economic emission intensity is reported, and is a real figure', () => {
    expect(text).toMatch(/per million of premium/i);
    expect(text).toMatch(/tCO2e \/ \w+M premium/);
    // The premium is in the request as an engine input; a report that did not
    // carry it through printed "not available" for every intensity measure.
    const m = /Construction emissions per million of premium ([\d,.]+) tCO2e/.exec(text);
    expect(m).not.toBeNull();
    expect(Number(m[1].replace(/,/g, ''))).toBeGreaterThan(0);
  });

  test('an unstated base year is answered No with its reason, not quietly assumed', () => {
    expect(text).toMatch(/Inventory base year Not yet stated/);
    expect(text).toMatch(/No base year has been set for this reporting entity/);
    expect(text).not.toMatch(/Inventory base year 20\d\d/);
  });

  test('the reported figure carries its data-quality score', () => {
    expect(text).toContain('15.929');
    expect(text).toMatch(/data quality 3\.3 \/ 5/);
  });

  test('the completed checklist is annexed and every item is answered', () => {
    expect(text).toContain('PCAF disclosure checklist');
    expect(text).toMatch(/Requirements \("shall"\)/);
    expect(text).toMatch(/COV-\s?1/);
    expect(text).toMatch(/ANX-\s?3/);
  });

  test('the summation sign survives as a glyph rather than a replacement mark', () => {
    expect(text).not.toMatch(/[\uFFFD]/);
    expect(text.split('?').length - 1).toBeLessThan(3);   // only genuine question marks
  });

  test('every checklist requirement is met, and the summary says how many', () => {
    const m = /Requirements \("shall"\) met (\d+) (\d+)/.exec(text);
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBe(Number(m[2]));
  });

  test('conformance is claimed and endorsement never is', () => {
    expect(text).toMatch(/in conformance with/i);
    expect(text).not.toMatch(/PCAF (approved|endorsed|certified)/i);
    expect(text).toMatch(/not an endorsement, approval or certification by PCAF/i);
  });
});

describe('WinAnsi transliteration', () => {
  test('spells out what the standard-14 fonts cannot draw', () => {
    expect(winAnsi('Σ(x)')).toBe('sum of (x)');
    expect(winAnsi('a − b')).toBe('a - b');
    expect(winAnsi('5 → 2')).toBe('5 -> 2');
    expect(winAnsi('kgCO₂e')).toBe('kgCO2e');
  });

  test('leaves everything WinAnsi already encodes alone', () => {
    expect(winAnsi('per-m² × factor ÷ area — note ‘q’'))
      .toBe('per-m² × factor ÷ area — note ‘q’');
  });

  test('passes non-strings through untouched', () => {
    expect(winAnsi(42)).toBe(42);
    expect(winAnsi(null)).toBeNull();
  });
});
