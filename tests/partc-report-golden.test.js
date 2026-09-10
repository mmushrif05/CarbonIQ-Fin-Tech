/**
 * The regulated deliverable, pinned.
 *
 * 2,730 lines of report code produce the document a bank's auditor reads, and
 * until now the tests over it asserted properties — `gaps.length > 5`,
 * `reason.length > 30` — while the only check on the PDF was that it was a
 * well-formed PDF. A section silently dropped, a table with more cells than
 * columns, a figure that stopped rendering: all invisible to CI, all visible
 * to the reader.
 *
 * So the whole document is flattened to an outline and held to a committed
 * golden file. Anything that changes what the document says shows up as a
 * readable diff, and a change that is intended is one command away:
 *
 *   UPDATE_GOLDEN=1 npx jest tests/partc-report-golden.test.js
 *
 * Volatile fields — the publication instant, the report id, the run id — are
 * normalised, because a golden that fails every run is a golden nobody reads.
 * Everything else, including every figure, is pinned exactly.
 */

'use strict';

process.env.STORAGE_BACKEND = 'memory';
process.env.UI_API_KEY = process.env.UI_API_KEY || 'ck_test_00000000000000000000000000000000';

const fs = require('fs');
const path = require('path');

const { runPartC } = require('../src/domains/pcaf-part-c/domain');
const { buildRegisters } = require('../src/domains/pcaf-part-c/application/partc-registers');
const standard = require('../src/domains/pcaf-part-c/reporting/partc-report-standard');
const { RECALCULATION_TRIGGERS } = require('../src/domains/pcaf-part-c/interface/schemas/partc-registry');
const fx = require('../data/partc/fisheries-reference');

const GOLDEN_DIR = path.join(__dirname, 'golden');
const UPDATE = process.env.UPDATE_GOLDEN === '1';

const SETTINGS = {
  currency: 'LKR', insurerName: 'Demo Insurance PLC', reportingYear: 2026,
  baseYear: 2025, significanceThresholdPct: 5, restatementThresholdPct: 5,
  recalculationTriggers: RECALCULATION_TRIGGERS, recalculationPolicy: ''
};

const META = {
  projectName: 'Fisheries Complex', insurer: 'Demo Insurance PLC',
  insured: 'Department of Fisheries', policyRef: 'CAR-2026-011',
  premium: 24448.16, projectCost: 6499442, gifa_m2: 1000,
  runId: 'golden-run', reportingYear: 2026
};

/* Anything that moves between two identical runs. Pinning these would make the
   golden fail on the clock rather than on the document. */
function normalise(text) {
  return text
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '<published>')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '<date>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/(Report reference\s+)\S+/g, '$1<reportId>');
}

/** One block, as the lines it contributes to the outline. */
function blockLines(blk, indent = '    ') {
  const L = [];
  switch (blk.kind) {
    case 'table':
      L.push(`${indent}table [${blk.head.length} cols] head: ${blk.head.join(' | ')}`);
      for (const row of blk.rows) L.push(`${indent}  row: ${row.map(c => String(c ?? '')).join(' | ')}`);
      if (blk.caption) L.push(`${indent}  caption: ${blk.caption}`);
      break;
    case 'bullets':
      for (const i of blk.items) L.push(`${indent}bullet: ${i}`);
      break;
    case 'figure':
      L.push(`${indent}figure: ${blk.label ?? ''} = ${blk.value ?? ''} ${blk.unit ?? ''}`.trimEnd());
      break;
    case 'callout':
      L.push(`${indent}callout${blk.title ? ` [${blk.title}]` : ''}: ${blk.text}`);
      break;
    case 'checklist':
      L.push(`${indent}checklist`);
      break;
    default:
      L.push(`${indent}${blk.kind}: ${blk.text ?? ''}`);
  }
  return L;
}

/** The whole document as an outline: every section, every block, every figure. */
function outline(model) {
  const L = [];
  L.push(`COVER: ${model.cover.title}`);
  L.push(`  subtitle: ${model.cover.subtitle ?? ''}`);
  L.push(`  insurer: ${model.cover.insurer}`);
  L.push(`  reporting year: ${model.cover.reportingYear}`);
  L.push(`  standard: ${model.cover.standard}`);
  L.push(`  prepared by: ${model.cover.preparedBy}`);
  L.push('');
  let n = 1;
  for (const sec of model.sections) {
    L.push(`SECTION ${++n} [${sec.id}] ${sec.title}`);
    for (const blk of sec.blocks) L.push(...blockLines(blk));
    L.push('');
  }
  for (const anx of model.annexes) {
    L.push(`ANNEX ${anx.annex} [${anx.id}] ${anx.title}`);
    for (const blk of anx.blocks) L.push(...blockLines(blk));
    L.push('');
  }
  L.push(`CHECKLIST: ${model.checklist.items.length} items, ` +
    `${model.checklist.items.filter(i => i.answer === 'Yes').length} answered Yes`);
  for (const item of model.checklist.items) L.push(`  ${item.id}: ${item.answer}`);
  return normalise(L.join('\n')) + '\n';
}

/** Compare against the committed golden, or write it when asked to. */
function golden(name, produced) {
  const file = path.join(GOLDEN_DIR, name);
  if (UPDATE || !fs.existsSync(file)) {
    fs.writeFileSync(file, produced);
    return produced;
  }
  return fs.readFileSync(file, 'utf8');
}

const facts = standard.assessmentFacts({
  result: runPartC(fx.workbookInput()),
  registers: buildRegisters(runPartC(fx.workbookInput())),
  settings: SETTINGS,
  meta: META
});
const model = standard.buildStandardModel(facts);

describe('The per-assessment report is what it was', () => {
  test('the whole document matches the committed golden', () => {
    const produced = outline(model);
    expect(produced).toBe(golden('partc-assessment-report.txt', produced));
  });

  test('the golden is a document, not an empty file', () => {
    /* The failure mode of a golden test is a golden of nothing, which passes
       forever. */
    const g = fs.readFileSync(path.join(GOLDEN_DIR, 'partc-assessment-report.txt'), 'utf8');
    expect(g.split('\n').length).toBeGreaterThan(150);
    expect(g).toMatch(/^SECTION 2 /m);
    expect(g).toMatch(/^ANNEX A /m);
    expect(g).toMatch(/^CHECKLIST: /m);
  });
});

describe('No table can be malformed', () => {
  const tables = [];
  const collect = blocks => { for (const b of blocks) if (b.kind === 'table') tables.push(b); };
  for (const s of model.sections) collect(s.blocks);
  for (const a of model.annexes) collect(a.blocks);

  test('there are tables to check', () => {
    expect(tables.length).toBeGreaterThan(4);
  });

  test('every row carries exactly as many cells as the head has columns', () => {
    /* The renderer lays a row out against the head. A row one cell short does
       not fail — it draws a column of the next row's data under the wrong
       heading, which reads as a real figure. */
    const bad = [];
    for (const t of tables) {
      t.rows.forEach((r, i) => {
        if (r.length !== t.head.length) bad.push(`${t.head.join('|')} row ${i}: ${r.length} of ${t.head.length}`);
      });
    }
    expect(bad).toEqual([]);
  });

  test('a declared column-width set matches the column count', () => {
    /* pdf-writer.js ignores a `widths` array whose length differs from the
       head's, and falls back to equal columns — so the layout silently stops
       being the one that was designed. */
    const bad = tables
      .filter(t => t.widths && t.widths.length !== t.head.length)
      .map(t => `${t.head.join('|')}: ${t.widths.length} widths for ${t.head.length} columns`);
    expect(bad).toEqual([]);
  });

  test('no cell is undefined', () => {
    const bad = [];
    for (const t of tables) {
      t.rows.forEach((r, i) => r.forEach((c, j) => {
        if (c === undefined || c === null) bad.push(`${t.head.join('|')} r${i}c${j}`);
      }));
    }
    expect(bad).toEqual([]);
  });
});

describe('The PDF draws the whole model', () => {
  /* Recording the draw calls is the only way to see, from CI, that a figure
     reached the page. The alternative — that the bytes are a well-formed PDF —
     is equally true of a PDF with a section missing. */
  const theme = require('../src/domains/pcaf-part-c/reporting/partc-theme');

  let drawn = [];
  let pages = 0;

  beforeAll(() => {
    const real = theme.pcafDocument;
    const spy = jest.spyOn(theme, 'pcafDocument').mockImplementation(() => {
      const doc = real();
      const write = doc.text.bind(doc);
      doc.text = (t, ...rest) => {
        if (typeof t === 'string') drawn.push({ text: t, x: doc.x, y: doc.y, page: doc.bufferedPageRange().count });
        return write(t, ...rest);
      };
      return doc;
    });
    standard.renderStandardPDF(model);
    spy.mockRestore();
    /* Read the page count off the draw records rather than the finished
       document: `finalise()` ends the stream, and a buffered page range on an
       ended document is empty. */
    pages = drawn.reduce((max, d) => Math.max(max, d.page), 0);
  });

  test('it draws far more than a cover', () => {
    expect(drawn.length).toBeGreaterThan(200);
    expect(pages).toBeGreaterThan(4);
  });

  test('every section title reaches the page', () => {
    const text = drawn.map(d => d.text).join('\n');
    const missing = model.sections.filter(s => !text.includes(s.title)).map(s => s.title);
    expect(missing).toEqual([]);
  });

  test('every annex title reaches the page', () => {
    const text = drawn.map(d => d.text).join('\n');
    const missing = model.annexes.filter(a => !text.includes(a.title)).map(a => a.title);
    expect(missing).toEqual([]);
  });

  test('nothing is drawn off the right edge of the paper', () => {
    /* A cell that starts beyond the page is a figure the reader never sees,
       and the file is still a valid PDF. */
    const { PAGE } = require('../src/domains/pcaf-part-c/reporting/theme/pdf-writer');
    const width = 595.28;                       // A4 portrait, points
    const off = drawn.filter(d => d.x > width - PAGE.margin / 2 || d.x < 0);
    expect(off.map(d => `${d.text.slice(0, 40)} @ x=${Math.round(d.x)}`)).toEqual([]);
  });

  test('the page count matches the committed golden', () => {
    /* A dropped section, a table that stopped wrapping, an annex that no
       longer renders: each moves this. */
    const produced = `${pages}\n`;
    expect(produced).toBe(golden('partc-assessment-report.pages.txt', produced));
  });
});

/* --------------------------------------------------------------------------
   The annual disclosure — the document actually published for a reporting
   year, built from locked assessments. It shares the content model with the
   per-assessment report, so a requirement can only go missing from one of
   them if the model itself changes; this pins what the model produces on a
   fixed book.
   -------------------------------------------------------------------------- */

describe('The annual disclosure is what it was', () => {
  const D = require('../src/domains/pcaf-part-c/application/partc-disclosure');
  const A = require('../src/domains/pcaf-part-c/application/partc-assessments');
  const registry = require('../src/domains/pcaf-part-c/application/partc-registry');
  const boq = require('../src/domains/pcaf-part-c/application/partc-boq');
  const store = require('../src/platform/database/store');
  const { seedDemoBook } = require('../src/domains/pcaf-part-c/application/partc-demo-data');

  const ORG = 'golden-org';
  const withDist = mats => mats.map(m => ({ ...m, distance: fx.DISTANCES[m.id] || {} }));

  let annualModel;

  beforeAll(async () => {
    await store._resetMemory();
    const book = await seedDemoBook(registry, ORG, boq);
    const pj = book.projects.find(p => /Negombo/.test(p.name));
    const pol = pj.policies.find(x => x.reportingYear === 2026);
    const rev = await boq.createRevision(ORG, pj.projectId, {
      note: 'Tender', materials: withDist(fx.MATERIALS), demolitionItems: fx.DEMOLITION_ITEMS });
    const { assessment } = await A.createAssessment(ORG, {
      projectId: pj.projectId, policyId: pol.policyId, boqRevisionId: rev.revisionId,
      siteInputs: { demolitionKm: 100, wasteDisposalKm: 40, previousProject: fx.PREVIOUS_PROJECT }
    });
    await A.changeStatus(ORG, assessment.assessmentId, 'under_review');
    await A.changeStatus(ORG, assessment.assessmentId, 'locked', { actor: 'Ceylon Insurance PLC' });

    const d = await D.buildAnnualDisclosure(ORG, 2026);
    const { roll, settings, factorRows, equations } = d._source;
    annualModel = standard.buildStandardModel(
      standard.annualFacts({ disclosure: d, roll, settings, factorRows, equations }));
  });

  test('the whole disclosure matches the committed golden', () => {
    const produced = outline(annualModel);
    expect(produced).toBe(golden('partc-annual-disclosure.txt', produced));
  });

  test('coverage is in a numbered section rather than an annex', () => {
    /* A total drawn from a fifth of a book means something different from one
       drawn from all of it, so the share cannot be filed at the back. */
    const ids = annualModel.sections.map(s => s.id);
    expect(ids).toContain('coverage');
    expect(annualModel.annexes.map(a => a.id)).not.toContain('coverage');
  });

  test('every table in it is well formed too', () => {
    const bad = [];
    const check = blocks => {
      for (const b of blocks) {
        if (b.kind !== 'table') continue;
        b.rows.forEach((r, i) => { if (r.length !== b.head.length) bad.push(`${b.head.join('|')} row ${i}`); });
        if (b.widths && b.widths.length !== b.head.length) bad.push(`${b.head.join('|')} widths`);
      }
    };
    annualModel.sections.forEach(s => check(s.blocks));
    annualModel.annexes.forEach(a => check(a.blocks));
    expect(bad).toEqual([]);
  });
});
