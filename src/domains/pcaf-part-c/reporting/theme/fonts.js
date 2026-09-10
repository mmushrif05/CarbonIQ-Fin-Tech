// @ts-check
/**
 * The vendored faces, and the glyphs the standard fonts cannot draw.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { winAnsi } = require('../partc-docgen');

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

const FONT_DIR = path.join(__dirname, '..', '..', '..', '..', '..', 'assets', 'fonts');

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

module.exports = { loadFonts, registerFonts, _replacement, glyphSafe, FONT_DIR, FONT_FILES, FALLBACK, WORD_FONTS, _fontCache, SUBSTITUTE };
