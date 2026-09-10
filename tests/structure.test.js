/**
 * E5 — structure.
 *
 * The rules the phase leaves behind, each held by a test so it cannot
 * lapse by convention: no source file over five hundred lines; the
 * Content Security Policy one string in two places; the frontend build
 * producing what the CDN publishes; the type check covering every
 * platform file and never regressing; the staging context, the deploy
 * gate and Dependabot present; the AI layer never touching a request.
 *
 * The exit criterion of the phase — an import from one domain into
 * another's internals fails the build — is the last describe: a violating
 * file is written, the checker is shown to catch it, and it is removed.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { source, must, mustNot } = require('./helpers/ui-source');

const ROOT = path.resolve(__dirname, '..');
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (p.endsWith('.js')) out.push(p);
  }
  return out;
};
const rel = f => path.relative(ROOT, f).split(path.sep).join('/');

describe('No source file over five hundred lines (E3)', () => {
  test('every file under src/ is at most 500 lines, and the nine that were over are split behind barrels', () => {
    const over = walk(path.join(ROOT, 'src'))
      .map(f => ({ f: rel(f), n: fs.readFileSync(f, 'utf8').split('\n').length }))
      .filter(x => x.n > 500);
    expect(over).toEqual([]);
    for (const barrel of [
      'src/domains/pcaf-part-c/reporting/partc-report-standard.js', 'src/domains/pcaf-part-c/reporting/partc-theme.js',
      'src/domains/lending/application/reports.js', 'src/domains/lending/interface/routes/agent.js',
      'src/domains/pcaf-part-c/interface/routes/pcaf-partc.js', 'src/domains/lending/interface/schemas/agent.js',
      'src/domains/pcaf-part-c/application/partc-methodology.js', 'src/domains/capital/domain/capital-metrics.js',
      'src/domains/lending/domain/decision-engine.js',
    ]) {
      expect(fs.existsSync(path.join(ROOT, barrel))).toBe(true);
      expect(Object.keys(require(path.join(ROOT, barrel))).length).toBeGreaterThan(0);
    }
  });

  test('the barrels keep their public surface', () => {
    const std = require('../src/domains/pcaf-part-c/reporting/partc-report-standard');
    expect(Object.keys(std).sort()).toEqual(['FINANCED_EMISSIONS_STATEMENT', 'KYOTO_GASES', 'UNITS_STATEMENT', 'annualFacts', 'assessmentFacts', 'buildAnnexes', 'buildSections', 'buildStandardModel', 'renderStandardDOCX', 'renderStandardPDF']);
    const theme = require('../src/domains/pcaf-part-c/reporting/partc-theme');
    for (const k of ['PALETTE', 'blend', 'glyphSafe', 'registerFonts', 'pcafWriter', 'pcafDocument', 'wordStyles', 'wTable']) expect(typeof theme[k]).not.toBe('undefined');
    const reports = require('../src/domains/lending/application/reports');
    expect(Object.keys(reports).sort()).toEqual(['buildPDF', 'generateReport']);
    const metrics = require('../src/domains/capital/domain/capital-metrics');
    expect(Object.keys(metrics).sort()).toEqual(['ATTRIBUTION_BASES', '_normalise', 'anchorPosition', 'capitalPosition', 'dashboard', 'emissionsLedger', 'pipeline', 'portfolioRows']);
    const decision = require('../src/domains/lending/domain/decision-engine');
    expect(Object.keys(decision).sort()).toEqual(['AUTO_APPROVE_LOAN_LIMIT', 'DECISION_TIERS', 'DECISION_VERDICTS', 'MANUAL_REVIEW_LOAN_LIMIT', 'TIER_DISTRIBUTION', 'classifyApplication', 'classifyDecisionTier']);
    const schemas = require('../src/domains/lending/interface/schemas/agent');
    expect(Object.keys(schemas).length).toBe(9);
  });
});

describe('One Content Security Policy, in two places (H4)', () => {
  const csp = require('../src/platform/http/csp');

  test('netlify.toml carries the same string helmet sends', () => {
    const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
    const m = /Content-Security-Policy = "([^"]+)"/.exec(toml);
    expect(m).toBeTruthy();
    expect(m[1]).toBe(csp.policy());
  });

  test('it closes framing, plugins, base and foreign scripts, and says what it leaves open', () => {
    const p = csp.policy();
    expect(p).toContain("frame-ancestors 'none'");
    expect(p).toContain("object-src 'none'");
    expect(p).toContain("base-uri 'self'");
    expect(p).toMatch(/script-src 'self'/);
    expect(p).not.toMatch(/script-src[^;]*https?:/);
    const src = fs.readFileSync(path.join(ROOT, 'src/platform/http/csp.js'), 'utf8');
    expect(src).toMatch(/inline scripts/);
  });

  test('the API answers with it', async () => {
    process.env.STORAGE_BACKEND = 'memory';
    const request = require('supertest');
    const app = require('../src/server');
    const res = await request(app).get('/health').expect(200);
    expect(res.headers['content-security-policy']).toBe(csp.policy());
    expect(res.headers['x-frame-options']).toBeDefined();
  });
});

describe('The frontend build (H1) and the browser tests (H3)', () => {
  test('the build produces the publish directory: every source file, scripts and styles minified, a manifest', () => {
    const out = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ui-build-'));
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/build-ui.js')], { env: { ...process.env, UI_BUILD_DIR: out }, stdio: 'pipe' });
    const manifest = JSON.parse(fs.readFileSync(path.join(out, 'build-manifest.json'), 'utf8'));
    const sources = walk(path.join(ROOT, 'ui')).map(f => path.relative(path.join(ROOT, 'ui'), f));
    for (const s of sources) expect(manifest.files[s]).toBeDefined();
    /* A vendored library arrives minified and is copied as it is. */
    const js = Object.entries(manifest.files).filter(([k]) => k.endsWith('.js') && !k.startsWith('vendor/'));
    expect(js.length).toBeGreaterThan(20);
    for (const [k, v] of js) {
      expect(v.minified).toBe(true);
      expect(v.bytes).toBeLessThan(v.sourceBytes);
      expect(fs.existsSync(path.join(out, `${k}.map`))).toBe(true);
    }
    expect(manifest.files['vendor/marked.min.js']).toMatchObject({ minified: false });
    mustNot(source('ui/index.html'), /<script src="https?:\/\//,
      'no page fetches a script from another origin — the markdown library is vendored',
      'vendor it under ui/vendor/ and reference it by path');
    expect(fs.existsSync(path.join(out, 'index.html'))).toBe(true);
    expect(fs.readFileSync(path.join(out, 'index.html'), 'utf8')).toBe(fs.readFileSync(path.join(ROOT, 'ui/index.html'), 'utf8'));
    /* Top-level names survive: the modules reach one another through globals. */
    const auth = fs.readFileSync(path.join(out, 'js/auth.js'), 'utf8');
    expect(auth).toMatch(/\bAuth\b/);
    fs.rmSync(out, { recursive: true, force: true });
  });

  test('Netlify publishes the built output, and the build command builds it', () => {
    const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
    expect(toml).toMatch(/publish = "dist\/ui"/);
    expect(toml).toMatch(/npm run build:ui/);
    expect(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')).toMatch(/^dist\/$/m);
  });

  test('the browser tests exist, run against the built output, and are in CI', () => {
    expect(fs.existsSync(path.join(ROOT, 'playwright.config.js'))).toBe(true);
    const cfg = fs.readFileSync(path.join(ROOT, 'playwright.config.js'), 'utf8');
    expect(cfg).toMatch(/UI_DIR: 'dist\/ui'/);
    expect(cfg).toMatch(/STORAGE_BACKEND: 'memory'/);
    const specs = fs.readdirSync(path.join(ROOT, 'e2e')).filter(f => f.endsWith('.spec.js'));
    expect(specs.length).toBeGreaterThanOrEqual(1);
    const ci = fs.readFileSync(path.join(ROOT, '.github/workflows/fintech-ci.yml'), 'utf8');
    expect(ci).toMatch(/playwright test/);
    expect(ci).toMatch(/npm run build:ui/);
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.jest.testPathIgnorePatterns).toContain('/e2e/');
  });
});

describe('The type check covers the platform and never regresses (G1)', () => {
  test('every file under src/platform, src/shared, the roots and the functions carries @ts-check', () => {
    const must = [
      ...walk(path.join(ROOT, 'src/platform')), ...walk(path.join(ROOT, 'src/shared')),
      path.join(ROOT, 'src/server.js'), path.join(ROOT, 'src/jobs.js'),
      ...walk(path.join(ROOT, 'netlify/functions')),
    ];
    const missing = must.filter(f => !/^\s*\/\/ @ts-check/m.test(fs.readFileSync(f, 'utf8').slice(0, 400))).map(rel);
    expect(missing).toEqual([]);
  });

  /* The worklist's file list was exact and its counts were not — 362 claimed
     against 428 actual, with the largest offender in the tree listed at zero
     and therefore reading as ready to adopt. It is generated now
     (`npm run docs:typecheck-worklist`) and this holds the document to the
     tree in both directions: every unchecked file is listed, and every listed
     file is genuinely unchecked. */
  test('the worklist names exactly the files still to join, across all three trees', () => {
    const TREES = [
      ['src', 'netlify/functions', 'scripts'],   // the server, on Node's globals
      ['ui/js'],                                 // the browser, on its own
      ['tests'],                                 // the suite, on Jest's
    ];
    const all = TREES.flatMap(dirs => dirs.flatMap(d => walk(path.join(ROOT, d))));
    const carries = f => /^\s*\/\/ @ts-check/m.test(fs.readFileSync(f, 'utf8').slice(0, 400));
    const unchecked = all.filter(f => !carries(f)).map(rel).sort();

    const doc = fs.readFileSync(path.join(ROOT, 'docs/TYPECHECK-WORKLIST.md'), 'utf8');
    const listed = [...doc.matchAll(/^\| `([^`]+)` \| \d+ \|$/gm)].map(m => m[1]).sort();
    expect(listed).toEqual(unchecked);

    const headline = Number((doc.match(/Checked across all three: \*\*(\d+)\*\*/) || [])[1]);
    const perTree = [...doc.matchAll(/^Checked: \*\*(\d+)\*\*/gm)].map(m => Number(m[1]));
    expect(perTree.length).toBe(TREES.length);
    expect(headline).toBe(all.length - unchecked.length);
    expect(perTree.reduce((a, b) => a + b, 0)).toBe(headline);
  });

  /* The generator measures each file by writing the pragma into it and running
     that tree's own check. Five scripts start with a shebang, and `#!` is only
     legal on line one — a pragma pushed above it makes the file a syntax
     error, which tsc reports *instead of* the type errors, so every other file
     in the tree measures as clean. That is how the src tree briefly reported
     10 errors where it has 416, and it is the same failure mode as the stale
     counts this document was rewritten to end: wrong, and reading as measured. */
  test('the pragma goes after a shebang, never above it', () => {
    const gen = fs.readFileSync(path.join(ROOT, 'scripts/generate-typecheck-worklist.js'), 'utf8');
    expect(gen).toMatch(/startsWith\('#!'\)/);

    for (const f of walk(path.join(ROOT, 'scripts'))) {
      const lines = fs.readFileSync(f, 'utf8').split('\n');
      if (!lines[0].startsWith('#!')) continue;
      expect(lines.slice(1).join('\n')).not.toMatch(/^#!/m);
      const pragma = lines.findIndex(l => /^\s*\/\/ @ts-check/.test(l));
      if (pragma !== -1) expect(pragma).toBeGreaterThan(0);
    }
  });

  test('the check is strict everywhere it is affordable, and that cannot quietly relax', () => {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'jsconfig.json'), 'utf8')).compilerOptions;
    expect(cfg.checkJs).toBe(false);
    expect(cfg.allowJs).toBe(true);
    /* `strict` was off, so a green type check proved very little. It is on
       now with `noImplicitAny` the single exception — that one is 2,648
       missing annotations and is the phase after this. Everything else,
       including the null safety this codebase has shipped defects against
       three times, is enforced. */
    expect(cfg.strict).toBe(true);
    expect(cfg.noImplicitAny).toBe(false);
    for (const flag of ['noImplicitReturns', 'noFallthroughCasesInSwitch', 'noUnusedLocals']) {
      expect({ flag, on: cfg[flag] }).toEqual({ flag, on: true });
    }
    const ci = fs.readFileSync(path.join(ROOT, '.github/workflows/fintech-ci.yml'), 'utf8');
    expect(ci).toMatch(/npm run typecheck/);
  });

  /* `ui/js` (12,741 lines) and `tests` (22,048) used to be outside the check
     entirely — the frontend being the largest consumer of these API responses
     and the place four mechanical defects have shipped. They are in now, on
     three configurations rather than one, and that separation is the point:
     `lib: dom` in the server's configuration would let a server module reach
     for `document` and still check clean, and `types: [jest]` there would do
     the same for a production file calling `expect()`. */
  test('the browser and the suite are checked too, each on its own globals', () => {
    const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')).compilerOptions;
    const server = read('jsconfig.json');
    const browser = read('ui/jsconfig.json');
    const suite = read('tests/jsconfig.json');

    for (const cfg of [browser, suite]) {
      expect(cfg.checkJs).toBe(false);      // a file joins by pragma, never by configuration
      expect(cfg.strict).toBe(true);
      expect(cfg.noImplicitAny).toBe(false);
    }

    expect(browser.lib).toContain('dom');
    expect(server.lib || []).not.toContain('dom');
    expect(suite.types).toContain('jest');
    expect(server.types).not.toContain('jest');
    expect(browser.types).toEqual([]);

    /* The application's own global surface is declared once rather than
       rediscovered by every adopting file. */
    expect(fs.existsSync(path.join(ROOT, 'ui/globals.d.ts'))).toBe(true);

    const script = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts.typecheck;
    for (const cfg of ['jsconfig.json', 'ui/jsconfig.json', 'tests/jsconfig.json']) {
      expect(script).toContain(cfg);
    }
  });
});

describe('Operations: staging, the deploy gate, Dependabot (I3, I4, I5)', () => {
  test('a staging context is configured, production-shaped, with its own secrets', () => {
    const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
    expect(toml).toMatch(/\[context\.staging\.environment\]/);
    expect(toml).toMatch(/NODE_ENV = "staging"/);
    expect(toml).not.toMatch(/DATABASE_URL\s*=/);
    const config = require('../src/platform/config');
    const saved = process.env.DEV_API_KEY;
    process.env.DEV_API_KEY = 'ck_test_' + 'd'.repeat(32);
    expect(config.validate({ env: 'staging' }).problems.map(p => p.variable)).toContain('DEV_API_KEY');
    if (saved === undefined) delete process.env.DEV_API_KEY; else process.env.DEV_API_KEY = saved;
    expect(fs.existsSync(path.join(ROOT, 'docs/ENVIRONMENTS.md'))).toBe(true);
  });

  test('CI has a gate that needs every job, and the audit fails on a high finding', () => {
    const ci = fs.readFileSync(path.join(ROOT, '.github/workflows/fintech-ci.yml'), 'utf8');
    expect(ci).toMatch(/gate:\s*\n\s*runs-on/);
    const needs = /needs:\s*\[([^\]]+)\]/.exec(ci)[1].split(',').map(s => s.trim());
    for (const job of ['test', 'test-postgres', 'lint', 'typecheck', 'audit', 'ui']) expect(needs).toContain(job);
    expect(ci).toMatch(/npm audit --audit-level=high/);
    expect(ci).not.toMatch(/continue-on-error/);
  });

  test('Dependabot is configured for npm and the workflows', () => {
    const y = fs.readFileSync(path.join(ROOT, '.github/dependabot.yml'), 'utf8');
    expect(y).toMatch(/package-ecosystem: npm/);
    expect(y).toMatch(/package-ecosystem: github-actions/);
  });
});

describe('The layering leak is closed (E6)', () => {
  test('the AI layer never reads a request; the HTTP layer hands it the figure', () => {
    const strip = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const ai = strip(fs.readFileSync(path.join(ROOT, 'src/platform/ai/deadline.js'), 'utf8'));
    expect(ai).not.toMatch(/\breq\b|lambdaContext|getRemainingTimeInMillis/);
    const http = fs.readFileSync(path.join(ROOT, 'src/platform/http/deadline.js'), 'utf8');
    expect(http).toMatch(/getRemainingTimeInMillis/);
    const { fromRemaining, Deadline } = require('../src/platform/ai/deadline');
    expect(fromRemaining(5000)).toBeInstanceOf(Deadline);
    expect(fromRemaining(5000).budgetMs).toBe(5000);
    expect(fromRemaining(undefined).budgetMs).toBe(require('../src/platform/config').functionTimeoutMs);
  });
});

describe('The exit criterion: an import from one domain into another\'s internals fails the build', () => {
  test('a file that reaches into another domain is caught by the architecture checker', () => {
    /* The checker is called with one synthetic edge rather than a probe file
       written into `src/` and a nested Jest run. The old shape left a stray
       module in the source tree on any interrupt, and cost two minutes each
       run to prove something a function call proves in a millisecond. The rule
       under test is the real one the suite enforces, imported from it. */
    const { violations, DOMAIN_ISOLATION } = require('./helpers/architecture');

    expect(violations(DOMAIN_ISOLATION)).toEqual([]);

    const probe = [{
      rel: 'src/domains/gcf/domain/__violation_probe.js',
      to: 'src/domains/pcaf-part-c/domain/rollup.js',
    }];
    const caught = violations(DOMAIN_ISOLATION, probe);
    expect(caught).toHaveLength(1);
    expect(caught[0]).toMatch(/__violation_probe\.js -> src\/domains\/pcaf-part-c\/domain\/rollup\.js/);
    expect(caught[0]).toMatch(/domain layer reaching outside/);

    /* And nothing was written: the source tree is untouched. */
    expect(fs.existsSync(path.join(ROOT, 'src/domains/gcf/domain/__violation_probe.js'))).toBe(false);
  });
});
