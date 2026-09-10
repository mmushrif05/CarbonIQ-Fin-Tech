// @ts-check
/**
 * Word document primitives — a paragraph, a heading, a cell, a table.
 *
 * These are `docx` builders and nothing more: they know how to make a bordered
 * table and a bold run, and nothing about emissions, policies or standards.
 *
 * They lived inside `src/domains/pcaf-part-c/reporting/partc-docgen.js` as
 * `_p`, `_h`, `_cell` and `_table`, and the GCF Concept Note package imported
 * all three of them — by their private names — across a domain boundary. PCAF
 * Part C and the GCF pipeline are two of the three scopes that must never
 * merge, and while an `application/` layer may legitimately import another
 * domain's non-interface code, reaching for its *privates* is the signal that
 * the seam is in the wrong place. It was: this is platform, not Part C.
 *
 * Part C re-exports them under their old names so nothing that has always read
 * them from there had to change.
 */

'use strict';

const {
  Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, HeadingLevel,
} = require('docx');

const para = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text: String(text), ...opts })],
  spacing: { after: 80 },
  ...(opts.paraOpts || {})
});

const heading = (text, level) => new Paragraph({
  text: String(text), heading: level, spacing: { before: 240, after: 120 }
});

const cell = (text, bold = false) => new TableCell({
  children: [new Paragraph({ children: [new TextRun({ text: String(text), bold, size: 18 })] })],
  margins: { top: 60, bottom: 60, left: 80, right: 80 }
});

const table = (header, rows) => new Table({
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
    new TableRow({ children: header.map(h => cell(h, true)) }),
    ...rows.map(r => new TableRow({ children: r.map(c => cell(c)) }))
  ]
});


module.exports = { para, heading, cell, table, HeadingLevel };
