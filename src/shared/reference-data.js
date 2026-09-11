// @ts-check
/**
 * Reference data is checked on the way in.
 *
 * Twenty-two JSON files under `data/` reached the arithmetic through
 * `require()` or `JSON.parse` with nothing between: twelve factor tables, the
 * GCF reference set and its seed pipeline, the Part A option tables, the
 * baseline seed, the capital book. Every one of them is an input to a figure
 * that ends up in a regulatory disclosure, and none of them was validated.
 *
 * What that costs is specific. A factor row missing its `value` is `undefined`,
 * and `undefined * quantity` is `NaN`, which propagates silently through every
 * sum it touches and prints as an empty cell — a disclosure with a hole in it
 * that looks like a formatting problem. A row whose `value` is the **string**
 * `"2400"` multiplies fine and then fails a comparison it should have passed.
 * Neither announces itself, and neither is caught by a test that happens to
 * read a different row.
 *
 * So each file is held to a schema **at load**, and a failure is loud and
 * immediate: the process refuses to start, naming the file and the field. That
 * is deliberately the harshest option available. The alternative — carry on
 * and fail at use — turns a typo in a committed data file into a wrong number
 * in a document issued to a bank, which is the one outcome this codebase is
 * built to prevent.
 *
 * Joi, not a second validator. `ajv` sits in devDependencies and is used by the
 * contract tests against the OpenAPI document, which is its own job; the
 * application already speaks Joi at every other boundary, and one validation
 * vocabulary is worth more here than the marginally faster one.
 */

'use strict';

const Joi = require('joi');

/**
 * A finite number, and nothing that merely looks like one.
 *
 * `Joi.number()` accepts the string `"2400"` by default under `convert`, so
 * this is declared strict: a factor table is a committed file in this
 * repository, not a request from outside, and a quoted number in it is a
 * mistake to be shown rather than tidied away. `Infinity` and `NaN` are
 * refused for the same reason.
 */
const strictNumber = Joi.number().strict().custom((value, helpers) =>
  (Number.isFinite(value) ? value : helpers.error('number.infinity')));

/**
 * Hold a loaded reference file to a schema, or refuse to run.
 *
 * @template T
 * @param {string} file  the path as a reader would recognise it, e.g. `data/factors/densities.json`
 * @param {T} value      what was loaded
 * @param {any} schema   the Joi schema it must satisfy
 * @returns {T} the same value — validated, never rewritten
 */
function checked(file, value, schema) {
  const { error } = schema.validate(value, {
    abortEarly: false,
    /* Nothing is converted and nothing is stripped: this function proves the
       committed file is right, and a loader that quietly corrected it would
       hide the very mistake it exists to surface. The value returned is the
       one that was loaded. */
    convert: false,
    stripUnknown: false,
    allowUnknown: false,
  });
  if (!error) return value;

  const faults = error.details.map(d => `  ${d.path.join('.') || '(root)'}: ${d.message}`).join('\n');
  const err = /** @type {any} */ (new Error(
    `Reference data ${file} does not match its schema:\n${faults}`));
  err.statusCode = 500;
  err.code = 'INVALID_REFERENCE_DATA';
  err.remedy = `Fix ${file}, or the schema that describes it, and run the tests.`;
  throw err;
}

/**
 * One row of a factor table.
 *
 * `tier` and `reference` are what make a figure defensible, and the tables
 * declare them in whichever place stops them being repeated: on the table
 * where every row shares a source (all of `refrigerant-gwp` is IPCC AR5), on
 * the row where they differ (`densities` spans Local, Regional and Global).
 * The schema allows both and `factorTableSchema` then insists that every row
 * **resolves** both from one place or the other — which is the invariant that
 * actually matters, and which neither a row-only nor a table-only rule states.
 *
 * `gap` is the opposite of a defect: it records what is known to be missing,
 * which is how the Sri Lankan grid factor ships as a placeholder that says so
 * rather than as a figure that looks settled.
 */
const factorRowSchema = Joi.object({
  value: strictNumber.required(),
  unit: Joi.string().max(60).optional(),
  /* `n/a` is a tier, and only one row uses it: B8 is disabled because it is
     not a module for buildings in ISO 21930 or EN 15978 at all. A disabled
     row has no quality because it has no figure, and forcing it to claim
     Global would be a worse lie than the one this vocabulary prevents. */
  tier: Joi.string().valid('Local', 'Regional', 'Global', 'n/a').optional(),
  reference: Joi.string().min(1).max(4000).optional(),
  gap: Joi.string().max(2000).optional(),
  clientVisible: Joi.boolean().optional(),
  label: Joi.string().max(200).optional(),
  range: Joi.string().max(200).optional(),
  disabled: Joi.boolean().optional(),
  activation: Joi.string().max(2000).optional(),
  note: Joi.string().max(2000).optional(),
}).unknown(false);

/** A block of rows: `rows`, or the `benchmarks` block `water-ef` carries. */
const rowBlockSchema = Joi.object()
  .pattern(Joi.string().max(160), factorRowSchema).min(1);

/**
 * A factor table file, and the one rule the shape alone cannot express:
 * **every row must end up with a tier and a reference.**
 *
 * A row that resolves neither is a number in a regulatory disclosure with no
 * stated quality and no stated source. The methodology statement is extracted
 * from an execution of the engine, so such a row does not go missing quietly —
 * it appears in the document as an unattributable figure, which is worse.
 */
const factorTableSchema = Joi.object({
  table: Joi.string().min(1).max(80).required(),
  description: Joi.string().max(1000).optional(),
  /* Release provenance, required rather than optional.
     A disclosure is only traceable if a reader can say which set of factors
     produced it, and a table that ships without a version and a date has no
     way to say. `status` is the same vocabulary the baseline registry uses:
     `provisional` is a figure standing in until a governed one is released,
     and it is named on every screen that reads it rather than looking
     settled. `provisionalRows` names which rows are the reason, so a table
     is not marked provisional as a whole when one factor is the gap. */
  version: Joi.string().pattern(/^\d+\.\d+\.\d+$/).required(),
  effectiveFrom: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  status: Joi.string().valid('provisional', 'released').required(),
  provisionalRows: Joi.array().items(Joi.string().max(160)).optional(),
  supersedes: Joi.string().max(80).optional(),
  revisionNote: Joi.string().max(2000).optional(),
  unit: Joi.string().max(60).optional(),
  tier: Joi.string().valid('Local', 'Regional', 'Global', 'n/a').optional(),
  reference: Joi.string().min(1).max(4000).optional(),
  note: Joi.string().max(2000).optional(),
  defaultRate: strictNumber.optional(),
  defaultLife: strictNumber.optional(),
  defaultReference: Joi.string().max(4000).optional(),
  rows: rowBlockSchema.required(),
  benchmarks: rowBlockSchema.optional(),
}).unknown(false).custom((table, helpers) => {
  for (const block of ['rows', 'benchmarks']) {
    for (const [key, row] of Object.entries(table[block] || {})) {
      for (const field of ['tier', 'reference']) {
        if (row[field] === undefined && table[field] === undefined) {
          return helpers.error('any.custom', {
            error: new Error(`${block}.${key} resolves no ${field}: declare it on the row, or once on the table`),
          });
        }
      }
    }
  }
  return provisionalRule(table, helpers, ['rows', 'benchmarks']);
});

/**
 * The provisional marker cannot be set or cleared by hand.
 *
 * A table is provisional exactly when a row of it records a gap, and
 * `provisionalRows` names those rows and no others. Left to a person to
 * maintain, this is the field that goes stale first: a placeholder gets
 * replaced by a real value and the warning stays, or a placeholder is added
 * and the table still reads as released. Both are worse than no marker,
 * because a reader trusts it. Shared by every table that carries the marker.
 *
 * @param {any} table
 * @param {import('joi').CustomHelpers} helpers
 * @param {string[]} blocks the row blocks a gap may sit in
 */
function provisionalRule(table, helpers, blocks) {
  const gapRows = blocks
    .flatMap(block => Object.entries(table[block] || {}).filter(([, r]) => r.gap).map(([k]) => k))
    .sort();
  const expected = gapRows.length ? 'provisional' : 'released';
  if (table.status !== expected) {
    return helpers.error('any.custom', {
      error: new Error(gapRows.length
        ? `status is "${table.status}" but rows record a gap (${gapRows.join(', ')}) — it is provisional`
        : `status is "${table.status}" but no row records a gap — it is released`),
    });
  }
  const declared = [...(table.provisionalRows || [])].sort();
  if (declared.join('|') !== gapRows.join('|')) {
    return helpers.error('any.custom', {
      error: new Error(`provisionalRows is [${declared.join(', ')}] but the rows recording a gap are [${gapRows.join(', ')}]`),
    });
  }
  return table;
}

/** A sector key: lower-case, underscore-joined, so it can be a baseline value key with a suffix. */
const sectorKey = Joi.string().pattern(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/).max(60);

/**
 * The sector vocabulary Part A's factor library and the intensity bands are
 * keyed to. Closed: a sector is in this list or it is not held, and a sector
 * that is not held is reported absent with the reason rather than mapped to
 * its nearest neighbour.
 */
const sectorVocabularySchema = Joi.object({
  vocabulary: Joi.string().max(2000).required(),
  version: Joi.string().pattern(/^\d+\.\d+\.\d+$/).required(),
  effectiveFrom: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  rule: Joi.string().max(2000).required(),
  sectors: Joi.object().pattern(sectorKey, Joi.object({
    label: Joi.string().min(1).max(120).required(),
    isic: Joi.string().min(1).max(60).required(),
    parent: sectorKey.optional(),
    aliases: Joi.array().items(Joi.string().min(1).max(60)).required(),
  }).unknown(false)).min(1).required(),
}).unknown(false).custom((doc, helpers) => {
  const seen = new Map();
  for (const [key, s] of Object.entries(doc.sectors)) {
    if (s.parent && !doc.sectors[s.parent]) {
      return helpers.error('any.custom', { error: new Error(`${key}.parent "${s.parent}" is not a sector`) });
    }
    for (const a of s.aliases) {
      const norm = a.toLowerCase();
      if (seen.has(norm)) {
        return helpers.error('any.custom', { error: new Error(`alias "${a}" names both ${seen.get(norm)} and ${key}`) });
      }
      seen.set(norm, key);
    }
  }
  return doc;
});

/**
 * Part A's sector factor table — Option 3's sector-average intensities per
 * unit of revenue, with the asset turnover Option 3c needs. Every row resolves
 * a tier and a reference, as the Part C tables must, and the provisional
 * marker follows the same rule. `currency` is on the table because a factor
 * per unit of one currency applied to an exposure in another is a unit error
 * of exactly the kind the plausibility check exists to catch.
 */
const sectorFactorRowSchema = Joi.object({
  scope1PerRevenue: strictNumber.required(),
  scope2PerRevenue: strictNumber.required(),
  scope3PerRevenue: strictNumber.optional(),
  assetTurnover: strictNumber.required(),
  vintage: Joi.number().integer().min(1990).max(2100).optional(),
  tier: Joi.string().valid('Local', 'Regional', 'Global').optional(),
  reference: Joi.string().min(1).max(4000).optional(),
  gap: Joi.string().max(2000).optional(),
  note: Joi.string().max(2000).optional(),
}).unknown(false).custom((row, helpers) => {
  for (const f of ['scope1PerRevenue', 'scope2PerRevenue', 'scope3PerRevenue', 'assetTurnover']) {
    if (row[f] !== undefined && row[f] < 0) {
      return helpers.error('any.custom', { error: new Error(`${f} cannot be negative`) });
    }
  }
  if (row.assetTurnover === 0) {
    return helpers.error('any.custom', { error: new Error('assetTurnover of zero would make the per-assets factor zero: a sector with no revenue per unit of assets is not a sector') });
  }
  return row;
});

const sectorFactorTableSchema = Joi.object({
  table: Joi.string().valid('sector-factors').required(),
  description: Joi.string().max(2000).optional(),
  version: Joi.string().pattern(/^\d+\.\d+\.\d+$/).required(),
  effectiveFrom: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  status: Joi.string().valid('provisional', 'released').required(),
  provisionalRows: Joi.array().items(sectorKey).optional(),
  supersedes: Joi.string().max(80).optional(),
  revisionNote: Joi.string().max(2000).optional(),
  currency: Joi.string().min(3).max(10).required(),
  unit: Joi.string().max(80).required(),
  vintage: Joi.number().integer().min(1990).max(2100).required(),
  tier: Joi.string().valid('Local', 'Regional', 'Global').optional(),
  reference: Joi.string().min(1).max(4000).optional(),
  rules: Joi.object().pattern(Joi.string().max(40), Joi.string().max(2000)).optional(),
  rows: Joi.object().pattern(sectorKey, sectorFactorRowSchema).min(1).required(),
}).unknown(false).custom((table, helpers) => {
  for (const [key, row] of Object.entries(table.rows)) {
    for (const field of ['tier', 'reference']) {
      if (row[field] === undefined && table[field] === undefined) {
        return helpers.error('any.custom', {
          error: new Error(`rows.${key} resolves no ${field}: declare it on the row, or once on the table`),
        });
      }
    }
  }
  return provisionalRule(table, helpers, ['rows']);
});

module.exports = {
  checked, strictNumber, factorRowSchema, factorTableSchema,
  sectorKey, sectorVocabularySchema, sectorFactorTableSchema,
};
