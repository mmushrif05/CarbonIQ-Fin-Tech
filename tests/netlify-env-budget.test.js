/**
 * The Lambda environment budget.
 *
 * AWS caps ALL environment variables for a function at 4KB combined. This
 * function sits close to that ceiling because FIREBASE_SERVICE_ACCOUNT is a
 * ~3KB base64 blob, and the failure mode is nasty: the build goes green and
 * the deploy dies at UPLOAD with "Failed to create function: ... environment
 * variables exceed the 4KB limit". Nothing in the application is wrong, so
 * nothing in the application reports it.
 *
 * That happened. Fifteen variables in netlify.toml were each setting a value
 * identical to the default in config/index.js — spending the budget to
 * change nothing — and one genuinely new variable then pushed the total over.
 *
 * This suite makes the mistake impossible to repeat quietly: a variable
 * declared in netlify.toml must actually change the resolved configuration.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');

/** Every KEY = "VALUE" inside a [context.*.environment] block. */
function contextEnv() {
  const blocks = {};
  let current = null;
  for (const raw of toml.split('\n')) {
    const line = raw.trim();
    const header = line.match(/^\[context\.([^\].]+)\.environment\]$/);
    if (header) { current = header[1]; blocks[current] = {}; continue; }
    if (/^\[/.test(line)) { current = null; continue; }
    if (!current || !line || line.startsWith('#')) continue;
    const kv = line.match(/^([A-Z0-9_]+)\s*=\s*"(.*)"$/);
    if (kv) blocks[current][kv[1]] = kv[2];
  }
  return blocks;
}

/** Resolve config with a given environment, from a clean module registry. */
function resolveWith(env) {
  const saved = { ...process.env };
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, env);
  jest.resetModules();
  let cfg;
  try { cfg = JSON.parse(JSON.stringify(require('../config'))); }
  finally {
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, saved);
    jest.resetModules();
  }
  return cfg;
}

describe('Every variable in netlify.toml earns its place in the 4KB budget', () => {
  const blocks = contextEnv();

  test('the parser actually found the context blocks', () => {
    expect(Object.keys(blocks)).toEqual(expect.arrayContaining(['production']));
  });

  for (const [context, vars] of Object.entries(blocks)) {
    describe(`[context.${context}.environment]`, () => {
      for (const [key, value] of Object.entries(vars)) {
        test(`${key} changes the resolved configuration`, () => {
          const withIt    = resolveWith({ ...vars });
          const withoutIt = resolveWith(
            Object.fromEntries(Object.entries(vars).filter(([k]) => k !== key)));

          expect(JSON.stringify(withoutIt)).not.toEqual(JSON.stringify(withIt));
        });
      }
    });
  }
});

describe('The declared environment stays well inside the Lambda cap', () => {
  /* Only what this repo declares can be measured here — the Netlify UI holds
     the credentials and Netlify injects its own build variables — so the
     budget for repo-declared values is kept deliberately small. */
  const LIMIT = 4096;
  const REPO_BUDGET = 512;

  test('netlify.toml declares far less than the 4KB cap', () => {
    const blocks = contextEnv();
    for (const [context, vars] of Object.entries(blocks)) {
      const bytes = Object.entries(vars)
        .reduce((n, [k, v]) => n + Buffer.byteLength(`${k}=${v}`, 'utf8'), 0);
      expect(bytes).toBeLessThan(REPO_BUDGET);
      expect(bytes).toBeLessThan(LIMIT);
    }
  });
});
