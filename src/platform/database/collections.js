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
  capital_investments: { table: 'capital_investments',
    /* `origin.system` and `origin.recordId` are generated columns in 0001 and
       carry the unique index that stops one pipeline record being adopted
       twice. They were columns the registry did not know about, so a lookup
       by origin walked the JSONB and the index sat unused. */
    keys: { portfolioId: 'portfolio_id', status: 'status',
      'origin.system': 'origin_system', 'origin.recordId': 'origin_record_id' },
    dependsOn: ['capital_portfolios'] },
  capital_payments:    { table: 'capital_payments',    keys: { portfolioId: 'portfolio_id', investmentId: 'investment_id' },
    dependsOn: ['capital_portfolios', 'capital_investments'] },
  gcf_projects:        { table: 'gcf_projects',        keys: {}, dependsOn: [] },
  gcf_entity:          { table: 'gcf_entity',          keys: {}, dependsOn: [] },
  assurance:           { table: 'assurance_declarations', keys: {}, dependsOn: [] },
  /* 0002 — what still lived only in Firebase. Keys share one partition ('_')
     because they are looked up by hash, not by organisation. */
  api_keys:            { table: 'api_keys',          keys: { orgId: 'owner_org_id', active: 'active' }, dependsOn: [] },
  /* People and their sessions share the api_keys shape: one partition, the
     owning organisation inside the record and lifted out by a column. Both
     are looked up before an organisation is known — a login by email, a
     request by the token it carries. */
  users:               { table: 'users',             keys: { email: 'email', orgId: 'owner_org_id', role: 'role', active: 'active' }, dependsOn: [] },
  sessions:            { table: 'sessions',          keys: { userId: 'user_id', orgId: 'owner_org_id', expiresAt: 'expires_at' }, dependsOn: [] },
  /* 0007 — the register of who asked to see the product. One partition, like
     the two above and for the same reason: a signup is found by address,
     before any organisation is known. It is not the visitor's account —
     `users` holds that — and the two are kept apart so that removing an
     account does not erase the fact that the question was asked. */
  preview_signups:     { table: 'preview_signups',  keys: { email: 'email' }, dependsOn: [] },
  partc_runs:          { table: 'partc_runs',        keys: { status: 'status' }, dependsOn: [] },
  partc_learnings:     { table: 'partc_learnings',   keys: {}, dependsOn: [] },
  partc_benchmarks:    { table: 'partc_benchmarks',  keys: { region: 'region', projectType: 'project_type' }, dependsOn: [] },
  /* 0005 — the five record types the lending domain and the agent loop used
     to write straight to Firebase, past this seam. Every one of those writers
     answered a deployment without Firebase by returning quietly, so the
     record was discarded and the caller was told it had been saved. */
  fintech_projects:    { table: 'fintech_projects',   keys: { region: 'region', phase: 'phase' }, dependsOn: [] },
  /* No dependsOn: a monitoring entry may name a project held in the core
     engine and never created here, and a foreign key would refuse it. */
  fintech_monitoring:  { table: 'fintech_monitoring', keys: { projectId: 'project_id', year: 'year' }, dependsOn: [] },
  agent_runs:          { table: 'agent_runs',         keys: { agent: 'agent', status: 'status' }, dependsOn: [] },
  pipeline_runs:       { table: 'pipeline_runs',      keys: { status: 'status' }, dependsOn: [] },
  webhooks:            { table: 'webhooks',           keys: { active: 'active' }, dependsOn: [] },
  /* 0006 — the master baseline table. A global or country baseline lives in
     the shared partition because it is the market's figure and every
     organisation resolves against it; an organisation's own lives under its
     own id. `key` identifies which baseline a row is a version of. */
  baselines:           { table: 'baselines',
    keys: { key: 'baseline_key', metric: 'metric', scope: 'scope', country: 'country', status: 'status' },
    dependsOn: [] },
  /* 0008 — the PCAF Part A exposure register. §5.2 shipped as two stateless
     reads, so a book had to be posted whole on every call; coverage could not
     be stated, because coverage is over the whole book and a posted body is
     only what somebody chose to send. `parta_book` is its own collection and
     not a field on a settings blob, because "we have not stated the book
     total" and "the book total is zero" are different answers and coverage
     against a zero book is unanswerable rather than 100%. */
  parta_exposures:     { table: 'parta_exposures',
    keys: { reportingYear: 'reporting_year', assetClass: 'asset_class', status: 'status',
      'counterparty.name': 'counterparty', 'counterparty.sector': 'sector',
      /* 0009 — the bank's own reference for the facility, carrying the
         partial unique index that stops one loan being recorded twice in a
         year. Under `input`, not `result`: it is the register's field. */
      'input.identifiers.accountNumber': 'account_number' },
    dependsOn: [],
    /* A stored projection, computed at write time by parta_exposure_rollup()
       in migration 0008. A stored exposure is several kilobytes, most of it
       the provenance trace; the reporting-year roll-up reads this set and
       nothing else. Every entry is a path INTO the record, which is what lets
       the in-memory store project the same set with no column at all and
       produce the same rows. Held to the SQL function by a test — a field
       added to one and not the other would silently return a projection
       missing it. */
    projections: {
      rollup: { column: 'rollup', fields: [
        'exposureId', 'status', 'reportingYear', 'assetClass', 'financialSector', 'createdAt',
        'result.exposure.kind', 'result.exposure.instrument',
        'result.exposure.counterparty.name', 'result.exposure.counterparty.sector',
        'result.exposure.counterparty.naceL2', 'result.exposure.counterparty.borrowerType',
        'result.exposure.counterparty.financialInstitution',
        'result.exposure.outstanding.value',
        'result.attribution.value',
        'result.inventory.scope1.value', 'result.inventory.scope1.absent',
        'result.inventory.scope2.value', 'result.inventory.scope2.absent',
        'result.inventory.scope1And2.value', 'result.inventory.scope1And2.absent',
        'result.inventory.scope3.value', 'result.inventory.scope3.absent',
        'result.inventory.removals.value', 'result.inventory.removals.absent',
        'result.inventory.creditsRetired.value', 'result.inventory.creditsRetired.absent',
        'result.inventory.creditsGenerated.value', 'result.inventory.creditsGenerated.absent',
        'result.inventory.dataQuality.scope1And2.option', 'result.inventory.dataQuality.scope1And2.score',
        'result.inventory.dataQuality.scope3.option', 'result.inventory.dataQuality.scope3.score',
        'result.inventory.dataQuality.scope3.absent',
        'result.validation.verdict',
        'result.validation.findings[].code', 'result.validation.findings[].severity',
        'result.validation.findings[].field', 'result.validation.findings[].remedy',
        'result.validation.findings[].reference',
      ] },
    } },
  parta_book:          { table: 'parta_book', keys: { reportingYear: 'reporting_year' }, dependsOn: [] },
  parta_settings:      { table: 'parta_settings', keys: {}, dependsOn: [] },
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
