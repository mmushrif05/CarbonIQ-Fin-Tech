// @ts-check
/**
 * CarbonIQ FinTech — PCAF Part C: shared document primitives
 *
 * Both Part C documents — the per-assessment report and the annual
 * disclosure — are produced in PDF and in Word from one structured object.
 * The primitives that draw them live here so the two formats, and the two
 * documents, cannot drift into saying different things in different styles.
 */

'use strict';

/** Numbers as a reader expects them: grouped, at most two decimals. */
const N = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

/* The WinAnsi transliterator is generic report machinery and lives in
   src/platform/reporting/winansi.js, so the Part C and Part A renderers
   share it. Re-exported under the names this module has always used. */
const { winAnsi, winAnsiSafe } = require('../../../platform/reporting/winansi');

/** Bind the heading/paragraph/key-value trio to one pdfkit document. */
function pdfWriter(doc) {
  const H = (t, size = 13) => doc.moveDown(0.8).fontSize(size).fillColor('#0f172a').font('Helvetica-Bold').text(t);
  const P = (t, size = 9.5) => doc.fontSize(size).fillColor('#334155').font('Helvetica').text(t, { align: 'left' });
  const KV = (k, v) => {
    doc.fontSize(9.5).fillColor('#64748b').font('Helvetica').text(k, { continued: true });
    doc.fillColor('#0f172a').font('Helvetica-Bold').text(`   ${v}`);
  };
  const NOTE = t => doc.fontSize(8.5).fillColor('#64748b').font('Helvetica-Oblique').text(t);
  const WARN = t => doc.fontSize(8.5).fillColor('#b45309').font('Helvetica-Oblique').text(t);
  return { H, P, KV, NOTE, WARN };
}

// ---------------------------------------------------------------------------
// Word
// ---------------------------------------------------------------------------

/* The Word primitives are `src/platform/reporting/docx.js` now — they are
   `docx` builders that know nothing about emissions, and the GCF Concept Note
   package was importing them from here across a domain boundary, by their
   private names. Re-exported so every caller that has always read them from
   this module still can. */
const { para: _p, heading: _h, cell: _cell, table: _table } = require('../../../platform/reporting/docx');

module.exports = { N, pdfWriter, winAnsi, winAnsiSafe, _p, _h, _cell, _table };
