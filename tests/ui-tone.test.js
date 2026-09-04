/**
 * The register the screens are written in.
 *
 * Every figure on these screens is read by a bank. Copy that explains the
 * application's own design decisions — why a figure is shown, what would have
 * happened otherwise, what a reader might have thought — belongs in the source
 * comments, where it is. On screen it reads as software talking about itself,
 * and it invites the one question a demonstration cannot afford: "what is this
 * sentence for?"
 *
 * So the rule is: **state what the figure is, cite the standard that governs
 * it, and stop.** This suite sweeps the rendered strings — page fragments, the
 * page modules, and the note fields the API returns for display — for the
 * shapes that break it.
 *
 * Code comments are deliberately excluded. The reasoning is worth keeping; it
 * is simply not user-facing copy.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** Strip block and line comments, so only what can reach a screen is scanned. */
function rendered(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

const FILES = [];
for (const dir of ['ui/pages', 'ui/js']) {
  for (const f of fs.readdirSync(path.join(ROOT, dir))) {
    FILES.push([`${dir}/${f}`, rendered(fs.readFileSync(path.join(ROOT, dir, f), 'utf8'))]);
  }
}
/** The API note fields render verbatim, so they are held to the same register. */
for (const f of ['services/desk/position.js', 'services/desk/candidates.js',
  'services/desk/readiness.js', 'services/capital-metrics.js', 'services/capital-basket.js',
  'services/capital-forecast.js', 'services/gcf/screening.js', 'services/gcf/instruments.js',
  'routes/v1/capital.js']) {
  FILES.push([f, rendered(fs.readFileSync(path.join(ROOT, f), 'utf8'))]);
}

const scan = (pattern) => FILES
  .filter(([, body]) => pattern.test(body))
  .map(([name]) => name);

describe('Screens state facts, not design rationale', () => {
  const BANNED = [
    [/rather than an? (empty|blank) screen/i, 'explains why a screen is not blank'],
    [/never mixed|is the failure|exists to prevent|this codebase/i, 'describes the application to itself'],
    [/a reader would|whoever reads|somebody|anybody|nobody/i, 'speculates about the reader'],
    [/which is a fact about|the whole reason|would otherwise read/i, 'argues with an imagined objection'],
    [/is a question, not a|is not a commitment|nothing is written down\b/i, 'philosophises about an action'],
    [/lives in one person/i, 'anecdote'],
  ];

  test.each(BANNED)('no rendered string %s', (pattern, why) => {
    const found = scan(pattern);
    /* The reason travels in the assertion so a failure names what to fix
       rather than only where. Jest's expect takes one argument, so it goes in
       the compared value. */
    expect({ why, found }).toEqual({ why, found: [] });
  });
});

describe('Screens do not leak the implementation', () => {
  test('no field name appears in backticks in user-facing copy', () => {
    /* `dfccShare` and `completed` both reached a screen this way. A reader who
       has to know a JSON key to read a sentence is reading a debug view. */
    const found = FILES.filter(([name, body]) => {
      if (name.endsWith('.js') && !name.startsWith('ui/')) return false;
      // Backticked identifiers inside prose, not template literals.
      return /[a-z] `[a-zA-Z][a-zA-Z0-9_]{2,}` [a-z]/.test(body);
    }).map(([n]) => n);
    expect(found).toEqual([]);
  });

  test('the illustrative-data label is short and is not styled as a fault', () => {
    const desk = fs.readFileSync(path.join(ROOT, 'services/desk/position.js'), 'utf8');
    expect(desk).toMatch(/sampleNote: 'Illustrative dataset — not client records\.'/);
    const capital = fs.readFileSync(path.join(ROOT, 'routes/v1/capital.js'), 'utf8');
    expect(capital).toMatch(/BASELINE_NOTE = 'Illustrative dataset — not client records\.'/);

    /* A pill in the neutral palette. Amber is reserved for something a reader
       has to act on; illustrative figures are the screen working normally. */
    const html = fs.readFileSync(path.join(ROOT, 'ui/pages/desk.html'), 'utf8');
    expect(html).toMatch(/\.dk-banner\s*\{[\s\S]*?border-radius:\s*999px/);
    expect(html).toMatch(/\.dk-banner\s*\{[\s\S]*?--dk-neutral-soft/);
  });

  test('no screen shouts in block capitals', () => {
    const found = FILES.filter(([name, body]) =>
      name.startsWith('ui/') && /['"`>][A-Z]{4,}\s+[A-Z]{4,}/.test(body)
        && !/SLFRS|PCAF|GCF|NDC|SLGFT|CBSL|IFRS|TCFD|GRI|BOQ|USD|API|HELD|EXTERNAL|PARTIAL/.test(
          (body.match(/['"`>][A-Z]{4,}\s+[A-Z]{4,}/) || [''])[0]))
      .map(([n]) => n);
    expect(found).toEqual([]);
  });
});

describe('The vendor is not the product', () => {
  test('no model or vendor name appears in user-facing copy', () => {
    /* A bank buys the capability, not the supplier's supplier. The model in
       use is an implementation detail and naming it on screen reads as a
       disclosure the reader did not ask for. */
    const found = FILES
      .filter(([name]) => name.startsWith('ui/'))
      .filter(([, body]) => /Claude|claude-[a-z0-9-]+|Anthropic|GPT-|OpenAI/.test(body))
      .map(([n]) => n);
    expect(found).toEqual([]);
  });
});

describe('Standard citations survive the trim', () => {
  test('the statements a reviewer actually needs are still there', () => {
    /* Terse is not the same as silent. Where a figure rests on a published
       rule, the rule is still named. */
    const desk = fs.readFileSync(path.join(ROOT, 'ui/pages/desk.html'), 'utf8');
    const deskJs = fs.readFileSync(path.join(ROOT, 'ui/js/desk.js'), 'utf8');
    expect(desk).toMatch(/PCAF Part A, p\.126/);
    expect(desk).toMatch(/B\.36\/10/);
    expect(deskJs).toMatch(/PCAF scale 1–5, 1 is best/);
    const metrics = fs.readFileSync(path.join(ROOT, 'services/capital-metrics.js'), 'utf8');
    expect(metrics).toMatch(/PCAF Part A p\.128/);
    expect(metrics).toMatch(/PCAF Part A, p\.126/);
  });
});

describe('Narrow viewports', () => {
  const CSS = fs.readFileSync(path.join(ROOT, 'ui/css/responsive.css'), 'utf8');
  const INDEX = fs.readFileSync(path.join(ROOT, 'ui/index.html'), 'utf8');

  test('the corrections are loaded, and loaded last', () => {
    /* Last, so they win without raising the specificity of the rules they
       correct — which would make the next correction harder again. */
    expect(INDEX).toContain('css/responsive.css');
    const sheets = [...INDEX.matchAll(/href="(css\/[a-z-]+\.css)"/g)].map(m => m[1]);
    expect(sheets[sheets.length - 1]).toBe('css/responsive.css');
  });

  test('the auto-fit rule is written down where the next grid will be added', () => {
    /* `repeat(auto-fit, minmax(330px, 1fr))` is 330px wide whatever the
       container is, so on a phone the track sets the page width — the cause
       of the widest overflow measured, 297px at 430px. The pages that carried
       those grids have since been removed, so there is no live rule left to
       pin; what has to survive is the instruction, in the file whoever writes
       the next grid will open. */
    expect(CSS).toMatch(/minmax\(min\(100%, 330px\), 1fr\)/);
    expect(CSS).toMatch(/a bare pixel minimum is a\s*\n?\s*page-width bug/);
  });

  test('grid and flex children are allowed to shrink', () => {
    /* A grid or flex item's min-width is `auto`, which refuses to shrink it
       below its content. Every remaining overflow measured was this shape. */
    expect(CSS).toMatch(/\.extract-left-col[\s\S]{0,400}min-width: 0;/);
    expect(CSS).toMatch(/\.card \{ min-width: 0; \}/);
  });

  test('action rows wrap rather than setting the page width', () => {
    expect(CSS).toMatch(/\.form-actions,[\s\S]{0,200}flex-wrap: wrap;/);
  });

  test('every wide table has a scrolling container', () => {
    /* The page must never scroll sideways; the table may. */
    expect(INDEX).toMatch(/<div class="table-scroll">\s*<table class="data-table" id="pf-top-table">/);
  });
});
