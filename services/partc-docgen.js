/**
 * CarbonIQ FinTech — PCAF Part C: shared document primitives
 *
 * Both Part C documents — the per-assessment report and the annual
 * disclosure — are produced in PDF and in Word from one structured object.
 * The primitives that draw them live here so the two formats, and the two
 * documents, cannot drift into saying different things in different styles.
 */

'use strict';

const {
  Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle
} = require('docx');

/** Numbers as a reader expects them: grouped, at most two decimals. */
const N = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

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

const _p = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text: String(text), ...opts })],
  spacing: { after: 80 },
  ...(opts.paraOpts || {})
});

const _h = (text, level) => new Paragraph({
  text: String(text), heading: level, spacing: { before: 240, after: 120 }
});

const _cell = (text, bold = false) => new TableCell({
  children: [new Paragraph({ children: [new TextRun({ text: String(text), bold, size: 18 })] })],
  margins: { top: 60, bottom: 60, left: 80, right: 80 }
});

const _table = (header, rows) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  borders: {
    top:    { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
    left:   { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
    right:  { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
    insideVertical:   { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' }
  },
  rows: [
    new TableRow({ children: header.map(h => _cell(h, true)) }),
    ...rows.map(r => new TableRow({ children: r.map(c => _cell(c)) }))
  ]
});

module.exports = { N, pdfWriter, _p, _h, _cell, _table };
