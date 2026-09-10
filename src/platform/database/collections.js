// @ts-check
/**
 * The collection registry — the one place that says which table a collection
 * lives in, which JSON fields are lifted into indexed columns, and what each
 * record refers to.
 *
 * A collection that is not registered here cannot be written: the store
 * refuses it with UNKNOWN_COLLECTION rather than creating a table on the fly,
 * because a table nobody designed has no keys, no references and no place in
 * a backfill order. `tests/data-layer.test.js` asserts every COLLECTION
 * constant declared in `services/` appears here.
 *
 * `keys` maps a JSON field to the generated column that carries it in
 * `migrations/0001_initial.sql`. The column is generated from the JSON, so
 * the two cannot disagree; a query on a registered key uses the index, a
 * query on any other field walks the JSONB.
 *
 * `dependsOn` is the referential order — what must exist before a record here
 * can. The backfill walks it, and the FK constraints in the migration enforce it.
 */

'use strict';

/** @typedef {import('../../shared/types').AppError} AppError */

const COLLECTIONS = Object.freeze({
  settings:            { table: 'partc_settings',      keys: {}, dependsOn: [] },
  clients:             { table: 'partc_clients',       keys: {}, dependsOn: [] },
  projects:            { table: 'partc_projects',      keys: { clientId: 'client_id' }, dependsOn: ['clients'] },
  boqRevisions:        { table: 'partc_boq_revisions', keys: { projectId: 'project_id' }, dependsOn: ['projects'] },
  assessments:         { table: 'partc_assessments',
    keys: { projectId: 'project_id', policyId: 'policy_id', boqRevisionId: 'boq_revision_id',
      reportingYear: 'reporting_year', status: 'status' },
    dependsOn: ['projects', 'boqRevisions'],
    /* A stored projection: a column holding exactly these fields, computed
       at write time by partc_assessment_rollup() in the migration. A query
       asking for exactly this set reads the column instead of the record.
       `rows[].x` picks one field of every element of an array; that notation
       is honoured by a stored projection and by the in-memory store, and is
       refused by the on-the-fly SQL projection. */
    projections: {
      rollup: { column: 'rollup', fields: [
        'assessmentId', 'status', 'policyId', 'policyRef', 'lineType', 'clientName', 'projectName',
        'boqRevisionLabel', 'version', 'lockedAt', 'restatement', 'summary', 'moduleValues', 'createdAt',
        'dataQuality.option', 'dataQuality.score',
        'dqScoring.byGhgScope.scope1and2.score', 'dqScoring.byGhgScope.scope3.score',
        'dqScoring.internalAid.rows[].applies', 'dqScoring.internalAid.rows[].stage', 'dqScoring.internalAid.rows[].input',
        'dqScoring.internalAid.rows[].ghgScope', 'dqScoring.internalAid.rows[].line', 'dqScoring.internalAid.rows[].basis',
        'dqScoring.internalAid.rows[].source', 'dqScoring.internalAid.rows[].strength',
      ] },
    } },
  capital_portfolios:  { table: 'capital_portfolios',  keys: {}, dependsOn: [] },
  capital_investments: { table: 'capital_investments', keys: { portfolioId: 'portfolio_id', status: 'status' },
    dependsOn: ['capital_portfolios'] },
  capital_payments:    { table: 'capital_payments',    keys: { portfolioId: 'portfolio_id', investmentId: 'investment_id' },
    dependsOn: ['capital_portfolios', 'capital_investments'] },
  gcf_projects:        { table: 'gcf_projects',        keys: {}, dependsOn: [] },
  gcf_entity:          { table: 'gcf_entity',          keys: {}, dependsOn: [] },
  assurance:           { table: 'assurance_declarations', keys: {}, dependsOn: [] },
  /* 0002 — what still lived only in Firebase. Keys share one partition ('_')
     because they are looked up by hash, not by organisation. */
  api_keys:            { table: 'api_keys',          keys: { orgId: 'owner_org_id', active: 'active' }, dependsOn: [] },
  partc_runs:          { table: 'partc_runs',        keys: { status: 'status' }, dependsOn: [] },
  partc_learnings:     { table: 'partc_learnings',   keys: {}, dependsOn: [] },
  partc_benchmarks:    { table: 'partc_benchmarks',  keys: { region: 'region', projectType: 'project_type' }, dependsOn: [] },
});

function definition(collection) {
  const def = COLLECTIONS[collection];
  if (!def) {
    const err = /** @type {AppError} */ (new Error(`Collection "${collection}" is not registered in src/platform/database/collections.js.`));
    err.statusCode = 500;
    err.code = 'UNKNOWN_COLLECTION';
    throw err;
  }
  return def;
}

function tableFor(collection) { return definition(collection).table; }

/** The stored projection whose field set is exactly `fields`, if the collection has one. */
function storedProjection(collection, fields) {
  const def = definition(collection);
  if (!def.projections || !Array.isArray(fields)) return null;
  const want = [...new Set(fields)].sort().join('\n');
  for (const p of Object.values(def.projections)) {
    if ([...p.fields].sort().join('\n') === want) return p;
  }
  return null;
}

/** Collections in an order that satisfies every dependsOn — parents first. */
function inReferentialOrder() {
  const out = [];
  const seen = new Set();
  const visit = name => {
    if (seen.has(name)) return;
    seen.add(name);
    for (const dep of COLLECTIONS[name].dependsOn) visit(dep);
    out.push(name);
  };
  Object.keys(COLLECTIONS).forEach(visit);
  return out;
}

module.exports = { COLLECTIONS, definition, tableFor, storedProjection, inReferentialOrder, names: () => Object.keys(COLLECTIONS) };
