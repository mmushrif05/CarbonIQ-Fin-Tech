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

/* The Word primitives are `src/platform/reporting/docx.js` now — they are
   `docx` builders that know nothing about emissions, and the GCF Concept Note
   package was importing them from here across a domain boundary, by their
   private names. Re-exported so every caller that has always read them from
   this module still can. */
const { para: _p, heading: _h, cell: _cell, table: _table } = require('../../../platform/reporting/docx');

module.exports = { N, pdfWriter, winAnsi, winAnsiSafe, _p, _h, _cell, _table };
