// @ts-check
/**
 * The block vocabulary both renderers read.
 *
 * A content model is a list of these blocks per section; the PDF and Word
 * renderers each know how to draw every kind. The vocabulary is generic —
 * it carries no domain's facts, only the shapes a page is made of — so one
 * renderer serves every report the application generates.
 */

'use strict';

const b = {
  h2:      text => ({ kind: 'h2', text }),
  band:    text => ({ kind: 'band', text }),
  body:    text => ({ kind: 'body', text }),
  caption: text => ({ kind: 'caption', text }),
  bullets: items => ({ kind: 'bullets', items }),
  callout: (text, title) => ({ kind: 'callout', text, title }),
  figure:  o => ({ kind: 'figure', ...o }),
  table:   o => ({ kind: 'table', ...o }),
  legend:  () => ({ kind: 'legend' }),
  checklist: () => ({ kind: 'checklist' }),
  pageBreak: () => ({ kind: 'pageBreak' })
};

/** Drop the null blocks a conditional model leaves behind. */
const keep = blocks => blocks.filter(Boolean);

module.exports = { b, keep };
