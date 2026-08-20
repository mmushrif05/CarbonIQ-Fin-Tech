#!/usr/bin/env node
/**
 * Generate docs/PCAF-PART-C-CONFORMANCE.md from the conformance matrix.
 *
 * Generated rather than hand-written so the document and the code cannot
 * drift apart: the matrix is the single source, its evidence is checked by
 * tests/pcaf-partc-conformance.test.js, and this file is a rendering of it.
 *
 *   npm run docs:conformance
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { conformanceMatrix, summarise, RULES, STANDARD } = require('../services/pcaf-partc/conformance');

const OUT = path.join(__dirname, '..', 'docs', 'PCAF-PART-C-CONFORMANCE.md');

const BADGE = { implemented: 'Implemented', partial: 'Partial', excluded: 'Excluded' };

function groupKey(id) {
  if (id.startsWith('C-SCOPE')) return 'Scope';
  if (id.startsWith('C-ATTR'))  return 'Attribution';
  if (id.startsWith('C-METH'))  return 'Method';
  return 'Data quality and disclosure';
}

function render() {
  const m = conformanceMatrix();
  const s = summarise();
  const L = [];

  L.push('# PCAF Part C — Conformance Statement');
  L.push('');
  L.push('> Generated from `services/pcaf-partc/conformance.js`. Do not edit by hand —');
  L.push('> run `npm run docs:conformance`. Every claim below is checked by');
  L.push('> `tests/pcaf-partc-conformance.test.js`, which fails the build if a rule');
  L.push('> names a file that does not exist or a test that is not real.');
  L.push('');
  L.push(`**Standard:** ${STANDARD}`);
  L.push('');
  L.push('## What this is');
  L.push('');
  L.push(m.statement);
  L.push('');
  L.push(`**${m.disclaimer}**`);
  L.push('');
  L.push('## Summary');
  L.push('');
  L.push('| Status | Rules |');
  L.push('|---|---|');
  for (const k of ['implemented', 'partial', 'excluded']) {
    if (s[k]) L.push(`| ${BADGE[k]} | ${s[k]} |`);
  }
  L.push(`| **Total** | **${s.total}** |`);
  L.push('');
  L.push('## How to verify any row');
  L.push('');
  L.push('1. Open the file named in **Implementation** and read the rule as code.');
  L.push('2. Run the test named in **Evidence**: `npx jest <file> -t "<test name>"`.');
  L.push('3. Reproduce the headline figures yourself: `npx jest tests/pcaf-partc-engine.test.js`.');
  L.push('');
  L.push('The engine is pure and deterministic — no network, no clock, and no language');
  L.push('model in any arithmetic path — so the same inputs always produce the same');
  L.push('disclosure. `tests/pcaf-partc-e2e.test.js` re-derives the A4 figure from the');
  L.push('published audit trail alone, which is the check an assurance provider would run.');
  L.push('');

  const groups = ['Scope', 'Attribution', 'Method', 'Data quality and disclosure'];
  for (const g of groups) {
    const rules = RULES.filter(r => groupKey(r.id) === g);
    if (!rules.length) continue;
    L.push(`## ${g}`);
    L.push('');
    for (const r of rules) {
      L.push(`### ${r.id} — ${BADGE[r.status]}`);
      L.push('');
      L.push(`**Clause:** ${r.clause}`);
      L.push('');
      L.push(`**Rule.** ${r.rule}`);
      L.push('');
      L.push(`**Implementation.** ${r.implementation}`);
      L.push('');
      L.push(`**Evidence.** \`${r.test}\``);
      if (r.limitation) {
        L.push('');
        L.push(`**Limitation.** ${r.limitation}`);
      }
      L.push('');
    }
  }

  L.push('## Known limitations, stated plainly');
  L.push('');
  for (const r of RULES.filter(x => x.status !== 'implemented')) {
    L.push(`- **${r.id}** (${BADGE[r.status]}) — ${r.limitation}`);
  }
  L.push('');
  L.push('## Factor provenance');
  L.push('');
  L.push('Every emission factor carries a data-quality tier (Local, Regional, Global) and a');
  L.push('named source. The full store is published at `GET /v1/pcaf/part-c/factors`, and');
  L.push('every assessment reports the factors it used, the gaps it fell back on, and which');
  L.push('gap carried the most emissions — which is what turns "our factors should be');
  L.push('localised" into a ranked, evidence-based research list.');
  L.push('');

  return L.join('\n');
}

fs.writeFileSync(OUT, render());
console.log(`Wrote ${path.relative(process.cwd(), OUT)} — ${RULES.length} rules`);
