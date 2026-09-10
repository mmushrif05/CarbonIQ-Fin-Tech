// @ts-check
/**
 * The Word styles and building blocks.
 */

'use strict';

const {
  Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, HeadingLevel, ShadingType
} = require('docx');
const { PALETTE, hex } = require('./palette');
const { WORD_FONTS } = require('./fonts');

// ---------------------------------------------------------------------------
// Word — the same language in styles a client can edit
// ---------------------------------------------------------------------------

/**
 * Real named styles rather than direct formatting, so a client opening the
 * document can restyle a heading once and have every heading follow.
 */
const wordStyles = () => ({
  default: {
    document: { run: { font: WORD_FONTS.sans, size: 20, color: hex(PALETTE.charcoal) } }
  },
  paragraphStyles: [
    {
      id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { font: WORD_FONTS.sans, size: 56, bold: true, color: hex(PALETTE.white) },
      paragraph: { spacing: { after: 200 } }
    },
    {
      id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { font: WORD_FONTS.serif, size: 30, bold: true, color: hex(PALETTE.green) },
      paragraph: { spacing: { before: 360, after: 140 } }
    },
    {
      id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { font: WORD_FONTS.sans, size: 18, bold: true, color: hex(PALETTE.charcoal), allCaps: true },
      paragraph: { spacing: { before: 240, after: 100 } }
    },
    {
      id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { font: WORD_FONTS.sans, size: 17, bold: true, color: hex(PALETTE.greenDk) },
      paragraph: { spacing: { before: 180, after: 80 } }
    },
    {
      id: 'Caption', name: 'Caption', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { font: WORD_FONTS.sans, size: 16, italics: true, color: hex(PALETTE.grey) },
      paragraph: { spacing: { after: 120 } }
    },
    {
      id: 'Callout', name: 'Callout', basedOn: 'Normal', next: 'Normal', quickFormat: true,
      run: { font: WORD_FONTS.sans, size: 19, color: hex(PALETTE.charcoal) },
      paragraph: {
        spacing: { before: 160, after: 160 }, indent: { left: 280 },
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: hex(PALETTE.green), space: 12 } }
      }
    }
  ]
});

const wTitle   = text => new Paragraph({ text: String(text), style: 'Title' });
const wH1      = text => new Paragraph({ text: String(text), heading: HeadingLevel.HEADING_1 });
const wH2      = text => new Paragraph({ text: String(text), heading: HeadingLevel.HEADING_2 });
const wH3      = text => new Paragraph({ text: String(text), heading: HeadingLevel.HEADING_3 });
const wCaption = text => new Paragraph({ text: String(text), style: 'Caption' });
const wCallout = text => new Paragraph({ text: String(text), style: 'Callout' });

const wBody = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text: String(text ?? ''), ...opts })],
  spacing: { after: 110, line: 300 }
});

const wBullet = text => new Paragraph({
  children: [new TextRun({ text: String(text ?? '') })],
  bullet: { level: 0 }, spacing: { after: 70 }
});

/** The green section band, drawn in Word as a shaded full-width paragraph. */
const wBand = text => new Paragraph({
  children: [new TextRun({
    text: String(text).toUpperCase(), bold: true, allCaps: true,
    color: hex(PALETTE.white), size: 17, font: WORD_FONTS.sans
  })],
  shading: { type: ShadingType.CLEAR, fill: hex(PALETTE.green) },
  spacing: { before: 200, after: 100 }, indent: { left: 90, right: 90 }
});

const wCell = (text, { bold = false, header = false, align = AlignmentType.LEFT, fill = null } = {}) =>
  new TableCell({
    children: [new Paragraph({
      children: [new TextRun({
        text: String(text ?? ''), bold: bold || header, size: header ? 16 : 17,
        color: hex(header ? PALETTE.greenDk : PALETTE.charcoal), font: WORD_FONTS.sans
      })],
      alignment: align, spacing: { after: 0 }
    })],
    shading: (header || fill) ? { type: ShadingType.CLEAR, fill: hex(fill || PALETTE.sage) } : undefined,
    margins: { top: 70, bottom: 70, left: 90, right: 90 }
  });

/**
 * A table in the house style: sage header, hairlines, no heavy grid.
 * @param {string[]} head
 * @param {Array<Array<string>>} rows
 * @param {Object} [opts] align: array of 'left'|'right'|'center'; widths: proportions
 */
function wTable(head, rows, opts = {}) {
  const al = (opts.align || []).map(a =>
    a === 'right' ? AlignmentType.RIGHT : a === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT);
  const hair = { style: BorderStyle.SINGLE, size: 2, color: hex(PALETTE.rule) };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: opts.widths || undefined,
    borders: {
      top: hair, bottom: hair, left: hair, right: hair,
      insideHorizontal: hair, insideVertical: hair
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: head.map((h, i) => wCell(h, { header: true, align: al[i] }))
      }),
      ...rows.map(r => new TableRow({
        children: r.map((c, i) => wCell(c, { align: al[i], bold: /** @type {any} */ (r)._total === true }))
      }))
    ]
  });
}

module.exports = { wTable, wordStyles, wTitle, wH1, wH2, wH3, wCaption, wCallout, wBody, wBullet, wBand, wCell };
