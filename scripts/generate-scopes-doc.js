#!/usr/bin/env node
/**
 * docs/API-SCOPES.md — every route the application registers, and the scope
 * it requires, generated from the running router and the scope table.
 *
 *   npm run docs:scopes
 *
 * A reviewer reads this; a test (tests/scopes.test.js) fails the build when
 * it no longer matches the code, so it cannot go quietly stale.
 */

'use strict';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
const fs = require('fs');
const path = require('path');

const { routeTable, renderScopesDoc } = require('../src/platform/auth/scopes-doc');

const OUT = path.join(__dirname, '..', 'docs', 'API-SCOPES.md');
const rows = routeTable(require('../src/server'));
fs.writeFileSync(OUT, renderScopesDoc(rows));
process.stdout.write(`Wrote ${path.relative(path.join(__dirname, '..'), OUT)} — ${rows.length} routes\n`);
process.exit(0);
