// @ts-check
/**
 * The PDF writer: page furniture, headings, tables, callouts.
 */

'use strict';

const { blend, PALETTE } = require('./palette');
const { registerFonts, glyphSafe } = require('./fonts');

// ---------------------------------------------------------------------------
// PDF page furniture
// ---------------------------------------------------------------------------

const PAGE = {
  margin: 57,          // ~20mm
  bandH: 13,           // top and footer strips
  footerH: 26
};

/**
 * Bind the PCAF-consistent writer to one pdfkit document.
 *
 * Every method draws and advances; nothing returns a layout for the caller
 * to position, because a report assembled from positioned fragments drifts
 * the moment a section grows.
 */
function pcafWriter(doc, meta = {}) {
  const { names: F, embedded } = registerFonts(doc);
  glyphSafe(doc);
  const left = doc.page.margins.left;
  const width = () => doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;

  let coverDrawn = false;

  /*
   * The strips at the head and foot of every page after the cover.
   *
   * Drawing into the footer means writing below the bottom margin, and
   * pdfkit reads that as text overflowing: it opens another page, which
   * fires this handler again, which writes another footer. The margin is
   * therefore lifted for the length of the draw and put back afterwards, so
   * the furniture cannot paginate the document it is decorating.
   *
   * The page number is stamped at the end, when the total is known.
   */
  const outsideMargins = draw => {
    const keep = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    try { draw(); } finally { doc.page.margins.bottom = keep; }
  };

  const furniture = () => {
    const w = doc.page.width, h = doc.page.height;
    doc.save();
    doc.rect(0, 0, w, PAGE.bandH).fill(PALETTE.band);
    doc.rect(0, h - PAGE.footerH, w, PAGE.footerH).fill(PALETTE.band);
    outsideMargins(() => {
      doc.fillColor(PALETTE.grey).font(F.sansBold).fontSize(7.5)
         .text('CarbonIQ', left, h - PAGE.footerH + 9, { width: width() / 2, lineBreak: false });
    });
    doc.restore();
    doc.x = left;
    doc.y = doc.page.margins.top;
  };

  doc.on('pageAdded', furniture);

  // ── Cover ────────────────────────────────────────────────────────────────
  /**
   * A solid field, a large title, and a white angled corner carrying the
   * preparer's mark. The chevrons are a low-contrast watermark: present
   * enough to read as designed, faint enough never to compete with the text.
   */
  function cover({ title, subtitle, insurer, reportingYear, publishedAt, standard, preparedBy, reportId }) {
    const w = doc.page.width, h = doc.page.height;
    doc.save();
    doc.rect(0, 0, w, h).fill(PALETTE.slate);

    /* The chevrons are drawn in a pre-blended solid rather than with a
       constant-alpha graphics state. Transparency is a PDF 1.4 feature, and
       a file that uses one while declaring an earlier version is malformed —
       the kind of defect a lenient viewer renders anyway and a strict one
       refuses. Blending here keeps the watermark and keeps the file valid
       for any reader. */
    doc.save().lineWidth(14).strokeColor(blend(PALETTE.white, PALETTE.slate, 0.07));
    for (let i = -2; i < 9; i++) {
      const x = i * 90;
      doc.moveTo(x, h).lineTo(x + 150, h - 250).lineTo(x + 300, h).stroke();
    }
    doc.restore();

    doc.fillColor(PALETTE.white).font(F.sansBold).fontSize(34)
       .text(title, left, 210, { width: width() - 70, lineGap: 4 });

    if (subtitle) {
      doc.moveDown(0.55).fillColor('#D6DEE7').font(F.sans).fontSize(13)
         .text(subtitle, { width: width() - 90 });
    }

    doc.moveDown(1.4).fillColor(PALETTE.white).font(F.sansBold).fontSize(15)
       .text(insurer || 'Re/insurer not stated', { width: width() - 90 });
    doc.moveDown(0.25).fillColor('#C3CEDA').font(F.sans).fontSize(11)
       .text(`Reporting year ${reportingYear}`, { width: width() - 90 });

    doc.moveDown(1.6).fillColor('#AFBDCC').font(F.sans).fontSize(9)
       .text(standard, { width: width() - 110, lineGap: 2 });

    doc.fillColor('#AFBDCC').font(F.sans).fontSize(9)
       .text(`Published ${publishedAt}`, left, h - 190, { width: width() - 200 });
    if (reportId) doc.text(`Report reference ${reportId}`, { width: width() - 200 });

    /* The white angled corner block holding the preparer's lockup. The whole
       block is drawn outside the margins: it sits in the bleed below the
       text frame, and without that pdfkit reads the second line of the
       preparer credit as an overflow and opens a blank page for it. */
    const bw = 258, bh = 104;
    doc.save();
    outsideMargins(() => {
      doc.moveTo(w, h - bh - 46).lineTo(w, h).lineTo(w - bw, h).lineTo(w - bw + 46, h - bh - 46)
         .closePath().fill(PALETTE.white);
      doc.fillColor(PALETTE.green).font(F.serifBold).fontSize(17)
         .text('CarbonIQ', w - bw + 64, h - bh - 4, { width: bw - 84, lineBreak: false });
      doc.fillColor(PALETTE.grey).font(F.sans).fontSize(7.4)
         .text(preparedBy, w - bw + 64, h - bh + 20, { width: bw - 82, height: 30, lineGap: 1.5 });
    });
    doc.restore();
    doc.restore();

    coverDrawn = true;
    doc.addPage();
  }

  // ── Type ─────────────────────────────────────────────────────────────────
  const room = need => {
    if (doc.y + need > bottom()) doc.addPage();
  };

  /** Section title: transitional serif, bold, in the standard's green. */
  /**
   * @param {string} text
   * @param {{numbered?: number|null}} [opts]
   */
  function h1(text, { numbered = null } = {}) {
    room(64);
    doc.moveDown(0.9);
    const label = numbered === null ? text : `${numbered}.  ${text}`;
    doc.fillColor(PALETTE.green).font(F.serifBold).fontSize(18)
       .text(label, left, doc.y, { width: width(), lineGap: 1 });
    doc.moveDown(0.25);
    const y = doc.y;
    doc.save().lineWidth(1.6).strokeColor(PALETTE.green)
       .moveTo(left, y).lineTo(left + 54, y).stroke().restore();
    doc.y = y + 12;
  }

  /** Sub-head: sans, bold, all caps, letter-spaced. */
  function h2(text) {
    room(40);
    doc.moveDown(0.7);
    doc.fillColor(PALETTE.charcoal).font(F.sansBold).fontSize(9)
       .text(String(text).toUpperCase(), left, doc.y,
         { width: width(), characterSpacing: 1.1 });
    doc.moveDown(0.35);
  }

  /** A full-width green band with white caps — used to open a table block. */
  function band(text) {
    room(46);
    doc.moveDown(0.5);
    const y = doc.y, h = 21;
    doc.save().rect(left, y, width(), h).fill(PALETTE.green);
    doc.fillColor(PALETTE.white).font(F.sansBold).fontSize(8.4)
       .text(String(text).toUpperCase(), left + 9, y + 6.5,
         { width: width() - 18, characterSpacing: 1, lineBreak: false });
    doc.restore();
    doc.y = y + h + 8;
  }

  function body(text, { size = 10, color = PALETTE.charcoal, font = F.sans, indent = 0 } = {}) {
    if (text === null || text === undefined || text === '') return;
    room(26);
    doc.fillColor(color).font(font).fontSize(size)
       .text(String(text), left + indent, doc.y, { width: width() - indent, lineGap: 3.2, align: 'left' });
    doc.moveDown(0.42);
  }

  const caption = text => body(text, { size: 8.4, color: PALETTE.grey, font: F.sansItalic });

  /** Bulleted line — a dash rule rather than a glyph, which the fallback font may lack. */
  function bullet(text) {
    room(24);
    const y = doc.y;
    doc.save().circle(left + 3.4, y + 5.4, 1.7).fill(PALETTE.green).restore();
    doc.fillColor(PALETTE.charcoal).font(F.sans).fontSize(10)
       .text(String(text), left + 13, y, { width: width() - 13, lineGap: 3 });
    doc.moveDown(0.3);
  }

  /** Callout: a left rule in green, never a filled box. */
  function callout(text, { title = null } = {}) {
    room(56);
    doc.moveDown(0.4);
    const startY = doc.y;
    const innerX = left + 14, innerW = width() - 16;
    if (title) {
      doc.fillColor(PALETTE.green).font(F.sansBold).fontSize(8.6)
         .text(String(title).toUpperCase(), innerX, doc.y, { width: innerW, characterSpacing: 1 });
      doc.moveDown(0.25);
    }
    doc.fillColor(PALETTE.charcoal).font(F.sans).fontSize(9.6)
       .text(String(text), innerX, doc.y, { width: innerW, lineGap: 3.2 });
    const endY = doc.y;
    doc.save().lineWidth(2.4).strokeColor(PALETTE.green)
       .moveTo(left + 1.2, startY - 2).lineTo(left + 1.2, endY + 2).stroke().restore();
    doc.y = endY;
    doc.moveDown(0.5);
  }

  /** A headline figure with its unit and its data-quality score beside it. */
  function figure({ label, value, unit, score = null, note = null }) {
    room(76);
    doc.moveDown(0.3);
    doc.fillColor(PALETTE.grey).font(F.sansBold).fontSize(8)
       .text(String(label).toUpperCase(), left, doc.y, { width: width(), characterSpacing: 0.9 });
    doc.moveDown(0.25);
    const y = doc.y;
    doc.fillColor(PALETTE.greenDk).font(F.sansBold).fontSize(26)
       .text(String(value), left, y, { width: width() * 0.62, lineBreak: false, continued: false });
    const vw = doc.widthOfString(String(value));
    doc.fillColor(PALETTE.grey).font(F.sans).fontSize(10)
       .text(unit, left + vw + 8, y + 13, { width: 140, lineBreak: false });
    if (score) {
      doc.fillColor(PALETTE.grey).font(F.sans).fontSize(9)
         .text(score, left + width() * 0.62, y + 12,
           { width: width() * 0.38, align: 'right', lineBreak: false });
    }
    doc.y = y + 32;
    if (note) caption(note);
  }

  // ── Tables ───────────────────────────────────────────────────────────────
  /**
   * Sage header, hairline rules, no heavy grid.
   *
   * Widths are proportions; a row that will not fit breaks to a new page and
   * the header is redrawn, so a table read across a page break still has its
   * column names.
   */
  /**
   * @param {{head: string[], rows: any[][], widths?: number[]|null,
   *          align?: ('left'|'right'|'center')[], zebra?: boolean, fontSize?: number}} spec
   *   `widths` are relative proportions, not points; a set whose length does
   *   not match the header is ignored rather than half-applied.
   */
  function table({ head, rows, widths = null, align = [], zebra = false, fontSize = 8.6 }) {
    const avail = width();
    const n = head.length;
    const props = widths && widths.length === n ? widths : new Array(n).fill(1);
    const sum = props.reduce((a, b) => a + b, 0);
    const cols = props.map(p => (p / sum) * avail);
    const PADX = 7, PADY = 6;

    const cellH = (text, w, font, size) => {
      doc.font(font).fontSize(size);
      return doc.heightOfString(String(text ?? ''), { width: w - PADX * 2, lineGap: 1.6 }) + PADY * 2;
    };

    const drawRow = (cells, { header = false, index = 0, total = false } = {}) => {
      const font = header || total ? F.sansBold : F.sans;
      const size = header ? 7.9 : fontSize;
      const h = Math.max(...cells.map((c, i) => cellH(c, cols[i], font, size)), header ? 20 : 17);

      if (doc.y + h > bottom()) { doc.addPage(); drawRow(head, { header: true }); }

      const y = doc.y;
      if (header) doc.save().rect(left, y, avail, h).fill(PALETTE.sage).restore();
      else if (zebra && index % 2 === 1) doc.save().rect(left, y, avail, h).fill(PALETTE.zebra).restore();

      let x = left;
      cells.forEach((c, i) => {
        doc.fillColor(header ? PALETTE.greenDk : PALETTE.charcoal).font(font).fontSize(size)
           .text(String(c ?? ''), x + PADX, y + PADY,
             { width: cols[i] - PADX * 2, lineGap: 1.6, align: align[i] || 'left' });
        x += cols[i];
      });

      doc.save().lineWidth(header || total ? 0.9 : 0.5)
         .strokeColor(header || total ? PALETTE.grey : PALETTE.rule)
         .moveTo(left, y + h).lineTo(left + avail, y + h).stroke().restore();
      doc.y = y + h;
    };

    room(64);
    drawRow(head, { header: true });
    rows.forEach((r, i) => drawRow(r, { index: i, total: /** @type {any} */ (r)._total === true }));
    doc.y += 6;
    doc.x = left;
  }

  /** Requirement / recommendation legend, mirroring the checklist convention. */
  function legend() {
    room(34);
    const y = doc.y;
    doc.save();
    doc.rect(left, y + 1.5, 9, 9).fill(PALETTE.green);
    doc.fillColor(PALETTE.charcoal).font(F.sans).fontSize(8.4)
       .text('Requirement ("shall")', left + 15, y + 1.5, { width: 130, lineBreak: false });
    doc.rect(left + 160, y + 1.5, 9, 9).fill('#BFBFBF');
    doc.fillColor(PALETTE.charcoal).font(F.sans).fontSize(8.4)
       .text('Recommendation ("should")', left + 175, y + 1.5, { width: 160, lineBreak: false });
    doc.restore();
    doc.y = y + 20;
  }

  const pageBreak = () => doc.addPage();

  /**
   * Stamp "Page n of m" on every page but the cover, then close the document.
   *
   * The total is only knowable once the last page exists, so the footers are
   * written at the end over buffered pages rather than guessed as each page
   * opens.
   */
  function finalise() {
    const range = doc.bufferedPageRange();
    const first = coverDrawn ? range.start + 1 : range.start;
    const total = range.start + range.count - first;
    for (let i = first; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const h = doc.page.height, w = doc.page.width;
      doc.save();
      outsideMargins(() => {
        doc.fillColor(PALETTE.grey).font(F.sans).fontSize(7.5)
           .text(`Page ${i - first + 1} of ${total}`,
             w / 2, h - PAGE.footerH + 9,
             { width: w / 2 - PAGE.margin, align: 'right', lineBreak: false });
        if (meta.footerNote) {
          doc.fillColor(PALETTE.grey).font(F.sans).fontSize(7)
             .text(meta.footerNote, PAGE.margin + 52, h - PAGE.footerH + 9.5,
               { width: w / 2 - 60, lineBreak: false });
        }
      });
      doc.restore();
    }
    doc.flushPages();
    doc.end();
  }

  return {
    F, embedded, PALETTE,
    cover, h1, h2, band, body, caption, bullet, callout, figure, table, legend,
    pageBreak, finalise, room
  };
}

/** A pdfkit document set up for this house style. */
function pcafDocument() {
  const PDFDocument = require('pdfkit');
  return new PDFDocument({
    size: 'A4',
    margins: { top: PAGE.margin, bottom: PAGE.margin + 8, left: PAGE.margin, right: PAGE.margin },
    bufferPages: true,
    compress: true,
    autoFirstPage: true,
    /* Embedded TrueType subsets with Identity-H encoding are a PDF 1.2
       feature and pdfkit's default header of 1.3 covers them, but a document
       must never declare a version older than something it contains. 1.4 is
       stated so the header stays correct if anything later is ever added,
       and it is universally supported. */
    pdfVersion: '1.4'
  });
}

module.exports = { pcafWriter, pcafDocument, PAGE };
