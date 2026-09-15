/**
 * Recording real GCF projects into the connected store.
 *
 * Phase 0 of the DFCC pipeline plan: the shipped pipeline is illustrative, and
 * a bank's real projects have to be able to go in and stay in. The route
 * already records one project; this is the auditable way to load a curated
 * book of them in one command (scripts/gcf-record-projects.js).
 *
 * What is pinned here:
 *   • annotation keys (leading underscore) are stripped before validation, so
 *     the plain-language template's guidance can be left in the file;
 *   • a recorded book persists and flips the dashboard from the sample to the
 *     recorded source — proved on whichever store the run is on;
 *   • recording the same id again updates in place rather than duplicating;
 *   • the CLI refuses a reserved organisation and a dry run writes nothing.
 */

'use strict';

const path = require('path');
const { execFileSync } = require('child_process');
const platformStore = require('../src/platform/database/store');
const gcf = require('../src/domains/gcf/infrastructure/store');
const { stripAnnotations, loadBook } = require('../scripts/gcf-record-projects');

const TEMPLATE = path.resolve(__dirname, '../data/gcf/real-projects.template.json');
const ORG = 'test-dfcc';

beforeEach(() => platformStore._resetMemory());

describe('annotations and loading', () => {
  test('stripAnnotations removes underscore keys at every level, keeps real fields', () => {
    const clean = stripAnnotations({
      _README: 'ignore me',
      id: 'x',
      financing: { _help: 'ignore', totalCost: 10 },
      list: [{ _note: 'ignore', value: 1 }],
    });
    expect(clean).toEqual({ id: 'x', financing: { totalCost: 10 }, list: [{ value: 1 }] });
  });

  test('the shipped template parses to three projects', () => {
    const projects = loadBook(TEMPLATE);
    expect(projects).toHaveLength(3);
    expect(projects.map(p => p.id)).toEqual([
      'gcf_example_a_replace_me', 'gcf_example_b_replace_me', 'gcf_example_c_replace_me',
    ]);
    // Annotation keys did not survive the load.
    expect(JSON.stringify(projects)).not.toMatch(/"_help"/);
  });
});

describe('recording persists and replaces the sample', () => {
  test('an empty org shows the sample; a recorded book wins entirely', async () => {
    const before = await gcf.list(ORG);
    expect(before.source).toBe('seed');
    expect(before.sample).toBe(true);

    const projects = loadBook(TEMPLATE);
    for (const p of projects) await gcf.put(ORG, p, { by: 'Analyst' });

    const after = await gcf.list(ORG);
    expect(after.source).toBe('recorded');
    expect(after.sample).toBe(false);
    expect(after.projects).toHaveLength(3);

    const one = await gcf.get(ORG, 'gcf_example_a_replace_me');
    expect(one.source).toBe('recorded');
    expect(one.project.provenance.enteredBy).toBe('Analyst');
    expect(one.project.provenance.enteredAt).toBeTruthy();
  });

  test('recording the same id again updates in place, never duplicates', async () => {
    const [first] = loadBook(TEMPLATE);
    await gcf.put(ORG, first, { by: 'Analyst' });
    await gcf.put(ORG, { ...first, name: 'Renamed project' }, { by: 'Reviewer' });

    const after = await gcf.list(ORG);
    expect(after.projects.filter(p => p.id === first.id)).toHaveLength(1);
    const one = await gcf.get(ORG, first.id);
    expect(one.project.name).toBe('Renamed project');
    // The original author survives an update; the updater is recorded beside it.
    expect(one.project.provenance.enteredBy).toBe('Analyst');
    expect(one.project.provenance.updatedBy).toBe('Reviewer');
  });
});

describe('the CLI guards', () => {
  const SCRIPT = path.resolve(__dirname, '../scripts/gcf-record-projects.js');
  const run = (args) => {
    try {
      const out = execFileSync('node', [SCRIPT, ...args], {
        encoding: 'utf8',
        env: { ...process.env, STORAGE_BACKEND: 'memory' },
      });
      return { code: 0, out };
    } catch (e) {
      return { code: e.status || 1, out: `${e.stdout || ''}${e.stderr || ''}` };
    }
  };

  test('a dry run validates and writes nothing', () => {
    const { code, out } = run(['--org', ORG, '--file', TEMPLATE, '--dry-run']);
    expect(code).toBe(0);
    expect(out).toMatch(/3 project\(s\) validated/);
    expect(out).toMatch(/nothing was written/i);
  });

  test('the preview organisation is refused', () => {
    const { code, out } = run(['--org', 'preview', '--file', TEMPLATE, '--yes']);
    expect(code).toBe(1);
    expect(out).toMatch(/Refusing to record into "preview"/);
  });

  test('an invalid book is refused whole, with every problem named', () => {
    const bad = path.resolve(__dirname, 'fixtures-gcf-bad.json');
    require('fs').writeFileSync(bad, JSON.stringify({ projects: [{ id: 'broken' }] }));
    try {
      const { code, out } = run(['--org', ORG, '--file', bad, '--yes']);
      expect(code).toBe(1);
      expect(out).toMatch(/not valid and nothing was recorded/);
    } finally {
      require('fs').unlinkSync(bad);
    }
  });
});
