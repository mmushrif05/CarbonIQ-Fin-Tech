#!/usr/bin/env node
// @ts-check
/**
 * Load the illustrative Part A starter book into an organisation from a
 * shell — the same installer `POST /v1/pcaf/part-a/starter` runs from the
 * screen, for a deployment that has one.
 *
 *   npm run book:install -- --org <orgId> [--by "Name"] [--entity "Legal name"]
 *
 * Refused where the year already holds exposures, and for the preview
 * organisation. Every row is computed by its engine on the way in.
 */

'use strict';

const store = require('../src/platform/database/store');
const register = require('../src/domains/pcaf-part-a/application/register');
const sovereign = require('../src/domains/pcaf-part-a/application/sovereign-register');
const { installStarterBook } = require('../src/domains/pcaf-part-a/application/starter-book');
const settings = require('../src/domains/pcaf-part-a/application/parta-settings');

function parseArgs(argv) {
  const args = /** @type {{org?: string, by?: string, entity?: string}} */ ({});
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--org') args.org = argv[++i];
    else if (a === '--by') args.by = argv[++i];
    else if (a === '--entity') args.entity = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.org) {
    process.stderr.write('Usage: npm run book:install -- --org <orgId> [--by "Name"] [--entity "Legal name"]\n');
    process.exit(2);
  }
  const cap = store.capability();
  process.stderr.write(`Store: ${cap.chosen} (${cap.reason})\n`);
  const r = await installStarterBook({ register, sovereign, store, settings }, args.org, { by: args.by || null, reportingEntity: args.entity || null });
  process.stderr.write(`Installed FY${r.reportingYear}: ${r.installed.exposures} exposures and ${r.installed.sovereign} sovereign holdings across ${r.installed.classes} classes into "${args.org}".\n${r.note}\n`);
  if (typeof store.close === 'function') await store.close();
}

main().catch(err => {
  process.stderr.write(`${err.code || 'ERROR'}: ${err.message}${err.remedy ? `\n  ${err.remedy}` : ''}\n`);
  process.exit(1);
});
