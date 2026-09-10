#!/usr/bin/env node
// @ts-check
/**
 * A logical backup of the configured database, in pg_dump's custom format,
 * and a check that the file it wrote can be read back.
 *
 *   npm run db:backup [-- --out=backups] [--schema=public]
 *
 * This is the manual path. On managed PostgreSQL (RDS, Cloud SQL, Neon,
 * Supabase) continuous archiving and point-in-time recovery are a setting on
 * the instance, and docs/DATA-LAYER.md records the RPO and RTO they give.
 */

'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a, true]; }));
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is not set.'); process.exit(2); }

const outDir = path.resolve(args.out || 'backups');
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = path.join(outDir, `carboniq-${stamp}.dump`);
const schema = args.schema || process.env.DATABASE_SCHEMA || 'public';

const dump = spawnSync('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', `--schema=${schema}`, `--file=${file}`, url], { stdio: 'inherit' });
if (dump.status !== 0) { console.error(`pg_dump exited ${dump.status}${dump.error ? ` (${dump.error.message})` : ''}.`); process.exit(1); }

const check = spawnSync('pg_restore', ['--list', file], { encoding: 'utf8' });
if (check.status !== 0) { console.error('The dump was written but pg_restore cannot read it back — treat it as failed.'); process.exit(1); }
const entries = check.stdout.split('\n').filter(l => /^\d+;/.test(l)).length;
const bytes = fs.statSync(file).size;
console.log(`Wrote ${file} (${bytes} bytes, ${entries} catalogue entries, schema ${schema}).`);
console.log(`Restore with: pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" ${file}`);
