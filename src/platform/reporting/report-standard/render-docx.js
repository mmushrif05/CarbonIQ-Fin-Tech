// @ts-check
/**
 * The Word renderer over the content model.
 *
 * Domain-agnostic: the visual theme is injected, so one code path renders
 * every report the application generates. See ./theme for the default.
 */

'use strict';

const { Document, Packer } = require('docx');
const defaultTheme = require('./theme');

// ---------------------------------------------------------------------------
// Word
// ---------------------------------------------------------------------------

/** The same model, in styles a client can edit. */
async function renderStandardDOCX(model, theme = defaultTheme) {
  const children = [];

  children.push(theme.wH1(model.cover.title));
  children.push(theme.wCaption(model.cover.subtitle || ''));
  /* The entity label is the model's: a Part C document names a re/insurer, a
     Part A document a reporting entity. The default keeps every existing
     document byte-identical. */
  const entityLabel = model.cover.entityLabel || 'Re/insurer';
  children.push(theme.wTable(['Field', 'Value'], [
    [entityLabel, model.cover.insurer],
    ['Reporting year', String(model.cover.reportingYear)],
    ['Published', model.cover.publishedAt],
    ['Report reference', model.cover.reportId || '—'],
    ['Standard', model.cover.standard],
    ['Prepared by', model.cover.preparedBy],
    /* The responsible party and the document identity, where the model
       states them — a verifier signs a named document a named person
       approved, so both sit on the face. */
    ...((model.cover.responsibleParty || []).map(line => ['Responsibility', line])),
    ...((model.cover.identity || []).map(line => ['Document identity', line])),
    /* The posture, on the face rather than in an annex — the same rule the
       PDF cover follows. */
    ['Assurance', model.cover.assuranceLabel || 'Self-declared']
  ], { align: ['left', 'left'] }));
  if (model.cover.assuranceStatement) children.push(theme.wBody(model.cover.assuranceStatement));

  const push = blocks => {
    for (const blk of blocks) {
      switch (blk.kind) {
        case 'h2': children.push(theme.wH2(blk.text)); break;
        case 'band': children.push(theme.wBand(blk.text)); break;
        case 'body': children.push(theme.wBody(blk.text)); break;
        case 'caption': children.push(theme.wCaption(blk.text)); break;
        case 'bullets': blk.items.forEach(i => children.push(theme.wBullet(i))); break;
        case 'callout':
          if (blk.title) children.push(theme.wH3(blk.title));
          children.push(theme.wCallout(blk.text));
          break;
        case 'figure':
          children.push(theme.wH3(blk.label));
          children.push(theme.wBody(`${blk.value} ${blk.unit || ''}`.trim(), { bold: true, size: 30 }));
          if (blk.score) children.push(theme.wBody(blk.score));
          if (blk.note) children.push(theme.wCaption(blk.note));
          break;
        case 'bars': {
          /* Word carries the same rows as a table: the figures, not a picture of them. */
          const d = blk.decimals === undefined ? 0 : blk.decimals;
          const rows = (blk.rows || []).map(r => [String(r.label), Number.isFinite(Number(r.value))
            ? Number(r.value).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—']);
          children.push(theme.wH3(blk.label));
          children.push(theme.wTable(['Item', blk.unit || 'Value'], rows, { align: ['left', 'right'] }));
          if (blk.caption) children.push(theme.wCaption(blk.caption));
          children.push(theme.wBody(''));
          break;
        }
        case 'table':
          children.push(theme.wTable(blk.head, blk.rows, { align: blk.align }));
          if (blk.caption) children.push(theme.wCaption(blk.caption));
          children.push(theme.wBody(''));
          break;
        case 'legend':
          children.push(theme.wCaption('Green — requirement ("shall").  Grey — recommendation ("should").'));
          break;
        case 'checklist': pushChecklist(); break;
        default: break;
      }
    }
  };

  const pushChecklist = () => {
    const c = model.checklist;
    children.push(theme.wBody(c.provenance));
    children.push(theme.wH2('Header'));
    children.push(theme.wTable(['Field', 'Stated'], [
      [c.header.entityLabel || 'Re/insurer', c.header.entity ?? c.header.reinsurer],
      ['Report title', c.header.reportTitle],
      ['Reporting year', String(c.header.reportingYear ?? 'not stated')],
      ['Publication date', c.header.publicationDate || 'not stated'],
      ['Report reference', c.header.reportReference || 'not stated'],
      ['URL', c.header.url || 'not published to a URL by this system']
    ]));
    children.push(theme.wH2('Summary'));
    children.push(theme.wTable(['', 'Count', 'Of'], [
      ['Requirements ("shall") met', String(c.summary.requirements.met), String(c.summary.requirements.total)],
      ['Recommendations ("should") met', String(c.summary.recommendations.met), String(c.summary.recommendations.total)],
      ['Answered Yes', String(c.summary.answeredYes), String(c.summary.total)],
      ['Not applicable, with the reason stated', String(c.summary.notApplicable), String(c.summary.total)],
      ['Answered No', String(c.summary.answeredNo), String(c.summary.total)]
    ], { align: ['left', 'right', 'right'] }));
    children.push(theme.wH2('Items'));
    children.push(theme.wTable(
      ['ID', 'Duty', 'Requirement', 'Clause', 'Answer', 'Section'],
      c.items.map(i => [
        i.id, i.duty, i.answer === 'Yes' ? i.item : `${i.item} — ${i.justification}`,
        i.clause, i.answer, i.section
      ])));
  };

  let n = 1;
  for (const sec of model.sections) {
    children.push(theme.wH1(`${++n}. ${sec.title}`));
    push(sec.blocks);
  }
  for (const anx of model.annexes) {
    children.push(theme.wH1(`Annex ${anx.annex} — ${anx.title}`));
    push(anx.blocks);
  }

  const doc = new Document({ styles: theme.wordStyles(), sections: [{ children }] });
  return Packer.toBuffer(doc);
}

module.exports = { renderStandardDOCX };
