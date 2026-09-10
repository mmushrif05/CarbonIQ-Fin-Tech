#!/usr/bin/env node
// @ts-check
/**
 * Execution evidence for both conformance matrices.
 *
 * The matrices map clause -> implementation -> proving test, and the tests
 * beside them check that every citation *resolves*: the file is on disk, the
 * test name is really in it. Nothing checked that the cited test **executes**
 * the cited implementation. That is how a rule can cite a function no path
 * reaches and stay green for a year — the failure this repository has already
 * had once, where a Box 6-4 substitution was claimed by a rule whose input no
 * schema ever produced.
 *
 * So this runs each cited test file under coverage restricted to the files the
 * rules on that test cite, and records how many statements of each actually
 * ran. A rule whose implementation executes zero statements under its own
 * proving test is unproven, and this exits non-zero on it.
 *
 *   npm run docs:conformance-evidence
 *
 * The result is docs/CONFORMANCE-EVIDENCE.md, and tests/conformance-evidence.test.js
 * holds the document to the matrices so a stale copy cannot read as current.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'CONFORMANCE-EVIDENCE.md');

/** @type {Array<{matrix: string, mod: {RULES: any[]}}>} */
const MATRICES = [
  { matrix: 'PCAF Part C', mod: require('../src/domains/pcaf-part-c/domain/conformance') },
  { matrix: 'GCF pipeline', mod: require('../src/domains/gcf/domain/conformance') },
];

/** The source files a rule's implementation text cites, brace expansion included. */
function citedFiles(text) {
  const out = new Set();
  for (const m of String(text || '').matchAll(/(?<![\w/])((?:src|data)\/[\w./-]*\.\w+)/g)) out.add(m[1]);
  for (const m of String(text || '').matchAll(/(?<![\w/])((?:src|data)\/[\w./-]*)\{([^}]+)\}(\.\w+)/g)) {
    for (const part of m[2].split(',')) out.add(`${m[1]}${part.trim()}${m[3]}`);
  }
  /* A JSON factor table is data, not a code path — coverage says nothing about
     it, and the schema tests are what hold it. */
  return [...out].filter(f => f.endsWith('.js') && fs.existsSync(path.join(ROOT, f)));
}

/** The test file a rule cites. */
const citedTest = rule => (String(rule.test || '').match(/(tests\/[\w.-]+\.test\.js)/) || [])[1] || null;

/** Every rule across both matrices, with what it cites resolved. */
function collect() {
  const rules = [];
  for (const { matrix, mod } of MATRICES) {
    for (const r of mod.RULES) {
      rules.push({ matrix, id: r.id, status: r.status, evidence: r.evidence || 'execution', clause: r.clause, test: citedTest(r), files: citedFiles(r.implementation) });
    }
  }
  return rules;
}

/** Run one test file with coverage limited to `files`; return covered statements per file. */
function measure(testFile, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carboniq-evidence-'));
  const args = [
    'jest', testFile, '--silent', '--coverage',
    '--coverageReporters=json-summary',
    `--coverageDirectory=${dir}`,
    '--coverageThreshold={}',
    ...files.map(f => `--collectCoverageFrom=${f}`),
  ];
  const run = spawnSync('npx', args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, STORAGE_BACKEND: 'memory' } });
  const summaryFile = path.join(dir, 'coverage-summary.json');
  if (!fs.existsSync(summaryFile)) {
    return { failed: true, output: (run.stderr || run.stdout || '').slice(-2000), covered: {} };
  }
  const summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
  const covered = {};
  for (const f of files) covered[f] = summary[path.join(ROOT, f)]?.statements?.covered ?? 0;
  fs.rmSync(dir, { recursive: true, force: true });
  return { failed: run.status !== 0, output: '', covered };
}

function main() {
  const rules = collect();
  const byTest = new Map();
  for (const r of rules) {
    if (!r.test || !r.files.length || r.evidence === 'absence') continue;
    if (!byTest.has(r.test)) byTest.set(r.test, new Set());
    for (const f of r.files) byTest.get(r.test).add(f);
  }

  const measured = new Map();
  let n = 0;
  for (const [testFile, files] of byTest) {
    n += 1;
    process.stderr.write(`[${n}/${byTest.size}] ${testFile}\n`);
    measured.set(testFile, measure(testFile, [...files]));
  }

  const rows = [];
  const unproven = [];
  for (const r of rules) {
    /* An excluded rule cites the code that keeps the thing out, and a rule
       with no code to cite (a data table, a deliberate absence) has nothing to
       execute. Neither is a claim that something runs. */
    if (r.status === 'excluded' || r.evidence === 'absence' || !r.test || !r.files.length) {
      const verdict = r.status === 'excluded' ? 'out of scope'
        : r.evidence === 'absence' ? 'proved by absence'
          : 'no code path cited';
      rows.push({ ...r, statements: null, verdict });
      continue;
    }
    const m = measured.get(r.test);
    const statements = r.files.map(f => m.covered[f] ?? 0);
    const total = statements.reduce((a, b) => a + b, 0);
    const dead = r.files.filter((f, i) => statements[i] === 0);
    if (m.failed) unproven.push(`${r.id} — its proving test did not pass: ${r.test}`);
    else if (dead.length) unproven.push(`${r.id} — ${r.test} executes no statement of ${dead.join(', ')}`);
    rows.push({ ...r, statements: total, verdict: m.failed ? 'test failed' : dead.length ? 'not executed' : 'executed' });
  }

  write(rows, unproven);
  if (unproven.length) {
    process.stderr.write(`\n${unproven.length} rule(s) unproven:\n  ${unproven.join('\n  ')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stderr.write(`\nAll ${rows.filter(r => r.verdict === 'executed').length} executable rules proved by their own test.\n`);
}

const esc = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');

function write(rows, unproven) {
  const executed = rows.filter(r => r.verdict === 'executed').length;
  let out = `# Conformance evidence — the cited test executes the cited code

<!-- GENERATED FILE. Do not edit by hand.
     Source: src/domains/pcaf-part-c/domain/conformance.js, src/domains/gcf/domain/conformance.js
     Regenerate: npm run docs:conformance-evidence -->

A conformance matrix that only proves its citations *resolve* proves nothing
about behaviour: a rule can name a real file and a real test while no path
reaches the code the rule is about. Each row below was produced by running the
rule's own proving test under coverage restricted to the files that rule cites,
and recording how many statements ran.

**Executed** means the proving test reached the cited implementation.
**Out of scope** is a rule that exists to keep something out, so there is no
path to execute. **Proved by absence** is a rule whose claim is that no path
exists — the cited code must *not* run here, so a coverage figure would be the
wrong evidence. **No code path cited** is a rule evidenced by a data table.

Statement counts are evidence of execution, not a coverage target: a rule is
proved or it is not.

| Matrix | Rule | Clause | Proving test | Statements executed | Verdict |
|---|---|---|---|---|---|
`;
  for (const r of rows) {
    out += `| ${esc(r.matrix)} | \`${esc(r.id)}\` | ${esc(r.clause)} | ${r.test ? `\`${esc(r.test)}\`` : '—'} | ${r.statements === null ? '—' : r.statements} | ${r.verdict} |\n`;
  }
  out += `\n## Summary\n\n- ${rows.length} rules across both matrices\n- **${executed} proved by execution**\n`;
  out += `- ${rows.filter(r => r.verdict === 'out of scope').length} deliberately out of scope\n`;
  out += `- ${rows.filter(r => r.verdict === 'proved by absence').length} proved by the absence of a path\n`;
  out += `- ${rows.filter(r => r.verdict === 'no code path cited').length} evidenced by a data table rather than a code path\n`;
  out += `- **${unproven.length} unproven**\n`;
  if (unproven.length) out += `\n${unproven.map(u => `- ${u}`).join('\n')}\n`;
  fs.writeFileSync(OUT, out);
  process.stderr.write(`Wrote ${path.relative(ROOT, OUT)}\n`);
}

main();
