// @ts-check
'use strict';

/**
 * CarbonIQ FinTech — record real GCF pipeline projects into the connected store.
 *
 * The dashboard shows the shipped illustrative pipeline until an organisation
 * has recorded something of its own; the moment it has, the recorded book wins
 * entirely and the sample is not read (src/domains/gcf/infrastructure/store.js).
 * This script is the auditable way to put a curated book of *real* projects in:
 * one command, every project validated at the door, each write attributed and
 * stamped with when it happened, and a refusal — not a silent loss — on a
 * deployment that cannot persist.
 *
 * It writes through exactly the same seam and the same validation the
 * `POST /v1/gcf/pipeline` route uses, so a project recorded here is a project
 * the API would have accepted, and no more.
 *
 *   node scripts/gcf-record-projects.js --org <orgId> --file <book.json> [--by "Name"] [--dry-run] [--yes]
 *   npm run gcf:record -- --org dfcc --file data/gcf/real-projects.json --by "Analyst name"
 *
 * The store is chosen from the environment exactly as the running server
 * chooses it: with DATABASE_URL set the book lands in PostgreSQL and survives;
 * without a durable store the script refuses rather than writing somewhere the
 * next cold start will discard.
 *
 * Keys whose name begins with "_" are treated as annotations and stripped
 * before validation, so the plain-language template's own guidance notes can
 * be left in place while the real facts are filled in around them.
 */

const fs = require('fs');
const path = require('path');
const store = require('../src/domains/gcf/infrastructure/store');
const platformStore = require('../src/platform/database/store');

/** @param {unknown} e */
const messageOf = e => (e instanceof Error ? e.message : String(e));

/** Organisations the recorder will not write into, and why. */
const RESERVED_ORGS = {
  preview: 'the read-only preview organisation, whose only book is the shared sample',
};

function parseArgs(argv) {
  const args = { org: null, file: null, by: null, dryRun: false, yes: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--org') args.org = argv[++i];
    else if (a === '--file') args.file = argv[++i];
    else if (a === '--by') args.by = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--yes') args.yes = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unrecognised argument: ${a}`);
  }
  return args;
}

const USAGE = `
Record real GCF pipeline projects into the connected store.

  node scripts/gcf-record-projects.js --org <orgId> --file <book.json> [options]

Required
  --org <orgId>     The organisation the projects belong to (e.g. dfcc).
  --file <path>     A JSON file: either { "projects": [ ... ] } or a bare [ ... ].

Options
  --by "<name>"     Who is recording these (stamped on every record's provenance).
  --dry-run         Validate every project and report, but write nothing.
  --yes             Skip the confirmation prompt (for non-interactive use).
  --help            Show this message.

Notes
  • With DATABASE_URL set the book lands in PostgreSQL and persists; without a
    durable store the script refuses rather than losing the write.
  • Recording into an organisation that already has projects updates matching
    ids and adds the rest — it never wipes the existing book.
  • Keys beginning with "_" are annotations and are ignored (so the template's
    guidance notes can stay in the file).
`;

/** Remove annotation keys (leading underscore) anywhere in the tree. */
function stripAnnotations(value) {
  if (Array.isArray(value)) return value.map(stripAnnotations);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('_')) continue;
      out[k] = stripAnnotations(v);
    }
    return out;
  }
  return value;
}

function loadBook(file) {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) throw new Error(`File not found: ${resolved}`);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (e) {
    throw new Error(`${resolved} is not valid JSON: ${messageOf(e)}`);
  }
  const clean = stripAnnotations(parsed);
  const projects = Array.isArray(clean) ? clean : clean.projects;
  if (!Array.isArray(projects) || projects.length === 0) {
    throw new Error('No projects found. Provide a JSON array, or an object with a non-empty "projects" array.');
  }
  return projects;
}

/**
 * Ask once, on a real terminal, before writing. A non-interactive run (no TTY)
 * or --yes proceeds; anything else waits for a "yes".
 */
function confirm(question) {
  if (!process.stdin.isTTY) return Promise.resolve(true);
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (d) => {
      process.stdin.pause();
      resolve(/^\s*(y|yes)\s*$/i.test(String(d)));
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { process.stdout.write(USAGE); return; }

  if (!args.org) throw new Error('--org is required. ' + USAGE);
  if (!args.file) throw new Error('--file is required. ' + USAGE);
  if (RESERVED_ORGS[args.org]) {
    throw new Error(`Refusing to record into "${args.org}": it is ${RESERVED_ORGS[args.org]}. Choose the institution's own organisation id.`);
  }

  const projects = loadBook(args.file);

  // Fail fast on shape before touching the store: report every invalid project
  // at once, so a book is fixed in one pass rather than one project at a time.
  const record = require('../src/domains/gcf/domain/record');
  const invalid = [];
  for (const p of projects) {
    try { record.validate(p); } catch (e) { invalid.push({ id: p && p.id, message: messageOf(e) }); }
  }
  if (invalid.length) {
    process.stderr.write(`\n${invalid.length} of ${projects.length} project(s) are not valid and nothing was recorded:\n`);
    for (const bad of invalid) process.stderr.write(`\n  • ${bad.id || '(no id)'}\n    ${bad.message}\n`);
    process.stderr.write('\nFix these and run again.\n');
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`\n${projects.length} project(s) validated for organisation "${args.org}":\n`);
  for (const p of projects) process.stdout.write(`  • ${p.id}  ${p.name}\n`);

  if (args.dryRun) {
    process.stdout.write('\nDry run — nothing was written. Remove --dry-run to record them.\n');
    return;
  }

  // Name the store now, so the refusal (if any) is a plain message rather than
  // a stack trace, and so the operator sees where the book is about to land.
  let cap;
  try {
    cap = platformStore.assertWritable();
  } catch (e) {
    const err = /** @type {any} */ (e);
    process.stderr.write(`\nThe connected deployment cannot persist, so nothing was recorded.\n  ${messageOf(e)}\n`);
    if (err.remedy) process.stderr.write(`  ${err.remedy}\n`);
    process.exitCode = 1;
    return;
  }
  if (cap && cap.chosen) process.stdout.write(`\nStore: ${cap.chosen}.\n`);

  const proceed = args.yes || await confirm(`\nRecord ${projects.length} project(s) into "${args.org}"? [y/N] `);
  if (!proceed) { process.stdout.write('Cancelled — nothing was written.\n'); return; }

  const results = [];
  for (const p of projects) {
    const before = await store.get(args.org, p.id).catch(() => ({ project: null, source: 'none' }));
    const existed = before && before.project && before.source === 'recorded';
    const saved = await store.put(args.org, p, { by: args.by });
    results.push({ id: saved.id, name: saved.name, action: existed ? 'updated' : 'recorded' });
  }

  const recorded = results.filter(r => r.action === 'recorded').length;
  const updated = results.filter(r => r.action === 'updated').length;
  process.stdout.write(`\nDone. ${recorded} recorded, ${updated} updated.\n`);
  for (const r of results) process.stdout.write(`  • ${r.action}: ${r.id}  ${r.name}\n`);
  process.stdout.write(`\nThe GCF pipeline dashboard for "${args.org}" now shows this recorded book, not the illustrative sample.\n`);
}

if (require.main === module) {
  main()
    .then(() => process.exit(process.exitCode || 0))
    .catch((e) => { process.stderr.write(`\n${e.message}\n`); process.exit(1); });
}

module.exports = { parseArgs, stripAnnotations, loadBook };
