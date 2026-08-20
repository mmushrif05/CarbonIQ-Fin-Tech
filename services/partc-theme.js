/**
 * CarbonIQ FinTech — PCAF Part C: the report's visual language
 *
 * A disclosure is read beside the standard it claims conformance with, so it
 * should not look like a different kind of document. This module carries the
 * page furniture — palette, typography, cover, bands, tables — observed from
 * PCAF's own published PDFs, so every report the application generates is
 * visually consistent with them.
 *
 * Consistency, not impersonation. The PCAF logo is never reproduced and PCAF
 * authorship is never implied: the mark on the page is Datum's, and the PCAF
 * name appears only in the conformance statement and in citations.
 *
 * PCAF publishes no public brand style guide, so the palette below is
 * sampled from published documents and the fonts are open-licensed faces
 * chosen to match the observed system — a transitional serif for section
 * titles, a humanist sans for everything else — not PCAF's licensed fonts.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, HeadingLevel, ShadingType
} = require('docx');

const { winAnsi } = require('./partc-docgen');

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

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');

/*
 * Embedded faces, and what happens without them.
 *
 * pdfkit's built-in fonts encode WinAnsi only, so a summation sign in an
 * equation draws as mojibake. Embedding real TrueType faces fixes that and
 * gives the serif/sans contrast the standard's own documents use.
 *
 * The bundle may not carry the files in every deployment, so a missing face
 * is not an error: the document falls back to the built-in fonts and the
 * caller re-applies the WinAnsi transliteration. The report is then plainer
 * but never broken, and never silently wrong.
 */
const FONT_FILES = {
  serif:       'Lora-Regular.ttf',
  serifBold:   'Lora-Bold.ttf',
  serifItalic: 'Lora-Italic.ttf',
  sans:        'WorkSans-Regular.ttf',
  sansBold:    'WorkSans-Bold.ttf',
  sansItalic:  'WorkSans-Italic.ttf'
};

const FALLBACK = {
  serif: 'Times-Roman', serifBold: 'Times-Bold', serifItalic: 'Times-Italic',
  sans: 'Helvetica', sansBold: 'Helvetica-Bold', sansItalic: 'Helvetica-Oblique'
};

/** Word font names, for the .docx side where nothing is embedded. */
const WORD_FONTS = { serif: 'Lora', sans: 'Work Sans' };

let _fontCache = null;

/** Read the faces once per process; the files never change at runtime. */
function loadFonts() {
  if (_fontCache) return _fontCache;
  const loaded = {};
  for (const [key, file] of Object.entries(FONT_FILES)) {
    try { loaded[key] = fs.readFileSync(path.join(FONT_DIR, file)); }
    catch (_) { /* the fallback covers it */ }
  }
  _fontCache = loaded;
  return loaded;
}

/**
 * Register what is available on one document.
 * @returns {{names: Object, embedded: boolean}} the font name to use for each
 *          role, and whether real faces were embedded.
 */
function registerFonts(doc) {
  const loaded = loadFonts();
  const names = { ...FALLBACK };
  let embedded = true;
  for (const key of Object.keys(FONT_FILES)) {
    if (!loaded[key]) { embedded = false; continue; }
    const name = `cq-${key}`;
    try { doc.registerFont(name, loaded[key]); names[key] = name; }
    catch (_) { embedded = false; }
  }
  return { names, embedded };
}

// ---------------------------------------------------------------------------
// Glyph safety
// ---------------------------------------------------------------------------

/*
 * A character the active face cannot draw comes out as a hollow box, and a
 * disclosure whose weighting formula reads as a row of boxes is worse than
 * one that spells the formula in words.
 *
 * Neither chosen face carries Greek capital sigma, though both carry the
 * n-ary summation sign that means the same thing in a formula; Lora carries
 * no arrows or subscripts, which Work Sans does. So the substitution is
 * resolved against the face actually in use at the moment of drawing, and
 * prefers a real glyph over spelling the symbol out. Nothing is substituted
 * that the face can draw.
 */
const SUBSTITUTE = {
  '\u03a3': ['\u2211', 'sum of '],          // Greek capital sigma
  '\u2211': ['\u03a3', 'sum of '],          // n-ary summation
  '\u0394': ['\u2206', 'delta '],
  '\u2192': ['->'], '\u2190': ['<-'], '\u2191': ['up'], '\u2193': ['down'],
  '\u2082': ['2'], '\u2083': ['3'], '\u00b2': ['2'], '\u00b3': ['3'],
  '\u2212': ['-'], '\u00d7': ['x'], '\u00f7': ['/'],
  '\u2264': ['<='], '\u2265': ['>='], '\u2260': ['!='], '\u2248': ['~'],
  '\u221a': ['sqrt'], '\u221e': ['infinity'],
  '\u2014': ['-'], '\u2013': ['-'], '\u2022': ['-'], '\u2026': ['...'],
  '\u2018': ["'"], '\u2019': ["'"], '\u201c': ['"'], '\u201d': ['"'],
  '\u00b7': ['.'], '\u00b0': [' deg'], '\u00b5': ['u'], '\u2030': [' per mille'],
  '\u00a7': ['Section '], '\u00a0': [' '], '\u2011': ['-'], '\u202f': [' ']
};

/** What this face should draw instead of a character it does not carry. */
function _replacement(ch, has) {
  for (const alt of (SUBSTITUTE[ch] || [])) {
    if ([...alt].every(c => has(c.codePointAt(0)))) return alt;
  }
  return has(0x3f) ? '?' : '';
}

/**
 * Route every string a document draws through the active face's coverage.
 *
 * Standard fonts expose no coverage map, so they fall back to the WinAnsi
 * transliteration that governed the documents before any face was embedded.
 */
function glyphSafe(doc) {
  const write = doc.text.bind(doc);
  const caches = new WeakMap();

  doc.text = (t, ...rest) => {
    if (typeof t !== 'string' || t === '') return write(t, ...rest);
    const face = doc._font && doc._font.font;
    const probe = face && typeof face.hasGlyphForCodePoint === 'function'
      ? face.hasGlyphForCodePoint.bind(face) : null;
    if (!probe) return write(winAnsi(t), ...rest);

    let cache = caches.get(face);
    if (!cache) { cache = new Map(); caches.set(face, cache); }

    let out = '';
    for (const ch of t) {
      const cp = ch.codePointAt(0);
      if (cp === 10 || cp === 13 || cp === 9 || probe(cp)) { out += ch; continue; }
      if (!cache.has(ch)) cache.set(ch, _replacement(ch, probe));
      out += cache.get(ch);
    }
    return write(out, ...rest);
  };
  return doc;
}

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
    rows.forEach((r, i) => drawRow(r, { index: i, total: r._total === true }));
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
        children: r.map((c, i) => wCell(c, { align: al[i], bold: r._total === true }))
      }))
    ]
  });
}

module.exports = {
  PALETTE, PAGE, WORD_FONTS, hex, blend, SUBSTITUTE, glyphSafe,
  registerFonts, loadFonts, pcafWriter, pcafDocument,
  wordStyles, wTitle, wH1, wH2, wH3, wBody, wBullet, wCaption, wCallout, wBand, wCell, wTable
};
