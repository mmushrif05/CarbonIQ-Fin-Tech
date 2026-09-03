#!/usr/bin/env node
/**
 * Regenerate docs/GCF-CONFORMANCE.md from services/gcf/conformance.js.
 *
 * One source. A hand-maintained copy of a conformance table drifts from the
 * code as soon as either changes, and the drift is invisible exactly when it
 * matters — under review. The matrix is the source; this is a rendering of it.
 *
 *   npm run docs:gcf-conformance
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { RULES, SOURCE, summarise } = require('../services/gcf/conformance');

const OUT = path.join(__dirname, '..', 'docs', 'GCF-CONFORMANCE.md');

const esc = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');
const code = s => (s ? `\`${esc(s)}\`` : '—');

const s = summarise();

const groups = [
  ['Lot 1 Milestone 4 — data capture', r => r.id.startsWith('G-DATA')],
  ['Carbon accounting boundaries', r => r.id.startsWith('G-CARBON')],
  ['Sri Lanka NDC 3.0', r => r.id.startsWith('G-NDC')],
  ['Accreditation', r => r.id.startsWith('G-ACCR')],
  ['Lot 2 — screening, instruments, the answer', r => r.id.startsWith('G-LOT2')],
  ['Statutory reporting', r => r.id.startsWith('G-REPORT')],
  ['Concept Note package', r => r.id.startsWith('G-CN')],
  ['Deliberately out of scope', r => r.id.startsWith('G-EXCL')],
];

let out = `# GCF pipeline — conformance matrix

<!-- GENERATED FILE. Do not edit by hand.
     Source: services/gcf/conformance.js
     Regenerate: npm run docs:gcf-conformance -->

**Source of requirements:** ${SOURCE}

**Status:** ${s.implemented} implemented · ${s.partial} partial · ${s.excluded} deliberately excluded
(${s.total} rules).

> Nothing here is endorsed by the Green Climate Fund, and this system does not score a
> proposal on GCF's behalf. This is a self-declaration of what has been built against a
> published Terms of Reference, offered with the evidence needed to check it.

Every row names the file that enforces the rule and the test that proves it.
\`tests/gcf-conformance.test.js\` fails the build if either citation stops
resolving — including a test renamed inside a file that still exists, which is
exactly how a matrix goes quietly wrong.

`;

for (const [title, match] of groups) {
  const rows = RULES.filter(match);
  if (!rows.length) continue;
  out += `\n## ${title}\n\n`;
  for (const r of rows) {
    out += `### ${r.id} — ${esc(r.rule)}\n\n`;
    out += `| | |\n|---|---|\n`;
    out += `| **Status** | ${r.status} |\n`;
    out += `| **Requirement** | ${esc(r.clause)} |\n`;
    out += `| **Implementation** | ${code(r.implementation)} |\n`;
    out += `| **Proving test** | ${code(r.test)} |\n`;
    if (r.limitation) out += `| **Limitation** | ${esc(r.limitation)} |\n`;
    out += '\n';
  }
}

fs.writeFileSync(OUT, out);
process.stdout.write(`Wrote ${path.relative(path.join(__dirname, '..'), OUT)} — `
  + `${RULES.length} rules (${s.implemented} implemented, ${s.partial} partial, `
  + `${s.excluded} excluded).\n`);
