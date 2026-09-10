// @ts-check
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

const { blend, PALETTE, hex } = require('./theme/palette');
const { loadFonts, registerFonts, glyphSafe, WORD_FONTS, SUBSTITUTE } = require('./theme/fonts');
const { pcafWriter, pcafDocument, PAGE } = require('./theme/pdf-writer');
const { wTable, wordStyles, wTitle, wH1, wH2, wH3, wCaption, wCallout, wBody, wBullet, wBand, wCell } = require('./theme/word');

module.exports = {
  PALETTE, PAGE, WORD_FONTS, hex, blend, SUBSTITUTE, glyphSafe,
  registerFonts, loadFonts, pcafWriter, pcafDocument,
  wordStyles, wTitle, wH1, wH2, wH3, wBody, wBullet, wCaption, wCallout, wBand, wCell, wTable
};
