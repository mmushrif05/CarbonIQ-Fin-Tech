// @ts-check
/**
 * The exposure register — the book §5.2 computes over.
 *
 * §5.2 shipped as two stateless reads: a book had to be posted whole on every
 * call. This is the same engine over rows that persist, and three things
 * follow from that which could not be had before.
 *
 * **Coverage becomes a figure rather than an absence.** PCAF asks for
 * assessed outstanding over *total loans and investments* (DCL p.124). A
 * posted body is only ever what somebody chose to send, so the denominator was
 * unknowable and the response said so. The reporting entity now states its
 * book total for the year, once, and coverage is a percentage of the real
 * thing.
 *
 * **A figure can be traced back.** A disclosed number has to lead to the
 * exposure behind it. That needs the exposure to still exist.
 *
 * **The input and the result are both kept.** Keeping only the input would
 * mean a factor correction or an engine fix silently rewrote a figure somebody
 * had already been shown. Keeping only the result would mean nobody could see
 * what it was computed from. Both are stored, with the instant and the
 * standard edition beside them, so a recomputation is a decision somebody
 * takes rather than something that happens to them — `recompute()` is a
 * separate call and it reports what moved.
 *
 * Lifecycle is deliberately not here. An exposure is recorded and it can be
 * changed; there is no lock and no supersede, because nothing yet publishes
 * from this register and a half-built lifecycle is worse than none. The
 * `status` column exists in migration 0008 so the step that adds the report
 * needs no schema change, `lock()` refuses with a 501 naming it, and
 * `docs/PCAF-PART-A-BUSINESS-LOANS.md` says so rather than leaving it found.
 */

'use strict';

const crypto = require('crypto');
const store = require('../../../platform/database/store');
const repo = require('../infrastructure/store');
const { assessBusinessLoan, STANDARD } = require('../domain/business-loans');
const { rollUp } = require('../domain/business-loans/portfolio');

/** @typedef {import('../../../shared/types').AppError} AppError */

const ASSET_CLASSES = Object.freeze({
  'business-loans-unlisted-equity': assessBusinessLoan,
});

const STATUS = Object.freeze({ RECORDED: 'recorded' });

const _id = () => `pae_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
const _now = () => new Date().toISOString();

function refuse(code, message, statusCode = 400, remedy) {
  const err = /** @type {AppError} */ (new Error(message));
  err.statusCode = statusCode;
  err.code = code;
  if (remedy) err.remedy = remedy;
  return err;
}

/**
 * The engine's input is the exposure without the register's own field.
 *
 * `assetClass` says which engine runs; it is not one of the engine's inputs,
 * and the §5.2 schema is closed, so passing it through would be a named 400 on
 * a field the caller was right to send.
 */
function engineInputOf(input) {
  const out = { ...input };
  delete out.assetClass;
  return out;
}

/** The engine for an asset class, or a refusal naming what is held. */
function engineFor(assetClass) {
  const engine = ASSET_CLASSES[assetClass];
  if (!engine) {
    throw refuse('ASSET_CLASS_NOT_REGISTERED',
      `No Part A engine is registered for asset class "${assetClass}". Registered: `
      + `${Object.keys(ASSET_CLASSES).join(', ')}.`,
      501,
      'Part A is built asset class by asset class; the order is in docs/PCAF-PART-A-RESEARCH.md §11.');
  }
  return engine;
}

/**
 * Record one exposure: keep what was keyed, compute what follows.
 *
 * The engine runs before anything is written, so an exposure the standard
 * refuses never reaches the book — the refusal carries its clause and its
 * remedy exactly as it does on the stateless route, and a register full of
 * rows that cannot be computed is a register nobody can roll up.
 *
 * @param {string} orgId
 * @param {Object} input   one exposure, in the shape POST /business-loans/assess takes
 */
async function record(orgId, input) {
  const assetClass = input.assetClass || 'business-loans-unlisted-equity';
  const engine = engineFor(assetClass);

  const reportingYear = input.reportingYear;
  if (!reportingYear) {
    throw refuse('REPORTING_YEAR_REQUIRED',
      'An exposure is recorded against a reporting year: Part A accounts for positions at one date, the '
      + 'fiscal year-end, and a row with no year belongs to no book.',
      400, 'Supply reportingYear.');
  }

  store.assertWritable();

  const engineInput = engineInputOf(input);
  const result = engine(engineInput);

  const now = _now();
  const cp = result.exposure.counterparty || {};
  const record_ = {
    exposureId: _id(),
    orgId: String(orgId),
    status: STATUS.RECORDED,
    reportingYear: String(reportingYear),
    assetClass,
    /* Lifted to the top of the record because they are what the register is
       browsed and grouped by, and generated columns in 0008 carry them. */
    counterparty: {
      name: cp.name || null, sector: cp.sector || null,
      borrowerType: cp.borrowerType || null,
      financialInstitution: Boolean(cp.financialInstitution),
    },
    financialSector: Boolean(result.financialSector),
    /* Both halves, and the provenance of the computation itself. */
    input: engineInput,
    result,
    computedAt: now,
    standard: STANDARD,
    createdAt: now,
    updatedAt: now,
  };

  await repo.saveExposure(orgId, record_);
  return record_;
}

async function get(orgId, exposureId) {
  const found = await repo.getExposure(orgId, exposureId);
  if (!found) throw refuse('EXPOSURE_NOT_FOUND', `No exposure ${exposureId} in this book.`, 404);
  return found;
}

/**
 * Change a recorded exposure: the input is replaced and the result recomputed.
 *
 * There is no partial update of the result, and there must not be: the figures
 * are derived, and an update that changed one of them without rerunning the
 * engine would put a figure in the book that no equation produces.
 */
async function update(orgId, exposureId, input) {
  const existing = await get(orgId, exposureId);
  store.assertWritable();

  const assetClass = input.assetClass || existing.assetClass;
  const engine = engineFor(assetClass);
  const engineInput = engineInputOf(input);
  const result = engine(engineInput);

  const cp = result.exposure.counterparty || {};
  const now = _now();
  const next = {
    ...existing,
    status: STATUS.RECORDED,
    reportingYear: String(input.reportingYear || existing.reportingYear),
    assetClass,
    counterparty: {
      name: cp.name || null, sector: cp.sector || null,
      borrowerType: cp.borrowerType || null,
      financialInstitution: Boolean(cp.financialInstitution),
    },
    financialSector: Boolean(result.financialSector),
    input: engineInput,
    result,
    computedAt: now,
    standard: STANDARD,
    updatedAt: now,
  };
  await repo.saveExposure(orgId, next);
  return next;
}

async function remove(orgId, exposureId) {
  await get(orgId, exposureId);
  store.assertWritable();
  await repo.removeExposure(orgId, exposureId);
  return { exposureId, removed: true };
}

/**
 * Rerun the engine over the input already held, and say what moved.
 *
 * This is the call that makes a factor correction or an engine fix visible
 * rather than silent. It is deliberately explicit: nothing recomputes on read,
 * so a figure a person was shown yesterday is the figure they see today until
 * somebody decides otherwise and can see the difference.
 */
async function recompute(orgId, exposureId) {
  const existing = await get(orgId, exposureId);
  store.assertWritable();

  const engine = engineFor(existing.assetClass);
  const result = engine(existing.input);

  const before = existing.result.inventory.scope1And2.value;
  const after = result.inventory.scope1And2.value;
  const movementPct = (Number.isFinite(before) && before !== 0)
    ? +(((after - before) / before) * 100).toFixed(4) : null;

  const next = { ...existing, result, computedAt: _now(), standard: STANDARD, updatedAt: _now() };
  await repo.saveExposure(orgId, next);

  return {
    exposure: next,
    movement: {
      basis: 'financed scope 1 and 2',
      before, after,
      movementPct,
      moved: before !== after,
      previousStandard: existing.standard,
      standard: STANDARD,
      note: before === after
        ? 'The engine produced the same figure from the same input.'
        : 'The figure moved on the same input. The cause is a change in the engine or in a factor, not '
          + 'in what the bank recorded.',
    },
  };
}

// ---------------------------------------------------------------------------
// The book total — what coverage is a percentage of
// ---------------------------------------------------------------------------

/**
 * State the entity's own totals for a reporting year.
 *
 * `totalLoansAndInvestments` is a claim the reporting entity makes about its
 * own balance sheet and nothing here can derive it. It is recorded as declared
 * — who stated it and when — because coverage rests on it and a reader is
 * entitled to know it was asserted rather than measured.
 */
async function stateBook(orgId, { reportingYear, totalLoansAndInvestments, currency, statedBy, note }) {
  if (!reportingYear) throw refuse('REPORTING_YEAR_REQUIRED', 'State which reporting year this book total is for.');
  const total = Number(totalLoansAndInvestments);
  if (!Number.isFinite(total) || total <= 0) {
    throw refuse('BOOK_TOTAL_INVALID',
      'Total loans and investments must be a positive number. Coverage is assessed outstanding over the '
      + 'whole book (PCAF Disclosure Checklist Part A, p.124); a book of zero has no coverage rather than '
      + 'full coverage.');
  }
  store.assertWritable();

  const now = _now();
  const existing = await repo.getBook(orgId, reportingYear);
  const record_ = {
    reportingYear: String(reportingYear),
    orgId: String(orgId),
    totalLoansAndInvestments: total,
    currency: currency || null,
    basis: 'declared',
    basisNote: 'Stated by the reporting entity. Nothing in this system can derive an institution\'s total '
      + 'loans and investments, so it is recorded as declared and travels with the coverage figure it '
      + 'produces.',
    statedBy: statedBy || null,
    note: note || null,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };
  await repo.saveBook(orgId, record_);
  return record_;
}

async function getBook(orgId, reportingYear) {
  return repo.getBook(orgId, reportingYear);
}

// ---------------------------------------------------------------------------
// The reporting-year position
// ---------------------------------------------------------------------------

/**
 * The book for a reporting year, rolled up from what is stored.
 *
 * The roll-up reads the **projection** — the field set migration 0008 computes
 * into a column at write time — rather than the whole record. A stored
 * exposure is several kilobytes, most of it the provenance trace, and the
 * difference at ten thousand rows is a second against forty milliseconds. It
 * is the same defect Part C shipped once before `partc_assessments.rollup`
 * existed, and `tests/parta-register.test.js` proves the projected roll-up
 * equals the whole-record roll-up figure for figure.
 *
 * A year holding no exposures is refused rather than returned as a position of
 * zero: "we lent nothing" and "we have not measured yet" are different claims
 * and only one of them is true.
 */
async function position(orgId, reportingYear, opts = {}) {
  const { improvementTarget } = /** @type {{improvementTarget?: number}} */ (opts);
  const rows = await repo.rollupsForYear(orgId, reportingYear);
  if (!rows.length) {
    throw refuse('EMPTY_YEAR',
      `No exposures are recorded for ${reportingYear}. An empty year is not a position of zero — a book `
      + 'with nothing in it and a book nobody has measured are different claims.',
      409, 'Record exposures for this year first.');
  }

  const book = await repo.getBook(orgId, reportingYear);
  const rolled = rollUp(rows.map(inflate), {
    totalLoansAndInvestments: book ? book.totalLoansAndInvestments : undefined,
    improvementTarget,
  });

  return {
    reportingYear: String(reportingYear),
    ...rolled,
    coverage: {
      ...rolled.coverage,
      ...(book
        ? { totalLoansAndInvestments: book.totalLoansAndInvestments, currency: book.currency, basis: book.basis, statedBy: book.statedBy }
        : { remedy: 'State the reporting year\'s total loans and investments at PUT /v1/pcaf/part-a/book.' }),
    },
    exposures: rows.length,
    source: 'Recorded exposures, read from the stored roll-up projection.',
  };
}

/**
 * A projected row, in the shape the roll-up reads.
 *
 * Almost nothing, and that is the point: every field in the projection is a
 * path into the stored record, so a projected row already carries
 * `result.exposure`, `result.inventory` and `result.validation` exactly as the
 * whole record does. Had the column held a flattened shape of its own, this
 * function would be a second place that knows the roll-up's inputs, and the
 * two would drift.
 *
 * Two normalisations, both because `jsonb_strip_nulls` removes a null field
 * and leaves the object that held it:
 *
 *   an exposure with no attribution factor (Option 3b or 3c) projects as
 *   `attribution: {}`, which is truthy — so the count of exposures carrying no
 *   factor would come back zero, which is the opposite of true;
 *
 *   an exposure with no findings projects with no `findings` key at all, and
 *   the improvement plan iterates it.
 */
function inflate(row) {
  const r = row.result || {};
  const attribution = (r.attribution && r.attribution.value !== null && r.attribution.value !== undefined)
    ? r.attribution : null;
  const validation = r.validation || {};
  return {
    ...r,
    exposure: {
      ...(r.exposure || {}),
      identifiers: { id: row.exposureId },
      reportingYear: row.reportingYear || null,
    },
    attribution,
    validation: { verdict: validation.verdict || 'clean', findings: validation.findings || [] },
    financialSector: Boolean(row.financialSector),
  };
}

/**
 * A page of a year's book, for a list a person reads.
 *
 * Whole records, not the projection, and the reason is in
 * `infrastructure/store.js`: a page carries a cursor and a filter and has
 * nowhere to ask for a field list. Fifty rows is the right place to pay that
 * and a whole book is not, which is why `position()` goes through the
 * projection instead.
 */
async function listExposures(orgId, reportingYear, opts = {}) {
  const { limit, cursor } = /** @type {{limit?: number, cursor?: string}} */ (opts);
  return repo.pageForYear(orgId, reportingYear, { limit, cursor });
}

/** Which reporting years this book holds anything for. */
async function years(orgId) {
  const found = await repo.years(orgId);
  const books = await repo.listBooks(orgId);
  const stated = new Set(books.map(b => String(b.reportingYear)));
  return found.map(y => ({ reportingYear: y, bookTotalStated: stated.has(y) }));
}

/** Not built, and it says which step builds it rather than pretending. */
async function lock() {
  throw refuse('LIFECYCLE_NOT_BUILT',
    'An exposure cannot be locked yet. The register records and changes exposures; the lock-and-supersede '
    + 'lifecycle belongs with the report that publishes from it, and nothing publishes from this register '
    + 'yet. The status column exists in migration 0008 so that step needs no schema change.',
    501,
    'See docs/PCAF-PART-A-BUSINESS-LOANS.md §7 and docs/PCAF-PART-A-RESEARCH.md §11.');
}

module.exports = {
  ASSET_CLASSES, STATUS,
  record, get, update, remove, recompute, listExposures,
  stateBook, getBook,
  position, years, lock,
  _inflate: inflate,
};
