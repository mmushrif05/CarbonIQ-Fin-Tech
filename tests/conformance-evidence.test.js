// @ts-check
/**
 * Conformance evidence — the document that says the cited test executes the
 * cited code, held to the matrices it was generated from.
 *
 * The two conformance test files already prove that every citation *resolves*:
 * the file is on disk, the test name is really in it. That is not the same as
 * proving the rule is enforced. A rule can name a real file and a real test
 * while nothing in that test ever reaches the code the rule is about — which
 * is how a Box 6-4 substitution stayed claimed here for a year with an input
 * no schema produced.
 *
 * `npm run docs:conformance-evidence` runs each proving test under coverage
 * restricted to what its rules cite and records what actually ran. This holds
 * the result to the matrices, so a stale document cannot read as current, and
 * fails the build on any rule the run could not prove.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'CONFORMANCE-EVIDENCE.md');

const { requireGraph } = require('./helpers/require-graph');

const parta = require('../src/domains/pcaf-part-a/domain/conformance');
const partc = require('../src/domains/pcaf-part-c/domain/conformance');
const gcf = require('../src/domains/gcf/domain/conformance');
const ALL = [...parta.RULES, ...partc.RULES, ...gcf.RULES];

const doc = () => fs.readFileSync(DOC, 'utf8');

describe('The evidence document exists and marks itself generated', () => {
  test('it is present and names the command that rebuilds it', () => {
    expect(fs.existsSync(DOC)).toBe(true);
    expect(doc()).toMatch(/GENERATED FILE\. Do not edit by hand/);
    expect(doc()).toMatch(/npm run docs:conformance-evidence/);
  });

  test('it says what a statement count is and is not', () => {
    /* A number in a conformance document invites being read as a target. This
       one is evidence of execution — a rule is proved or it is not. */
    expect(doc()).toMatch(/not a coverage target/);
  });
});

describe('It cannot drift from the matrices', () => {
  test('every rule in both matrices has a row', () => {
    const md = doc();
    const missing = ALL.filter(r => !md.includes(`\`${r.id}\``)).map(r => r.id);
    expect(missing).toEqual([]);
  });

  test('the rule count in the summary is the matrices’ own count', () => {
    expect(doc()).toContain(`- ${ALL.length} rules across the conformance matrices`);
  });
});

describe('Nothing is left unproven', () => {
  test('the run proved every rule that claims a code path', () => {
    /* The exit criterion of H4.3: a conformance claim now rests on behaviour
       observed, not on a citation that resolves. */
    expect(doc()).toContain('- **0 unproven**');
    expect(doc()).not.toMatch(/\| not executed \|/);
    expect(doc()).not.toMatch(/\| test failed \|/);
  });

  test('most rules are proved by execution rather than by exception', () => {
    const proved = Number((doc().match(/- \*\*(\d+) proved by execution\*\*/) || [])[1]);
    expect(proved).toBeGreaterThan(ALL.length * 0.8);
  });
});

describe('The evidence vocabulary is declared, not improvised', () => {
  test('the matrices publish the same vocabulary', () => {
    expect(partc.VALID_EVIDENCE).toEqual(gcf.VALID_EVIDENCE);
    expect(parta.VALID_EVIDENCE).toEqual(partc.VALID_EVIDENCE);
    expect(partc.VALID_EVIDENCE).toEqual(['execution', 'absence']);
  });

  test('no rule carries an evidence value outside it', () => {
    const bad = ALL.filter(r => r.evidence && !partc.VALID_EVIDENCE.includes(r.evidence));
    expect(bad.map(r => `${r.id} -> ${r.evidence}`)).toEqual([]);
  });

  test('a rule proved by absence still cites the test that asserts the absence', () => {
    for (const r of ALL.filter(x => x.evidence === 'absence')) {
      expect(r.test).toBeTruthy();
      const file = (String(r.test).match(/(tests\/[\w.-]+\.test\.js)/) || [])[1];
      expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
    }
  });
});

describe('Every cited implementation is on a path the application reaches', () => {
  /* The other half of "the path is reachable". Coverage proves a test executes
     the code; this proves the running server does — a rule citing a module no
     composition root requires is a claim about dead code, and it reads exactly
     like a claim about live code. */
  const live = new Set([
    ...requireGraph(path.join(ROOT, 'src/server.js')),
    ...requireGraph(path.join(ROOT, 'src/jobs.js')),
  ]);

  const citedSources = rule => [...new Set([
    ...[...String(rule.implementation || '').matchAll(/(?<![\w/])(src\/[\w./-]*\.js)/g)].map(m => m[1]),
    ...[...String(rule.implementation || '').matchAll(/(?<![\w/])(src\/[\w./-]*)\{([^}]+)\}(\.js)/g)]
      .flatMap(m => m[2].split(',').map(part => `${m[1]}${part.trim()}${m[3]}`)),
  ])];

  test('the graph is a graph, not an empty set', () => {
    /* A check that passes because it had nothing to check is worse than no
       check — the lesson this phase started with. */
    expect(live.size).toBeGreaterThan(100);
  });

  test('no rule cites a module the server never loads', () => {
    const unreachable = [];
    for (const r of ALL) {
      /* An excluded rule, and a rule proved by absence, name the code that
         must stay out of the path. Requiring them to be reachable would be
         requiring the opposite of what they claim. */
      if (r.status === 'excluded' || r.evidence === 'absence') continue;
      for (const f of citedSources(r)) {
        if (!fs.existsSync(path.join(ROOT, f))) continue;
        if (!live.has(path.join(ROOT, f))) unreachable.push(`${r.id} -> ${f}`);
      }
    }
    expect(unreachable).toEqual([]);
  });
});
