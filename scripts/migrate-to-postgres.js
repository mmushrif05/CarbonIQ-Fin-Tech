#!/usr/bin/env node
/**
 * Backfill — bring every record held in Firebase or Netlify Blobs into
 * PostgreSQL, and prove the count on both sides before saying so.
 *
 *   npm run db:backfill -- --from=firebase|blobs [--org=a,b] [--commit] [--allow-orphans]
 *
 * Dry run by default: reads, checks references, prints the table, writes
 * nothing. `--commit` writes each organisation in one transaction and then
 * counts both sides; a mismatch rolls that organisation back and exits 2.
 *
 * An orphan — a project whose client is not in the source, a payment whose
 * investment is not — was allowed by the stores this is leaving and is
 * refused by the one it is entering. It is reported by id; `--allow-orphans`
 * skips those records and says how many, because the alternative is a
 * backfill that silently holds fewer records than the source.
 *
 * The source is read directly — the seam would route reads to PostgreSQL
 * the moment DATABASE_URL is set, which is the very moment this runs.
 */

'use strict';

require('dotenv').config();

const db = require('../src/platform/database');
const { COLLECTIONS, inReferentialOrder } = db.collections;

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));
const FROM = args.from;
const COMMIT = args.commit === true;
const ALLOW_ORPHANS = args['allow-orphans'] === true;
const ORGS = typeof args.org === 'string' ? args.org.split(',').map(s => s.trim()).filter(Boolean) : null;

/* Which field on a child names its parent, per collection. Mirrors the FKs in 0001_initial.sql. */
const PARENTS = {
  projects: [['clientId', 'clients']],
  boqRevisions: [['projectId', 'projects']],
  assessments: [['projectId', 'projects'], ['boqRevisionId', 'boqRevisions']],
  capital_investments: [['portfolioId', 'capital_portfolios']],
  capital_payments: [['portfolioId', 'capital_portfolios'], ['investmentId', 'capital_investments']],
};

async function readFirebase() {
  const fb = require('../src/platform/bridge/firebase');
  const database = fb.getDatabase();
  if (!database) throw new Error('Firebase is not configured (FIREBASE_SERVICE_ACCOUNT / FIREBASE_DATABASE_URL).');
  const snap = await database.ref('fintech/partc').once('value');
  const tree = snap.val() || {};
  const out = new Map(); // orgId -> collection -> Map(id -> record)
  for (const [orgId, cols] of Object.entries(tree)) {
    for (const [collection, records] of Object.entries(cols || {})) {
      if (!COLLECTIONS[collection]) { console.warn(`  skipping unregistered collection "${collection}" for ${orgId}`); continue; }
      if (!out.has(orgId)) out.set(orgId, new Map());
      out.get(orgId).set(collection, new Map(Object.entries(records || {})));
    }
  }
  return out;
}

async function readBlobs() {
  const blobs = require('../src/platform/database/blob-store');
  if (!blobs.isAvailable()) throw new Error('Netlify Blobs is not reachable from this process. Run this with `netlify dev` or with NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN set.');
  const { getStore } = require('@netlify/blobs');
  const store = getStore({ name: blobs.STORE_NAME, consistency: 'strong' });
  const out = new Map();
  for (const collection of Object.keys(COLLECTIONS)) {
    const prefix = `${encodeURIComponent(collection)}/`;
    let cursor;
    do {
      const page = await store.list({ prefix, cursor });
      for (const b of page.blobs || []) {
        const [, org, id] = b.key.split('/').map(decodeURIComponent);
        const rec = await store.get(b.key, { type: 'json' }).catch(() => null);
        if (!rec) continue;
        if (!out.has(org)) out.set(org, new Map());
        if (!out.get(org).has(collection)) out.get(org).set(collection, new Map());
        out.get(org).get(collection).set(id, rec);
      }
      cursor = page.cursor;
    } while (cursor);
  }
  return out;
}

function findOrphans(cols) {
  const orphans = [];
  for (const [collection, parents] of Object.entries(PARENTS)) {
    const records = cols.get(collection);
    if (!records) continue;
    for (const [id, rec] of records) {
      for (const [field, parent] of parents) {
        const ref = rec[field];
        if (ref === undefined || ref === null || ref === '') continue;
        const set = cols.get(parent);
        if (!set || !set.has(String(ref))) orphans.push({ collection, id, field, ref, parent });
      }
    }
  }
  return orphans;
}

(async () => {
  if (!['firebase', 'blobs'].includes(FROM)) {
    console.error('Usage: node scripts/migrate-to-postgres.js --from=firebase|blobs [--org=a,b] [--commit] [--allow-orphans]');
    process.exit(2);
  }
  if (!db.client.isConfigured()) { console.error('DATABASE_URL is not set — nothing to write into.'); process.exit(2); }
  const status = await db.migrate.status();
  if (status.pending.length || status.drifted.length) {
    console.error(`Schema is not current (${status.pending.length} pending, ${status.drifted.length} drifted). Run npm run db:migrate first.`);
    process.exit(2);
  }

  console.log(`Reading ${FROM}…`);
  const source = FROM === 'firebase' ? await readFirebase() : await readBlobs();
  const orgIds = [...source.keys()].filter(o => !ORGS || ORGS.includes(o));
  if (!orgIds.length) { console.log('No organisations found in the source.'); process.exit(0); }
  console.log(`${COMMIT ? 'Writing' : 'Dry run over'} ${orgIds.length} organisation(s): ${orgIds.join(', ')}\n`);

  let exitCode = 0;
  const order = inReferentialOrder();
  for (const orgId of orgIds) {
    const cols = source.get(orgId);
    const orphans = findOrphans(cols);
    const skip = new Set(orphans.map(o => `${o.collection}/${o.id}`));
    console.log(`Organisation ${orgId}`);
    for (const collection of order) {
      const n = cols.get(collection) ? cols.get(collection).size : 0;
      if (n) console.log(`  ${collection.padEnd(22)} ${String(n).padStart(6)} in source`);
    }
    if (orphans.length) {
      console.log(`  ${orphans.length} orphan(s) — a record whose parent is not in the source:`);
      for (const o of orphans.slice(0, 20)) console.log(`    ${o.collection}/${o.id}: ${o.field}=${o.ref} not found in ${o.parent}`);
      if (orphans.length > 20) console.log(`    … and ${orphans.length - 20} more`);
      if (!ALLOW_ORPHANS) { console.log('  Refusing this organisation. Re-run with --allow-orphans to skip them, and record that you did.\n'); exitCode = 2; continue; }
      console.log(`  --allow-orphans: ${orphans.length} record(s) will be skipped.`);
    }
    if (!COMMIT) { console.log('  (dry run — nothing written)\n'); continue; }

    try {
      await db.documents.transaction(async () => {
        for (const collection of order) {
          const records = cols.get(collection);
          if (!records) continue;
          for (const [id, rec] of records) {
            if (skip.has(`${collection}/${id}`)) continue;
            await db.documents.put(collection, orgId, id, rec);
          }
        }
        /* Verify inside the transaction: a mismatch rolls the organisation back. */
        const report = [];
        let mismatch = false;
        for (const collection of order) {
          const records = cols.get(collection);
          if (!records) continue;
          const expected = [...records.keys()].filter(id => !skip.has(`${collection}/${id}`)).length;
          const actual = await db.documents.count(collection, orgId);
          report.push([collection, expected, actual]);
          if (actual < expected) mismatch = true;
        }
        for (const [c, e, a] of report) console.log(`  ${c.padEnd(22)} ${String(e).padStart(6)} expected ${String(a).padStart(6)} in PostgreSQL${a < e ? '  MISMATCH' : ''}`);
        if (mismatch) throw Object.assign(new Error('count mismatch'), { code: 'BACKFILL_MISMATCH' });
      });
      console.log('  committed\n');
    } catch (err) {
      console.error(`  rolled back: ${err.message}\n`);
      exitCode = 2;
    }
  }
  await db.client.close();
  process.exit(exitCode);
})().catch(err => { console.error(err.message); process.exit(1); });
