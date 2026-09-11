// @ts-check
/**
 * The report's visual language — generic PCAF report furniture.
 *
 * A disclosure is read beside the standard it claims conformance with, so it
 * should not look like a different kind of document. This module carries the
 * page furniture — palette, typography, cover, bands, tables — observed from
 * PCAF's own published PDFs, so every report the application generates is
 * visually consistent with them.
 *
 * It knows nothing about any one domain: Part C and Part A both render their
 * own content model through it, which is what "one renderer" means once the
 * two scopes must never merge. The mark on the page is Datum's; PCAF
 * authorship is never implied and the PCAF name appears only in a conformance
 * statement and in citations the content model supplies.
 */

'use strict';

const { blend, PALETTE, hex } = require('./theme/palette');
const { loadFonts, registerFonts, glyphSafe, WORD_FONTS, SUBSTITUTE } = require('./theme/fonts');
const { pcafWriter, pcafDocument, PAGE } = require('./theme/pdf-writer');
const { wTable, wordStyles, wTitle, wH1, wH2, wH3, wCaption, wCallout, wBody, wBullet, wBand, wCell } = require('./theme/word');

module.exports = {
  PALETTE, PAGE, WORD_FONTS, hex, blend, SUBSTITUTE, glyphSafe,
  registerFonts, loadFonts, pcafWriter, pcafDocument,
  wordStyles, wTitle, wH1, wH2, wH3, wBody, wBullet, wCaption, wCallout, wBand, wCell, wTable
};
