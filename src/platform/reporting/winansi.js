// @ts-check
/**
 * WinAnsi transliteration for the standard-14 PDF fonts.
 *
 * The standard-14 PDF fonts encode WinAnsi only. Anything outside it — the
 * summation sign in a weighting equation, a true minus, an arrow in a hint —
 * comes out of pdfkit as mojibake, and a disclosure whose formula is
 * unreadable is worse than one that spells the formula in words. Every string
 * written to a page is transliterated once, at the document, rather than at
 * each call site where the next author would forget.
 *
 * Generic report machinery: it knows nothing about any domain, so both the
 * Part C and Part A report renderers share it.
 */

'use strict';

const OUTSIDE_WINANSI = {
  'Σ': 'sum of ', '∑': 'sum of ', 'Δ': 'delta',
  '≈': '~', '≤': '<=', '≥': '>=', '≠': '!=',
  '→': '->', '←': '<-', '↑': 'up', '↓': 'down',
  '₂': '2', '₃': '3', '√': 'sqrt', '∞': 'infinity',
  '−': '-', '′': "'", '″': '"', ' ': ' '
};

/* Characters above Latin-1 that WinAnsi does encode, so they survive. */
const KEEP_ABOVE_LATIN1 =
  '–—‘’“”•…‰€Œœ' +
  'ŠšŸŽžƒˆ˜†‡‹›⁄';

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

module.exports = { winAnsi, winAnsiSafe };
