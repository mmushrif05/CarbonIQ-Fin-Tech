#!/usr/bin/env node
// @ts-check
/**
 * Regenerate data/pcaf-parta/vehicles/MANIFEST.json from the §5.6 vehicle
 * statistics — the same discipline the sovereign, sector-factor and real-estate
 * sets follow: the manifest is the release a figure names, committed, and held
 * to the table by a test so a stale checkout cannot read as current.
 *
 *   npm run docs:parta-vehicles-manifest
 */

'use strict';

const fs = require('fs');
const path = require('path');

const dataset = require('../src/domains/pcaf-part-a/domain/motor-vehicles/dataset');

const OUT = path.join(__dirname, '..', 'data', 'pcaf-parta', 'vehicles', 'MANIFEST.json');

const release = dataset.release();

const manifest = {
  note: 'GENERATED. Regenerate with: npm run docs:parta-vehicles-manifest',
  purpose: 'The Part A §5.6 vehicle-statistics set a financed-emissions figure was computed on: version, effective date, status and checksum.',
  algorithm: release.algorithm,
  checksum: release.checksum,
  provisionalTables: release.provisionalTables,
  tables: release.tables,
};

fs.writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
process.stderr.write(`Wrote data/pcaf-parta/vehicles/MANIFEST.json — ${release.tables.length} table, set checksum ${release.checksum.slice(0, 12)}…\n`);
