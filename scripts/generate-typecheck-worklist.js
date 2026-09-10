#!/usr/bin/env node
// @ts-check
/**
 * `docs/TYPECHECK-WORKLIST.md`, generated from the compiler.
 *
 * The file list was accurate and the **counts were not**: 362 claimed against
 * 428 actual, and one file listed at 0 errors that had 55 — the largest
 * offender in the tree, presented as ready to adopt. A hand-maintained count
 * beside a generated list is worse than no count, because it reads as
 * measured.
 *
 * So it is measured. For each of the three trees the check covers — `src/`
 * on Node's globals, `ui/` on the browser's, `tests/` on Jest's — this runs
 * that tree's compiler twice: once as the build runs it, once with `checkJs`
 * on for the whole tree. The difference is what each unchecked file would cost
 * to adopt. `tests/structure.test.js` fails the build when the document and
 * the tree disagree.
 *
 * Three configurations rather than one, because the globals are the point:
 * `lib: dom` in the root configuration would let a server module reach for
 * `document` and still type-check clean, and `types: [jest]` there would do
 * the same for `expect()`.
 *
 *   npm run docs:typecheck-worklist
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'TYPECHECK-WORKLIST.md');

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (p.endsWith('.js')) out.push(p);
  }
  return out;
};

const rel = f => path.relative(ROOT, f).split(path.sep).join('/');

/**
 * Every file under a tree, split by whether it carries the pragma.
 * @param {string[]} dirs directories to walk, relative to the repository root
 */
function survey(dirs) {
  const files = dirs.flatMap(d => walk(path.join(ROOT, d)));
  const checked = [], unchecked = [];
  for (const f of files) {
    (/^\/\/ @ts-check/m.test(fs.readFileSync(f, 'utf8')) ? checked : unchecked).push(rel(f));
  }
  return { checked: checked.sort(), unchecked: unchecked.sort() };
}

/**
 * Errors per file, measured the way adoption actually happens.
 *
 * The first version of this ran the compiler with `checkJs: true` for the
 * whole tree, which looks equivalent and is not: `checkJs` also pulls the
 * JavaScript inside `node_modules` into inference, so a package shipping no
 * types (supertest is the one here) resolves to a different shape from the one
 * the real check sees. That understated the suite by hundreds of errors while
 * reading as measured — the same failure this document was rewritten to end.
 *
 * So it measures by adopting: the pragma is written into every unchecked file
 * in the tree, the build's own configuration is run once over it, and the
 * files are put back. Same settings, same answer.
 *
 * @param {string} configPath the tree's jsconfig, relative to the repository root
 * @param {string[]} unchecked repository-relative paths of the files to measure
 */
function errorsByFile(configPath, unchecked) {
  const originals = new Map();
  let out = '';
  try {
    for (const rel of unchecked) {
      const f = path.join(ROOT, rel);
      const text = fs.readFileSync(f, 'utf8');
      originals.set(f, text);
      /* After the shebang, never before it: `#!` is only legal on line one,
         and a pragma pushed above it makes the file a syntax error — which
         tsc reports instead of the type errors this is here to count, so
         every other file in the tree measures as clean. */
      fs.writeFileSync(f, text.startsWith('#!')
        ? text.replace(/^(.*\n)/, '$1// @ts-check\n')
        : `// @ts-check\n${text}`);
    }
    try {
      execFileSync('npx', ['tsc', '-p', configPath], { cwd: ROOT, encoding: 'utf8' });
    } catch (thrown) {
      /* tsc exits non-zero when it finds errors, and the report is on stdout. */
      const e = /** @type {any} */ (thrown);
      out = String((e && e.stdout) || '');
    }
  } finally {
    for (const [f, text] of originals) fs.writeFileSync(f, text);
  }
  /** @type {Record<string, number>} */
  const counts = {};
  for (const line of out.split('\n')) {
    const m = line.match(/^(.+?)\(\d+,\d+\): error TS/);
    if (!m) continue;
    /* tsc prints paths relative to its working directory, which is the
       repository root, not the directory the configuration sits in. */
    const f = path.relative(ROOT, path.resolve(ROOT, m[1])).split(path.sep).join('/');
    counts[f] = (counts[f] || 0) + 1;
  }
  return counts;
}

/** One tree's section of the document. */
function section({ label, dirs, config, note }, { checked, unchecked }, counts) {
  const rows = unchecked.map(f => ({ f, n: counts[f] || 0 }))
    .sort((a, b) => b.n - a.n || a.f.localeCompare(b.f));
  const total = rows.reduce((n, r) => n + r.n, 0);
  const clean = rows.filter(r => r.n === 0);

  return `## ${label}

\`${config}\` over ${dirs.map(d => `\`${d}\``).join(', ')}. ${note}

Checked: **${checked.length}**. Remaining: **${rows.length}** (${total} errors, measured by
adopting the pragma on all of them at once and running this tree's own check).
${clean.length ? `
**${clean.length} of them raise no errors at all** and can be adopted by adding the
pragma and nothing else.
` : ''}${rows.length ? `
| File | Errors to fix before it joins |
|---|---|
${rows.map(r => `| \`${r.f}\` | ${r.n} |`).join('\n')}
` : `
Nothing outstanding: every file in this tree is checked.
`}`;
}

/* The three trees, each on its own globals. */
const TREES = [
  {
    label: 'The server — `src/`, `netlify/functions/`, `scripts/`',
    dirs: ['src', 'netlify/functions', 'scripts'],
    config: 'jsconfig.json',
    note: 'Node globals only. Every file under `src/platform`, `src/shared`, the '
        + 'composition roots and the Netlify functions carries the pragma; so does '
        + 'every clean file elsewhere.',
  },
  {
    label: 'The browser — `ui/`',
    dirs: ['ui/js'],
    config: 'ui/jsconfig.json',
    note: 'Browser globals, and the application\'s own surface declared once in '
        + '`ui/globals.d.ts`. Separate from the server configuration because '
        + '`lib: dom` in that one would let a server module reach for `document` '
        + 'and still check clean. This is the largest consumer of these API '
        + 'responses and where four mechanical defects have shipped.',
  },
  {
    label: 'The suite — `tests/`',
    dirs: ['tests'],
    config: 'tests/jsconfig.json',
    note: 'Jest globals. Separate for the same reason: `types: [jest]` in the '
        + 'server configuration would let a production file call `expect()` and '
        + 'still check clean.',
  },
];

const parts = TREES.map((tree) => {
  const s = survey(tree.dirs);
  return { tree, survey: s, counts: errorsByFile(tree.config, s.unchecked) };
});

const checkedTotal = parts.reduce((n, p) => n + p.survey.checked.length, 0);
const remainingTotal = parts.reduce((n, p) => n + p.survey.unchecked.length, 0);

const doc = `# Type-check worklist

**Generated by \`npm run docs:typecheck-worklist\`. Do not edit.**
\`tests/structure.test.js\` fails the build when this document and the tree
disagree — a list whose counts are wrong reads as measured when it is not.

\`npm run typecheck\` runs the TypeScript compiler over three trees with
\`checkJs\` off globally and on per file: a file carrying \`// @ts-check\` is
checked with JSDoc as its types. A file joins the check the day its errors are
fixed, never by adding the pragma over them.

The compiler runs at **\`strict: true\` with \`noImplicitAny\` off** — so null
safety, \`this\`, unused locals, unreachable returns and catch narrowing are
all enforced, and only the missing-annotation class is not. Adopting
\`noImplicitAny\` is the remaining step and is measured below.

The per-file count is what that file raises when **every** file in its tree is
checked, under the settings the build uses. Adopting one on its own can differ
by a little, because a checked dependency infers differently from an unchecked
one — so treat the figure as the size of the job, not as a contract.

Checked across all three: **${checkedTotal}**. Remaining: **${remainingTotal}**.

${parts.map(p => section(p.tree, p.survey, p.counts)).join('\n')}`;

fs.writeFileSync(DOC, doc);
console.log(`[typecheck-worklist] ${checkedTotal} checked, ${remainingTotal} remaining → docs/TYPECHECK-WORKLIST.md`);
