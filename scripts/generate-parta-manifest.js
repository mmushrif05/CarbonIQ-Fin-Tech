#!/usr/bin/env node
// @ts-check
/**
 * Regenerate data/pcaf-parta/MANIFEST.json from the Part A sector factor
 * library and its vocabulary — the same discipline `data/factors/MANIFEST.json`
 * gives the Part C tables, kept apart because Part A and Part C are two scopes
 * that never merge and their factor sets are read by two different engines.
 *
 *   npm run docs:parta-manifest
 */

'use strict';

const fs = require('fs');
const path = require('path');

const library = require('../src/domains/pcaf-part-a/domain/sector-factors');

const OUT = path.join(__dirname, '..', 'data', 'pcaf-parta', 'MANIFEST.json');

const release = library.release();

const manifest = {
  note: 'GENERATED. Regenerate with: npm run docs:parta-manifest',
  purpose: 'The Part A sector factor set an estimated figure was computed on: version, effective date, status and checksum per table.',
  algorithm: release.algorithm,
  checksum: release.checksum,
  provisionalTables: release.provisionalTables,
  tables: release.tables,
};

fs.writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
process.stderr.write(`Wrote data/pcaf-parta/MANIFEST.json — ${release.tables.length} tables, set checksum ${release.checksum.slice(0, 12)}…\n`);
