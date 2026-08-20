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

/*
 * The standard-14 PDF fonts encode WinAnsi only. Anything outside it - the
 * summation sign in a weighting equation, a true minus, an arrow in an
 * improvement hint - comes out of pdfkit as mojibake, and a disclosure whose
 * formula is unreadable is worse than one that spells the formula in words.
 *
 * Every string written to a page is transliterated once, at the document,
 * rather than at each call site where the next author would forget.
 */
const OUTSIDE_WINANSI = {
  '\u03a3': 'sum of ', '\u2211': 'sum of ', '\u0394': 'delta',
  '\u2248': '~', '\u2264': '<=', '\u2265': '>=', '\u2260': '!=',
  '\u2192': '->', '\u2190': '<-', '\u2191': 'up', '\u2193': 'down',
  '\u2082': '2', '\u2083': '3', '\u221a': 'sqrt', '\u221e': 'infinity',
  '\u2212': '-', '\u2032': "'", '\u2033': '"', '\u00a0': ' '
};

/* Characters above Latin-1 that WinAnsi does encode, so they survive. */
const KEEP_ABOVE_LATIN1 =
  '\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026\u2030\u20ac\u0152\u0153' +
  '\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2020\u2021\u2039\u203a\u2044';

const OUTSIDE = new RegExp('[^\\u0020-\\u00ff' + KEEP_ABOVE_LATIN1 + ']', 'g');

/** Transliterate a string into what a standard-14 font can actually draw. */
const winAnsi = t => typeof t === 'string'
  ? t.replace(OUTSIDE, c => (OUTSIDE_WINANSI[c] !== undefined ? OUTSIDE_WINANSI[c] : '?'))
  : t;

/** Patch one pdfkit document so every string it draws is WinAnsi-safe. */
function winAnsiSafe(doc) {
  const write = doc.text.bind(doc);
  doc.text = (t, ...rest) => write(winAnsi(t), ...rest);
  return doc;
}

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

module.exports = { N, pdfWriter, winAnsi, winAnsiSafe, _p, _h, _cell, _table };
