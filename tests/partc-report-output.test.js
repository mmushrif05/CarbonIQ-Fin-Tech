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

const zlib = require('zlib');
const { handler } = require('../netlify/functions/fintech-api');
const { winAnsi } = require('../services/partc-docgen');
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

/** Every literal string pdfkit drew, recovered from the content streams. */
function pdfText(buf) {
  let out = '';
  const re = /stream(\r\n|\n|\r)/g;
  let m;
  while ((m = re.exec(buf.toString('latin1'))) !== null) {
    const start = m.index + m[0].length;
    const end = buf.indexOf('endstream', start, 'latin1');
    if (end < 0) continue;
    let inflated;
    try { inflated = zlib.inflateSync(buf.subarray(start, end)); } catch (_) { continue; }
    for (const hex of inflated.toString('latin1').match(/<[0-9a-fA-F]+>/g) || []) {
      out += Buffer.from(hex.slice(1, -1), 'hex').toString('latin1');
    }
  }
  return out;
}

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
  let text;
  beforeAll(async () => {
    const res = await invoke(reportBody('pdf'));
    text = pdfText(Buffer.from(res.body, 'base64'));
  });

  test('the page carries the report, not an empty shell', () => {
    expect(text.length).toBeGreaterThan(5000);
    expect(text).toContain('Result');
    expect(text).toContain('Disclosure statement');
  });

  test('no character was dropped to a replacement mark', () => {
    expect(text).not.toContain('?');
  });

  test('the weighting equation is spelled out rather than drawn as mojibake', () => {
    expect(text.replace(/\s+/g, ' ')).toContain('sum of (module emissions');
  });

  test('both scores appear beside their figures', () => {
    const flat = text.replace(/\s+/g, ' ');
    expect(flat).toMatch(/Construction \(A4 \+ A5\)[^|]*3\.3 \/ 5/);
    expect(flat).toMatch(/Use stage \(B1 \+ B4 \+ B7\)[^|]*4\.6 \/ 5/);
  });

  test('section numbers run without a gap', () => {
    const seen = [...text.matchAll(/(\d)\. (Result|Scope applied|What drives|Material transport|Data quality|Assessment memo|Disclosure statement)/g)]
      .map(m => Number(m[1]));
    expect(seen.length).toBeGreaterThan(3);
    expect(seen).toEqual(seen.map((_, i) => i + 1));
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
