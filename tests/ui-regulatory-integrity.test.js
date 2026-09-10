// @ts-check
/**
 * The browser is swept too.
 *
 * Two regulatory defects lived in `ui/` for months because every sweep this
 * repository has stopped at `src/`.
 *
 * `ui/js/agents.js` held five complete memos — a credit recommendation, a
 * carbon intensity, a benchmark percentile, a covenant package and a pricing
 * ratchet of −18 bps — all invented, shown whenever the API did not answer.
 * They carried a `[DEMO MODE]` prefix, which is exactly as much protection as
 * a watermark on a page somebody photographs one row of. That is the failure
 * `src/shared/report-integrity.js` and its whole suite exist to prevent,
 * surviving one directory away.
 *
 * `ui/js/ndc-sdg.js` held an SLGFT activity table carrying all three errors
 * the source document disproves. Its sibling `ui/js/taxonomy.js` was
 * corrected; this one was not, and nothing noticed.
 *
 * Both are fixed. This is the sweep that means they cannot come back, and that
 * a third file cannot acquire the same shape.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const UI = path.join(ROOT, 'ui');
const SELF = path.join(__dirname, 'ui-regulatory-integrity.test.js');

/** Every script and page fragment the browser actually loads. */
function browserFiles(dir = UI, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'brand') continue;      // artwork, not code
      browserFiles(full, found);
    } else if (/\.(js|html)$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

const rel = f => path.relative(ROOT, f).split(path.sep).join('/');

/** Source with comments stripped: a rule explained is not a rule broken. */
function code(file) {
  return fs.readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

const FILES = browserFiles().filter(f => f !== SELF);

describe('No screen invents a figure when the API does not answer', () => {
  test('there are browser files to sweep', () => {
    expect(FILES.length).toBeGreaterThan(20);
  });

  test('nothing carries a stored answer to show in place of a real one', () => {
    /* The prefix is not the problem and removing it would not be the fix — the
       stored memo is. A reader who copies one row out of a document does not
       carry the banner with it. */
    const patterns = [
      [/DEMO[\s_-]?MODE/i, 'a stored answer shown in place of a real one'],
      [/DEMO_RESPONSES|FALLBACK_RESULT|SAMPLE_MEMO|MOCK_(RESULT|RESPONSE|MEMO)/, 'a stored result table'],
      [/Backend unavailable\. Showing/i, 'representative output shown for a failed call'],
    ];
    const hits = [];
    for (const file of FILES) {
      const src = code(file);
      for (const [re, why] of patterns) if (re.test(src)) hits.push(`${rel(file)}: ${why}`);
    }
    expect(hits).toEqual([]);
  });

  test('no screen states a credit or pricing outcome it did not receive', () => {
    /* The shapes the fabricated memos took. A figure a screen computed for
       itself and a figure it was given look identical to a reader, so what is
       swept for is the literal in the source: a pricing ratchet, a verdict, a
       named percentile. */
    const patterns = [
      [/[−-]\s?\d+\s?bps/i, 'a pricing adjustment written into the page'],
      /* The memo's heading form. Copy that *describes* what an agent produces
         — "drafts an Underwriting Memo with a credit recommendation" — is
         accurate and stays. What must not exist is a verdict on the page. */
      [/#+\s*Credit Recommendation\s*:/i, 'a credit recommendation stated on the page'],
      [/\bP(25|50|75)\b\s*\|/, 'a benchmark percentile table written into the page'],
      [/Probability of covenant breach/i, 'a covenant breach probability written into the page'],
    ];
    const hits = [];
    for (const file of FILES) {
      const src = code(file);
      for (const [re, why] of patterns) if (re.test(src)) hits.push(`${rel(file)}: ${why}`);
    }
    expect(hits).toEqual([]);
  });

  test('a failed agent call says so, and shows nothing', () => {
    const src = fs.readFileSync(path.join(UI, 'js/agents.js'), 'utf8');
    expect(src).toMatch(/showOutput\('error'\)/);
    expect(src).toMatch(/The API did not respond/);
  });
});

describe('No screen holds its own copy of the taxonomy', () => {
  /* The three errors the source document disproves, and which the browser
     copy carried after the server was corrected. Each is a real code paired
     with the wrong meaning, which is why the pairing is what is swept for
     rather than the code alone. */
  const SUPERSEDED = [
    [/'M1\.1'\s*:/, 'M1.1 as a construction activity — construction is macro-sector 6'],
    [/M1\.1[^\n]{0,80}(New Construction|600)/i, 'M1.1 for new construction at an absolute threshold'],
    [/M6\.1[^\n]{0,60}(Clean Transport|Transportation)/i, 'M6.1 as transport — M6.1 is renovation, electric rail is M6.7'],
    [/A2\.1[^\n]{0,60}Flood/i, 'A2.1 as flood-resilient construction — A2.1 is climate insurance'],
    [/(≤|<=)\s?600\s?kgCO2e/i, 'an absolute 600 kgCO2e/m2 taxonomy threshold'],
  ];

  test('no browser file states a superseded activity code', () => {
    const hits = [];
    for (const file of FILES) {
      const src = code(file);
      for (const [re, why] of SUPERSEDED) if (re.test(src)) hits.push(`${rel(file)}: ${why}`);
    }
    expect(hits).toEqual([]);
  });

  test('the taxonomy comes from the API, and is loaded before it is read', () => {
    const src = fs.readFileSync(path.join(UI, 'js/ndc-sdg.js'), 'utf8');
    expect(src).toMatch(/CARBONIQ_fetch\('\/v1\/ndc-sdg\/framework'\)/);
    /* Loaded in `init`, not on the first lookup: anything that changes what a
       screen shows has to be in place before the screen is asked. This
       codebase has shipped the other order four times. */
    const initAt = src.indexOf('function init(');
    const loadAt = src.indexOf('loadActivities()', initAt);
    expect(loadAt).toBeGreaterThan(initAt);
    expect(loadAt).toBeLessThan(src.indexOf('function onActivityInput'));
  });

  test('an unloaded taxonomy describes nothing rather than guessing', () => {
    const src = fs.readFileSync(path.join(UI, 'js/ndc-sdg.js'), 'utf8');
    expect(src).toMatch(/if \(!_activities\)/);
    expect(src).toMatch(/has not loaded, so this code is not described/);
  });

  test('the codes the server screens against are the ones a reader is offered', () => {
    /* The real table, so this test fails if the engine's own codes change and
       the browser is not re-checked against them. */
    const { TAXONOMY_LK } = require('../src/shared/constants');
    const codes = TAXONOMY_LK.constructionActivities
      .map((/** @type {any} */ a) => a.code).filter(Boolean);
    expect(codes).toContain('M6.3');   // construction of new buildings
    expect(codes).toContain('M6.1');   // renovation
    expect(codes).toContain('M6.7');   // electric rail
    expect(codes).toContain('A3.1');   // climate-resilient storage
    expect(codes).not.toContain('M1.1');
    expect(codes).not.toContain('A2.1');
  });
});

describe('The engine does every arithmetic operation, including against the browser', () => {
  /* `ui/js/extract.js` held its own copy of the ICE factor table and computed
     `quantity x factor` in the page, handing back rows stamped `ICE v3`. That
     is not an invented figure — it is a **parallel engine**, which is worse,
     because the rows look measured and nothing on them says which side of the
     wire produced them. A parse of a pasted bill of quantities is a parse and
     stays; a factor is a measurement and belongs to the engine. */
  const FACTOR_TABLE = [
    [/ICE[_\s]?FACTORS|EMISSION_FACTORS|CARBON_FACTORS/, 'an emission factor table in the browser'],
    [/kgCO2e\s*\/\s*kg material/i, 'a per-kilogram emission factor declared in the browser'],
  ];

  test('no screen holds an emission factor table', () => {
    const hits = [];
    for (const file of FILES) {
      const src = code(file);
      for (const [re, why] of FACTOR_TABLE) if (re.test(src)) hits.push(`${rel(file)}: ${why}`);
    }
    expect(hits).toEqual([]);
  });

  test('a locally parsed bill of quantities carries no emission figure', () => {
    const src = fs.readFileSync(path.join(UI, 'js/extract.js'), 'utf8');
    expect(src).toMatch(/_parseLinesLocally/);
    /* Absent, not zero: null says the engine has not measured this line; zero
       would say the material has no impact. */
    expect(src).toMatch(/emissionFactor:\s*null/);
    expect(src).toMatch(/totalKgCO2e:\s*null/);
    expect(src).toMatch(/carbonTotals: null/);
    expect(src).not.toMatch(/qtyKg \* factor/);
  });

  test('densities stay, because a unit conversion is not a measurement', () => {
    const src = fs.readFileSync(path.join(UI, 'js/extract.js'), 'utf8');
    expect(src).toMatch(/DENSITIES/);
    expect(src).toMatch(/Converted from \$\{rawQty\} \$\{rawUnit\} using standard density/);
  });
});

describe('No screen restates a threshold the engine owns', () => {
  test('the pricing tiers and their score boundaries come from the API', () => {
    const src = fs.readFileSync(path.join(UI, 'pages/carbon-pricing.html'), 'utf8');
    expect(src).toMatch(/CARBONIQ_fetch\('\/v1\/carbon-pricing\/rates'\)/);
    expect(src).toMatch(/if \(!_tiers\)/);
    /* The boundaries and the pricing were written into the hint prose beside
       an engine that owns all three. */
    expect(code(path.join(UI, 'pages/carbon-pricing.html')))
      .not.toMatch(/score >= 70|score >= 40|−20 bps|-20 bps/);
  });

  test('the engine declares each tier boundary once', () => {
    const { PRICING_TIERS } = require('../src/domains/taxonomy/domain/carbon-pricing');
    for (const tier of Object.values(PRICING_TIERS)) {
      expect(typeof (/** @type {any} */ (tier).minScore)).toBe('number');
    }
    const src = fs.readFileSync(
      path.join(ROOT, 'src/domains/taxonomy/domain/carbon-pricing.js'), 'utf8');
    /* The classifier reads the same constants the tiers are built from, so a
       changed boundary cannot leave the descriptions saying something else. */
    expect(src).toMatch(/score >= TIER_MIN_SCORE\.green/);
    expect(src).toMatch(/score >= TIER_MIN_SCORE\.transition/);
    expect(src).not.toMatch(/score >= 70|score >= 40/);
  });

  test('the intensity screen on the new-project form is the governed one', () => {
    const src = fs.readFileSync(path.join(UI, 'js/new-project.js'), 'utf8');
    expect(src).toMatch(/CARBONIQ_fetch\('\/v1\/ndc-sdg\/framework'\)/);
    expect(src).toMatch(/bands\.green/);
    expect(src).toMatch(/bands\.transition/);
    /* It screened on 600/900 while the endpoint beside it screened on
       520/780 — two answers to one question about what a bank may call a
       green loan, on the form a relationship manager fills in with a client. */
    expect(code(path.join(UI, 'js/new-project.js'))).not.toMatch(/<= ?600|<= ?900/);
  });
});
