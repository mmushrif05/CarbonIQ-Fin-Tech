// @ts-check
/**
 * A private name that crosses a module boundary.
 *
 * An underscore prefix says "this is not part of what this module offers".
 * When another file imports one, one of two things is true: the seam is in the
 * wrong place, or the name should be public. Neither is fixed by leaving it.
 *
 * Thirty-four such imports existed across seventeen sites, most of them left
 * by the barrel splits — a file over 500 lines cut into siblings, with the
 * pieces still reaching into one another's privates through the barrel. That
 * is mostly harmless: a barrel and its parts are one module wearing several
 * files, and `reports.js` importing `_pcafReport` from `reports/standards` is
 * the same module talking to itself.
 *
 * One was not harmless. `gcf/application/cn-package.js` imported `_p`, `_h`
 * and `_table` from `pcaf-part-c/reporting/partc-docgen` — private Word
 * builders, across the boundary between two of the three scopes that must
 * never merge. They know nothing about emissions; they are `docx` primitives,
 * and they are `src/platform/reporting/docx.js` now.
 *
 * So this holds the remaining ones to a list. The list is allowed to shrink
 * and nothing else; a new entry has to be argued for in review rather than
 * appear in a diff nobody reads.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

const rel = f => path.relative(ROOT, f).split(path.sep).join('/');

/** Every `const { _x } = require('…')` in the tree, as `file <- target : name`. */
function privateImports() {
  const found = [];
  for (const file of walk(path.join(ROOT, 'src'))) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/const\s*\{([^}]*)\}\s*=\s*require\('(\.\.?[^']*)'\)/g)) {
      const names = m[1].split(',')
        .map(x => x.trim().split(':')[0].trim())
        .filter(n => n.startsWith('_'));
      for (const name of names) found.push(`${rel(file)} <- ${m[2]} : ${name}`);
    }
  }
  return found.sort();
}

/**
 * The ones that are allowed, and why each is.
 *
 * Every entry here is a barrel talking to its own parts — one module split
 * across several files because 500 lines is the ceiling. None crosses a
 * domain, and none reaches into another bounded context.
 */
const ALLOWED = [
  // capital: the metrics roll-up and the pipeline view are one module.
  'src/domains/capital/domain/capital-metrics.js <- ./capital-pipeline : _normalise',

  // lending reports: one barrel, five parts.
  'src/domains/lending/application/reports.js <- ./reports/common : _withGaps',
  'src/domains/lending/application/reports.js <- ./reports/demo : _demoPortfolio',
  'src/domains/lending/application/reports.js <- ./reports/slgft : _slgftCbslReport',
  'src/domains/lending/application/reports.js <- ./reports/slgft : _slgftReport',
  'src/domains/lending/application/reports.js <- ./reports/standards : _gri305Report',
  'src/domains/lending/application/reports.js <- ./reports/standards : _ifrsS2Report',
  'src/domains/lending/application/reports.js <- ./reports/standards : _pcafReport',
  'src/domains/lending/application/reports.js <- ./reports/standards : _tcfdReport',
  'src/domains/lending/application/reports/pdf.js <- ./demo : _humaniseKey',
  'src/domains/lending/application/reports/slgft.js <- ./standards : _entityScope',

  // lending decision engine: the tiers are its own second file.
  'src/domains/lending/domain/decision-engine.js <- ./decision-tiers : _common',
  'src/domains/lending/domain/decision-engine.js <- ./decision-tiers : _tier1',
  'src/domains/lending/domain/decision-engine.js <- ./decision-tiers : _tier3',

  // Part C methodology: one barrel, three parts.
  'src/domains/pcaf-part-c/application/methodology/demonstrations.js <- ./common : _round',
  'src/domains/pcaf-part-c/application/partc-methodology.js <- ./methodology/common : _moduleRank',
  'src/domains/pcaf-part-c/application/partc-methodology.js <- ./methodology/common : _round',
  'src/domains/pcaf-part-c/application/partc-methodology.js <- ./methodology/demonstrations : _gateDemonstration',
  'src/domains/pcaf-part-c/application/partc-methodology.js <- ./methodology/demonstrations : _referenceRun',
  'src/domains/pcaf-part-c/application/partc-methodology.js <- ./methodology/demonstrations : _scenarios',
  'src/domains/pcaf-part-c/application/partc-methodology.js <- ./methodology/factors : _harvestFactorRows',
  'src/domains/pcaf-part-c/application/partc-methodology.js <- ./methodology/factors : _openItems',

  // Part C routes: one barrel, four parts, one shared piece.
  'src/domains/pcaf-part-c/interface/routes/pcaf-partc.js <- ./pcaf-partc/shared : _publicRegisters',
  'src/domains/pcaf-part-c/interface/routes/pcaf-partc.js <- ./pcaf-partc/shared : _shapeResult',
  'src/domains/pcaf-part-c/interface/routes/pcaf-partc.js <- ./pcaf-partc/shared : _toEngineInput',
  'src/domains/pcaf-part-c/interface/routes/pcaf-partc/runs.js <- ./shared : _publicRegisters',
  'src/domains/pcaf-part-c/interface/routes/pcaf-partc/runs.js <- ./shared : _shapeResult',

  // Part C reporting: the docgen re-export, and the model reading its own facts.
  'src/domains/pcaf-part-c/reporting/report-standard/model.js <- ./facts : _scanLanguage',
].sort();

describe('A private name does not cross a boundary it was not meant to', () => {
  test('none of them crosses a domain', () => {
    /* The rule that actually matters. Two domains' `application/` layers may
       legitimately talk, but not through each other's privates — and never
       between Part A, Part C and GCF. */
    const crossing = privateImports().filter(entry => {
      const [from, rest] = entry.split(' <- ');
      const target = rest.split(' : ')[0];
      const fromDomain = (from.match(/^src\/domains\/([^/]+)\//) || [])[1];
      if (!fromDomain) return false;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(from), target));
      const toDomain = (resolved.match(/^src\/domains\/([^/]+)\//) || [])[1];
      return toDomain && toDomain !== fromDomain;
    });
    expect(crossing).toEqual([]);
  });

  test('the ones that remain are the ones on the list, and no others', () => {
    /* The list may shrink. A new entry is a review conversation, not a diff
       nobody reads. */
    expect(privateImports()).toEqual(ALLOWED);
  });

  test('the Word primitives are platform, and Part C still re-exports them', () => {
    const docx = require('../src/platform/reporting/docx');
    expect(Object.keys(docx).sort()).toEqual(['HeadingLevel', 'cell', 'heading', 'para', 'table']);

    /* Removing the cross-domain edge must not remove the capability: every
       caller that has always read them from Part C still can. */
    const partc = require('../src/domains/pcaf-part-c/reporting/partc-docgen');
    expect(typeof partc._p).toBe('function');
    expect(typeof partc._h).toBe('function');
    expect(typeof partc._table).toBe('function');
  });

  test('the GCF package no longer reaches into Part C for them', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/domains/gcf/application/cn-package.js'), 'utf8');
    expect(src).toMatch(/platform\/reporting\/docx/);
    expect(src).not.toMatch(/_p,\s*_h,\s*_table\s*\}\s*=\s*require\('\.\.\/\.\.\/pcaf-part-c/);
  });
});
