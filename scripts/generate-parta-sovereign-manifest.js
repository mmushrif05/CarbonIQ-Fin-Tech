#!/usr/bin/env node
// @ts-check
/**
 * Regenerate data/pcaf-parta/sovereign/MANIFEST.json from the §5.9 sovereign
 * dataset — the same discipline the sector-factor manifest gives the Option 3
 * library, so a disclosure can name the sovereign set it rests on: version,
 * effective date, status and a SHA-256 per table and over the set.
 *
 *   npm run docs:parta-sovereign-manifest
 */

'use strict';

const fs = require('fs');
const path = require('path');

const dataset = require('../src/domains/pcaf-part-a/domain/sovereign/dataset');

const OUT = path.join(__dirname, '..', 'data', 'pcaf-parta', 'sovereign', 'MANIFEST.json');

const release = dataset.release();

const manifest = {
  note: 'GENERATED. Regenerate with: npm run docs:parta-sovereign-manifest',
  purpose: 'The Part A §5.9 sovereign dataset a financed-emissions figure was computed on: version, effective date, status and checksum.',
  algorithm: release.algorithm,
  checksum: release.checksum,
  provisionalTables: release.provisionalTables,
  tables: release.tables,
};

fs.writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
process.stderr.write(`Wrote data/pcaf-parta/sovereign/MANIFEST.json — ${release.tables.length} table, set checksum ${release.checksum.slice(0, 12)}…\n`);
