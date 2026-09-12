#!/usr/bin/env node
// @ts-check
/**
 * Regenerate data/pcaf-parta/real-estate/MANIFEST.json from the §5.4/§5.5
 * real-estate energy-statistics library — the same discipline the sovereign
 * and sector-factor manifests give their sets, so a disclosure can name the
 * building-energy set it rests on: version, effective date, status and a
 * SHA-256 per table and over the set.
 *
 *   npm run docs:parta-realestate-manifest
 */

'use strict';

const fs = require('fs');
const path = require('path');

const dataset = require('../src/domains/pcaf-part-a/domain/real-estate/dataset');

const OUT = path.join(__dirname, '..', 'data', 'pcaf-parta', 'real-estate', 'MANIFEST.json');

const release = dataset.release();

const manifest = {
  note: 'GENERATED. Regenerate with: npm run docs:parta-realestate-manifest',
  purpose: 'The Part A §5.4/§5.5 real-estate energy-statistics set a financed-emissions figure was computed on: version, effective date, status and checksum.',
  algorithm: release.algorithm,
  checksum: release.checksum,
  provisionalTables: release.provisionalTables,
  tables: release.tables,
};

fs.writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
process.stderr.write(`Wrote data/pcaf-parta/real-estate/MANIFEST.json — ${release.tables.length} table, set checksum ${release.checksum.slice(0, 12)}…\n`);
