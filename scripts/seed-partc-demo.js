#!/usr/bin/env node
/**
 * Seed the PCAF Part C demo book — Ceylon Insurance PLC, FY2026.
 *
 *   npm run setup:seed-partc [-- --org=<orgId>]
 *
 * Writes through the registry, so it respects the same storage rules as the
 * API: with Firebase configured the book persists, without it the book lives
 * only as long as this process — which is why seeding is normally run against
 * a configured environment.
 */

'use strict';

const registry = require('../services/partc-registry');
const store    = require('../services/partc-store');
const { seedDemoBook } = require('../services/partc-demo-data');

const orgArg = process.argv.find(a => a.startsWith('--org='));
const orgId  = orgArg ? orgArg.split('=')[1] : (process.env.DEMO_ORG_ID || 'ui');

(async () => {
  const cap = store.capability();
  console.log(`Storage: ${cap.mode} — ${cap.reason}`);
  if (!cap.writable) {
    console.error('\nCannot seed: storage is not writable in this runtime.');
    if (cap.remedy) console.error(cap.remedy);
    process.exit(1);
  }
  if (!cap.durable) {
    console.warn('\nWARNING: no Firebase configured. This book will not survive the process exiting.');
  }

  console.log(`\nSeeding Part C demo book into org "${orgId}"…\n`);
  const result = await seedDemoBook(registry, orgId);

  console.log(`  Insurer   ${result.settings.insurerName} · FY${result.settings.reportingYear} · ${result.settings.currency}`);
  console.log(`  Clients   ${result.summary.clients}`);
  for (const c of result.clients) console.log(`              ${c.name}`);
  console.log(`  Projects  ${result.summary.projects}`);
  for (const p of result.projects) {
    console.log(`              ${p.name} — ${p.gifa_m2} m2 — ${(p.policies || []).map(x => `${x.lineType} FY${x.reportingYear}`).join(', ')}`);
  }
  console.log(`  Policies  ${result.summary.policies} (${result.summary.withUseStage} with a use stage)`);
  console.log(`  Premium   ${result.settings.currency} ${result.summary.totalPremium.toLocaleString()}`);
  console.log(`  Years     ${result.summary.reportingYears.join(', ')}`);
  console.log('\nDone.');
})().catch(err => { console.error('Seed failed:', err.message); process.exit(1); });
