// @ts-check
/**
 * The content layer — the wording a deployment owns.
 *
 * The prose a document carries used to live entirely in domain source: a
 * compliance officer wanting the conformance statement worded their way
 * needed a developer and a deploy. That is the gap this closes.
 *
 * It closes it deliberately narrowly, because the opposite failure is worse.
 * Most of the prose in this system is not wording at all: "no row in this
 * table sums them" states a scope rule the standard sets, and a sentence that
 * can be edited out of a disclosure is a rule that can be edited out of a
 * disclosure. So the overridable set is an **allow-list**, each key naming
 * what it is for and who owns it, and everything not on it stays in source
 * where the tests that hold the standard can reach it.
 *
 * Two guards on every override:
 *
 *   · it is refused if it carries endorsement language, so the content layer
 *     cannot be the way "PCAF approved" gets back onto a page;
 *   · a key that is not on the list is refused by name rather than ignored,
 *     because silently dropping an operator's edit is how they conclude the
 *     feature does not work and go back to asking a developer.
 *
 * Overrides come from `data/content/report-text.json` where a deployment has
 * one. Absence is the normal case and leaves every default standing.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { containsForbiddenLanguage } = require('./report-integrity');

const OVERRIDE_FILE = path.join(__dirname, '..', '..', 'data', 'content', 'report-text.json');

/* The file actually read. A test points a fresh copy of this module at a
   temporary file rather than writing the deployment's own — the suite runs
   in parallel workers, and a forbidden override written into the real file
   for one assertion was loaded by another worker's app in the same instant. */
let overrideFile = OVERRIDE_FILE;

/**
 * What a deployment may reword, and what each line is for.
 *
 * `owner` says whose sentence it is. `entity` is the reporting entity's own
 * statement about itself — its preparer, its limitations, its assurance
 * position — and is exactly the prose a compliance officer reviews.
 * `presentation` is wording that describes the document rather than the
 * standard: it can be said differently without saying something different.
 */
const CONTENT = Object.freeze({
  'report.preparedBy': {
    owner: 'entity',
    description: 'The preparer line on the cover of every report.',
    default: 'Prepared by Datum Solutions (Private) Limited',
  },
  'report.unitsStatement': {
    owner: 'presentation',
    description: 'How units are reported, and why working tables are in kilogrammes.',
    default:
      'Reported figures are in tonnes of carbon dioxide equivalent (tCO2e). Working tables '
      + 'are in kilogrammes (kgCO2e) because the engine computes in kilogrammes and rounding '
      + 'to tonnes before aggregation would move the total. Intensity is in tCO2e per million '
      + 'units of currency, and per m2 of insured floor area. Every figure carries its unit in '
      + 'its own column rather than glued to the number.',
  },
  'report.financedEmissionsStatement': {
    owner: 'presentation',
    description: 'That insurance-associated and financed emissions are never combined.',
    default:
      'This inventory contains insurance-associated emissions only. Financed emissions — the '
      + 'emissions attributed through lending and investment under Part A of the same standard — '
      + 'are a different attribution against a different denominator and are reported separately. '
      + 'The two are never added together, and no figure in this document contains any part of the other.',
  },
  'report.scaleQualifier': {
    owner: 'presentation',
    description: 'The sentence stating which end of the PCAF 1-5 scale is better.',
    default: 'PCAF scale 1-5, where 1 is the highest data quality and 5 the lowest. A lower score is better.',
  },
});

const KEYS = Object.freeze(Object.keys(CONTENT));

/** The maximum a replacement may run to. A statement, not a chapter. */
const MAX_LENGTH = 2000;

let _overrides = null;

/** Read the deployment's overrides once, validating each. */
function _load() {
  if (_overrides) return _overrides;
  _overrides = /** @type {Record<string, string>} */ ({});
  if (!fs.existsSync(overrideFile)) return _overrides;
  const raw = JSON.parse(fs.readFileSync(overrideFile, 'utf8'));
  _overrides = validateOverrides(raw && raw.text ? raw.text : raw);
  return _overrides;
}

/** Forget the loaded overrides — used by tests and after an edit. */
function reload() { _overrides = null; return _load(); }

/**
 * Read overrides from `file` instead of the deployment's — a test seam, so a
 * suite can prove the loader's refusals without writing into the file every
 * other worker's application reads.
 * @param {string} file
 */
function useOverrideFile(file) { overrideFile = file; _overrides = null; }

/**
 * Check a set of overrides and return it, or throw naming the first problem.
 * @param {Record<string, any>} overrides
 * @returns {Record<string, string>}
 */
function validateOverrides(overrides) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [key, value] of Object.entries(overrides || {})) {
    if (!CONTENT[key]) {
      throw new Error(`"${key}" is not an overridable content key. The overridable keys are: ${KEYS.join(', ')}.`);
    }
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`"${key}" must be a non-empty string.`);
    }
    if (value.length > MAX_LENGTH) {
      throw new Error(`"${key}" is ${value.length} characters; the limit is ${MAX_LENGTH}.`);
    }
    const forbidden = containsForbiddenLanguage(value);
    if (forbidden.length) {
      throw new Error(`"${key}" claims PCAF endorsement (${forbidden.join(', ')}). Output states conformance, never endorsement.`);
    }
    out[key] = value;
  }
  return out;
}

/**
 * The text for `key` — the deployment's, or the one declared in source.
 * @param {string} key
 * @returns {string}
 */
function text(key) {
  const entry = CONTENT[key];
  if (!entry) throw new Error(`No content key "${key}".`);
  const overrides = _load();
  return overrides[key] !== undefined ? overrides[key] : entry.default;
}

/** Every key, its owner, its default and whether this deployment changed it. */
function catalogue() {
  const overrides = _load();
  return KEYS.map(key => ({
    key,
    owner: CONTENT[key].owner,
    description: CONTENT[key].description,
    default: CONTENT[key].default,
    overridden: overrides[key] !== undefined,
    text: text(key),
  }));
}

module.exports = { CONTENT, KEYS, MAX_LENGTH, OVERRIDE_FILE, text, catalogue, reload, useOverrideFile, validateOverrides };
