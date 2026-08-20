/**
 * Sending a generated document as bytes.
 *
 * Every "the PDF is empty" report this project has had came from the
 * delivery path rather than the drawing, and none of those failures
 * announced itself: the browser saved a file with the right name and the
 * file would not open. These tests hold the guarantees that make that class
 * of failure loud instead of silent.
 */

'use strict';

const { assertWellFormedPdf, toBuffer, sendDocx } = require('../services/pdf-response');
const theme = require('../services/partc-theme');

/** A real, minimal document from the house writer. */
async function tinyPdf() {
  const doc = theme.pcafDocument();
  const w = theme.pcafWriter(doc, {});
  w.h1('Title');
  for (let i = 0; i < 40; i++) w.body(`Line ${i} of a document long enough to be a document.`);
  const buf = toBuffer(doc);
  w.finalise();
  return buf;
}

describe('A generated PDF is checked before it is sent', () => {
  test('a well-formed document passes', async () => {
    const buf = await tinyPdf();
    expect(() => assertWellFormedPdf(buf)).not.toThrow();
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  test('an empty body is refused, not sent', () => {
    expect(() => assertWellFormedPdf(Buffer.alloc(0))).toThrow(/is empty/i);
  });

  test('a truncated document is refused, not sent', async () => {
    const buf = await tinyPdf();
    const cut = buf.subarray(0, Math.floor(buf.length / 2));
    expect(() => assertWellFormedPdf(cut)).toThrow(/truncated/i);
  });

  test('something that is not a PDF at all is refused', () => {
    const html = Buffer.from('<!doctype html><title>Error</title>'.padEnd(2000, ' '));
    expect(() => assertWellFormedPdf(html)).toThrow(/does not begin with a PDF header/i);
  });

  test('the refusal is a server error carrying a code, so it surfaces as a failure', async () => {
    try {
      assertWellFormedPdf(Buffer.alloc(0), 'assessment report');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.statusCode).toBe(500);
      expect(err.code).toBe('PDF_MALFORMED');
      expect(err.message).toMatch(/assessment report/);
    }
  });

  test('a Word document that is not a zip container is refused', () => {
    const res = { setHeader() {}, send() {} };
    expect(() => sendDocx(res, Buffer.from('not a zip'.padEnd(2000, ' ')), 'x.docx'))
      .toThrow(/not a valid Word document/i);
  });
});

describe('The document declares a PDF version that covers what it contains', () => {
  /*
   * Constant alpha, soft masks and transparency groups are PDF 1.4 features.
   * A file that uses one while declaring 1.3 is malformed: a lenient viewer
   * renders it anyway, and a strict one shows a blank page. The cover
   * watermark is therefore drawn as a pre-blended solid.
   */
  test('the cover watermark uses no transparency, so nothing outruns the header', async () => {
    const doc = theme.pcafDocument();
    const w = theme.pcafWriter(doc, {});
    const bufP = toBuffer(doc);
    w.cover({
      title: 'T', subtitle: 'S', insurer: 'I', reportingYear: 2026,
      publishedAt: '2026-01-01', standard: 'Std', preparedBy: 'Prepared by X', reportId: 'R'
    });
    w.body('body');
    w.finalise();
    const text = (await bufP).toString('latin1');

    expect(text).not.toMatch(/\/ExtGState/);
    expect(text).not.toMatch(/\/SMask/);
    expect(text).not.toMatch(/\/ca\s/);

    const version = Number(/^%PDF-(\d\.\d)/.exec(text)[1]);
    expect(version).toBeGreaterThanOrEqual(1.4);
  });

  test('the watermark is still drawn — the fix removed the alpha, not the design', () => {
    // 7% white over the cover slate is a computable solid, and a different
    // colour from the field it sits on.
    const blended = theme.blend('#FFFFFF', theme.PALETTE.slate, 0.07);
    expect(blended).toMatch(/^#[0-9a-f]{6}$/);
    expect(blended.toLowerCase()).not.toBe(theme.PALETTE.slate.toLowerCase());
  });
});
