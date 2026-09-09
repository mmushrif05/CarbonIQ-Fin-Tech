/**
 * CarbonIQ FinTech — sending a generated document as bytes
 *
 * Every "the PDF is empty" report this project has had came from the
 * delivery path rather than the drawing: bytes re-encoded as text by a
 * serverless adapter, a chunked response truncated in transit, a broken
 * response cached and served again after the fix. None of those failures
 * announces itself — the browser saves a file, the file has the right name,
 * and it will not open.
 *
 * So a document is never streamed to a response. It is collected in full,
 * checked to be a well-formed PDF, and sent as a buffer with an explicit
 * Content-Length. A truncated body then cannot look complete, a cache
 * cannot re-serve a broken one, and a document that fails the check becomes
 * a loud error instead of a quiet bad download.
 */

'use strict';

/** Collect a pdfkit document into one buffer. */
function toBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * A PDF a reader will accept: the header, a trailer, and enough between them
 * to be a document rather than a shell.
 *
 * Strict readers refuse a file missing any of these outright, which is what
 * a user sees as a blank page.
 *
 * @throws {Error} with a message naming what is wrong
 */
function assertWellFormedPdf(buf, what = 'document') {
  const fail = reason => {
    const err = new Error(`The generated ${what} is not a valid PDF: ${reason}. It has not been sent — a file that downloads and will not open is worse than a clear failure.`);
    err.statusCode = 500;
    err.code = 'PDF_MALFORMED';
    throw err;
  };

  if (!Buffer.isBuffer(buf) || buf.length === 0) fail('it is empty');
  if (buf.length < 1000) fail(`it is only ${buf.length} bytes`);
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') fail('it does not begin with a PDF header');

  // The trailer is at the end, though a little padding after it is legal.
  const tail = buf.subarray(-1024).toString('latin1');
  if (!tail.includes('%%EOF')) fail('it has no end-of-file marker, so it was truncated');
  if (!tail.includes('startxref')) fail('it has no cross-reference pointer');

  return buf;
}

/**
 * Send a document as bytes.
 *
 * no-store matters as much as the length: a response that was broken once
 * must never be served again from a cache after the cause is fixed, and that
 * is exactly the shape of a bug that looks like "the fix did not work".
 */
function sendDocument(res, buf, { filename, contentType }) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', String(buf.length));
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.send(buf);
}

const PDF  = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Collect, check and send a pdfkit document in one step. */
async function sendPdf(res, doc, filename, what = 'document') {
  const buf = assertWellFormedPdf(await toBuffer(doc), what);
  return sendDocument(res, buf, { filename, contentType: PDF });
}

/** The same guarantees for a Word document, which is a zip container. */
function sendDocx(res, buf, filename, what = 'document') {
  if (!Buffer.isBuffer(buf) || buf.length < 1000 || buf.subarray(0, 2).toString('latin1') !== 'PK') {
    const err = new Error(`The generated ${what} is not a valid Word document. It has not been sent.`);
    err.statusCode = 500;
    err.code = 'DOCX_MALFORMED';
    throw err;
  }
  return sendDocument(res, buf, { filename, contentType: DOCX });
}

module.exports = { toBuffer, assertWellFormedPdf, sendDocument, sendPdf, sendDocx, PDF, DOCX };
