// @ts-check
/**
 * The PDF renderer over the content model.
 *
 * Domain-agnostic: it is handed the visual theme so it can draw a Part C
 * disclosure and a Part A disclosure through one code path. The theme is the
 * generic PCAF report furniture in ./theme; a domain that wants a different
 * look passes a different one.
 */

'use strict';

const defaultTheme = require('./theme');

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

/**
 * Draw the model.
 *
 * Section page numbers are recorded as each section opens, so the checklist —
 * which renders last — can tell a reviewer which page evidences each item
 * without anyone maintaining a map by hand.
 */
function renderStandardPDF(model, theme = defaultTheme) {
  const doc = theme.pcafDocument();
  const w = theme.pcafWriter(doc, { footerNote: model.footerNote });
  const pageOf = {};
  const pageNumber = () => doc.bufferedPageRange().count;   // 1-based, cover included

  w.cover(model.cover);

  const drawBlocks = blocks => {
    for (const blk of blocks) {
      switch (blk.kind) {
        case 'h2': w.h2(blk.text); break;
        case 'band': w.band(blk.text); break;
        case 'body': w.body(blk.text); break;
        case 'caption': w.caption(blk.text); break;
        case 'bullets': blk.items.forEach(i => w.bullet(i)); break;
        case 'callout': w.callout(blk.text, { title: blk.title }); break;
        case 'figure': w.figure(blk); break;
        case 'legend': w.legend(); break;
        case 'pageBreak': w.pageBreak(); break;
        case 'table': {
          w.table({ head: blk.head, rows: blk.rows, widths: blk.widths, align: blk.align, zebra: blk.zebra });
          if (blk.caption) w.caption(blk.caption);
          break;
        }
        case 'checklist': drawChecklist(); break;
        default: break;
      }
    }
  };

  const drawChecklist = () => {
    const c = model.checklist;
    w.body(c.provenance);
    w.h2('Header');
    w.table({
      head: ['Field', 'Stated'], widths: [1.6, 4.4],
      rows: [
        ['Re/insurer', c.header.reinsurer],
        ['Report title', c.header.reportTitle],
        ['Reporting year', String(c.header.reportingYear ?? 'not stated')],
        ['Publication date', c.header.publicationDate || 'not stated'],
        ['Report reference', c.header.reportReference || 'not stated'],
        ['URL', c.header.url || 'not published to a URL by this system']
      ]
    });
    w.h2('Summary');
    w.table({
      head: ['', 'Count', 'Of'], widths: [3.4, 1, 1], align: ['left', 'right', 'right'],
      rows: [
        ['Requirements ("shall") met', String(c.summary.requirements.met), String(c.summary.requirements.total)],
        ['Recommendations ("should") met', String(c.summary.recommendations.met), String(c.summary.recommendations.total)],
        ['Answered Yes', String(c.summary.answeredYes), String(c.summary.total)],
        ['Not applicable, with the reason stated', String(c.summary.notApplicable), String(c.summary.total)],
        Object.assign(['Answered No', String(c.summary.answeredNo), String(c.summary.total)], { _total: true })
      ]
    });
    w.legend();
    w.h2('Items');
    w.table({
      head: ['ID', 'Duty', 'Requirement', 'Clause', 'Answer', 'Page'],
      widths: [0.75, 0.7, 3.4, 1.5, 0.85, 0.55],
      align: ['left', 'left', 'left', 'left', 'left', 'right'],
      zebra: true,
      rows: c.items.map(i => [
        i.id, i.duty === 'shall' ? 'shall' : 'should',
        i.answer === 'Yes' ? i.item : `${i.item}  —  ${i.justification}`,
        i.clause, i.answer,
        pageOf[i.section] ? String(pageOf[i.section]) : '—'
      ])
    });
    w.caption('Page numbers refer to this document. An item marked "Not applicable" carries the reason in the requirement column.');
  };

  /* The cover opens the first content page itself, so the first section
     must not open another — that is how a blank sheet ends up at the front
     of a disclosure. Every section after it starts on a fresh page. */
  let n = 1;
  let first = true;
  for (const sec of model.sections) {
    if (!first) w.pageBreak();
    first = false;
    pageOf[sec.id] = pageNumber() - 1;      // the cover is not numbered
    w.h1(sec.title, { numbered: ++n });
    drawBlocks(sec.blocks);
  }

  for (const anx of model.annexes) {
    w.pageBreak();
    pageOf[anx.id] = pageNumber() - 1;
    w.h1(`Annex ${anx.annex} — ${anx.title}`);
    drawBlocks(anx.blocks);
  }

  w.finalise();
  return doc;
}

module.exports = { renderStandardPDF };
