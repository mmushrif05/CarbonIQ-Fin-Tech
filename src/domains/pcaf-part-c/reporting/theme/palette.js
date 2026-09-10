// @ts-check
/**
 * The palette, and blending for a pre-blended watermark.
 */

'use strict';

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const PALETTE = {
  slate:    '#3E6180',   // cover field
  green:    '#4A5F42',   // section titles and bands
  greenDk:  '#3D5238',   // deep heading green
  sage:     '#C5CCC0',   // table header fill
  coral:    '#E8935F',   // numbering accent, used sparingly
  charcoal: '#333333',   // body
  grey:     '#6E6E6E',   // captions and secondary
  rule:     '#D9D9D9',   // hairlines
  band:     '#F2F2F2',   // header and footer strips
  white:    '#FFFFFF',
  zebra:    '#FAFAFA'
};

/**
 * Composite a colour over a background at a given alpha, as a solid.
 *
 * Used instead of a transparency group so nothing in a generated document
 * depends on a PDF feature later than the version it declares.
 */
function blend(fg, bg, alpha) {
  const rgb = c => [1, 3, 5].map(i => parseInt(String(c).replace('#', '').substr(i - 1, 2), 16));
  const [fr, fg_, fb] = rgb(fg);
  const [br, bg_, bb] = rgb(bg);
  const mix = (f, b) => Math.round(alpha * f + (1 - alpha) * b);
  return '#' + [mix(fr, br), mix(fg_, bg_), mix(fb, bb)]
    .map(v => v.toString(16).padStart(2, '0')).join('');
}

/** Word wants six hex digits with no hash. */
const hex = c => String(c).replace('#', '').toUpperCase();

module.exports = { blend, PALETTE, hex };
