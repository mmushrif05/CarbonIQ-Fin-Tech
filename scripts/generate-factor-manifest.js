#!/usr/bin/env node
// @ts-check
/**
 * Regenerate data/factors/MANIFEST.json from the factor tables themselves.
 *
 * The strategy this product is built to commits to a **locked, traceable,
 * regional baseline** — a bank should not have to re-measure a figure it
 * already holds, and an auditor should be able to say which factors produced
 * a disclosure. That needs three things a JSON table does not carry on its
 * own: a version, an effective date, and a checksum that moves when a value
 * does.
 *
 * The tables now carry the first two, and this records all three in one
 * committed file. A factor change is then a reviewable diff in a checksummed
 * manifest rather than an edit nobody sees, and `tests/factor-provenance.test.js`
 * fails the build when the manifest and the tables disagree.
 *
 *   npm run docs:factor-manifest
 */

'use strict';

const fs = require('fs');
const path = require('path');

const factors = require('../src/domains/pcaf-part-c/domain/factors');

const OUT = path.join(__dirname, '..', 'data', 'factors', 'MANIFEST.json');

const release = factors.factorRelease();

const manifest = {
  note: 'GENERATED. Regenerate with: npm run docs:factor-manifest',
  purpose: 'The factor set a disclosure was computed on: version, effective date, status and checksum per table.',
  algorithm: release.algorithm,
  checksum: release.checksum,
  provisionalTables: release.provisionalTables,
  tables: release.tables,
};

fs.writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
process.stderr.write(`Wrote data/factors/MANIFEST.json — ${release.tables.length} tables, set checksum ${release.checksum.slice(0, 12)}…\n`);
