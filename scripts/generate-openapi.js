#!/usr/bin/env node
// @ts-check
/**
 * Write docs/openapi.json from the running router.
 *
 *   npm run docs:openapi
 *
 * tests/api-contract.test.js fails the build when the file no longer matches
 * what the code produces, so the document a bank generates a client from is
 * the router that answers it.
 */

'use strict';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.STORAGE_BACKEND = process.env.STORAGE_BACKEND || 'memory';
process.env.LOG_LEVEL = 'silent';

const fs = require('fs');
const path = require('path');
const app = require('../src/server');
const { buildSpec } = require('../src/platform/http/openapi');

const spec = buildSpec(app);
const out = path.join(__dirname, '..', 'docs', 'openapi.json');
fs.writeFileSync(out, `${JSON.stringify(spec, null, 2)}\n`);
const ops = Object.values(spec.paths).reduce((n, p) => n + Object.keys(p).length, 0);
process.stdout.write(`Wrote ${path.relative(process.cwd(), out)} — ${Object.keys(spec.paths).length} paths, ${ops} operations\n`);
