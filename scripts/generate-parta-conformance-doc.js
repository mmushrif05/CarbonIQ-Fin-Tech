#!/usr/bin/env node
/**
 * Generate docs/PCAF-PART-A-CONFORMANCE.md from the §5.2 conformance matrix.
 *
 * Generated rather than hand-written so the document and the code cannot
 * drift apart: the matrix is the single source, its evidence is checked by
 * tests/pcaf-parta-conformance.test.js, and this file is a rendering of it.
 *
 *   npm run docs:parta-conformance
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { conformanceMatrix, summarise, RULES, STANDARD } = require('../src/domains/pcaf-part-a/domain/conformance');

const OUT = path.join(__dirname, '..', 'docs', 'PCAF-PART-A-CONFORMANCE.md');

const BADGE = { implemented: 'Implemented', partial: 'Partial', excluded: 'Excluded' };

function groupKey(id) {
  if (id.startsWith('A-SCOPE'))  return 'Scope';
  if (id.startsWith('A-CLASS') || id.startsWith('A-ATTR')) return 'Classification and attribution';
  if (id.startsWith('A-OPT'))   return 'Data quality — the option-to-score mapping';
  if (id.startsWith('A-EST'))   return 'Estimation and the sector factor library';
  if (id.startsWith('A-LINE'))  return 'The six reporting lines';
  if (id.startsWith('A-FIND'))  return 'The third verdict, and the checks a standard cannot give';
  if (id.startsWith('A-REG'))   return 'The exposure register';
  if (id.startsWith('A-DQ'))    return 'The disclosed score and the improvement plan';
  return 'The disclosure and the per-exposure report';
}

const GROUPS = [
  'Scope',
  'Classification and attribution',
  'Data quality — the option-to-score mapping',
  'Estimation and the sector factor library',
  'The six reporting lines',
  'The third verdict, and the checks a standard cannot give',
  'The exposure register',
  'The disclosed score and the improvement plan',
  'The disclosure and the per-exposure report',
];

function render() {
  const m = conformanceMatrix();
  const s = summarise();
  const L = [];

  L.push('# PCAF Part A §5.2 — Conformance Statement');
  L.push('');
  L.push('> Generated from `src/domains/pcaf-part-a/domain/conformance.js`. Do not edit by hand —');
  L.push('> run `npm run docs:parta-conformance`. Every claim below is checked by');
  L.push('> `tests/pcaf-parta-conformance.test.js`, which fails the build if a rule');
  L.push('> names a file that does not exist or a test that is not real, and each rule is');
  L.push('> re-proved by execution in `docs/CONFORMANCE-EVIDENCE.md`.');
  L.push('');
  L.push(`**Standard:** ${STANDARD}`);
  L.push('');
  L.push('## What this is');
  L.push('');
  L.push(m.statement);
  L.push('');
  L.push('This is the §5.2 asset class — business loans and unlisted equity — one input to a');
  L.push('bank’s Chapter 6 financed-emissions disclosure, not the disclosure. It is kept apart');
  L.push('from the Part C matrix because the two scopes never merge and the option-to-score');
  L.push('numerals are not interchangeable between them.');
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
  L.push('3. Reproduce the standard’s own worked example (Tables 5.2-2/5.2-3, p.63):');
  L.push('   `npx jest tests/parta-business-loans.test.js`.');
  L.push('');
  L.push('The engine is pure and deterministic — no network, no clock, and no language model in');
  L.push('any arithmetic path — so the same inputs always produce the same figures. A citation');
  L.push('that resolves is not evidence of behaviour, so `docs/CONFORMANCE-EVIDENCE.md` runs each');
  L.push('rule’s own proving test under coverage restricted to the files it cites and records what');
  L.push('actually ran.');
  L.push('');

  for (const g of GROUPS) {
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
      L.push(`**Evidence.** \`${r.test}\`${r.evidence === 'absence' ? ' (proved by the absence of a path)' : ''}`);
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
  L.push('Every Option 3 sector factor carries a data-quality tier and a named source, and the');
  L.push('shipped rows say they are provisional. The full library is published at');
  L.push('`GET /v1/pcaf/part-a/factors` with the release checksum, and every estimated figure names');
  L.push('the table, version and checksum it was computed on — so a disclosure names the set it');
  L.push('rests on. The sector intensity bands the plausibility check reads are a governed baseline,');
  L.push('not a factor, scoped global → country → organisation and released with a recorded reason.');
  L.push('');

  return L.join('\n');
}

fs.writeFileSync(OUT, render());
console.log(`Wrote ${path.relative(process.cwd(), OUT)} — ${RULES.length} rules`);
