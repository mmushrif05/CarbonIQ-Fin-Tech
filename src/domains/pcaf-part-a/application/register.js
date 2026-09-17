// @ts-check
/**
 * The exposure register — one book, every built Part A class.
 *
 * Built for §5.2 and now shared: a §5.4 property, a §5.3 project and a §5.1
 * holding are rows in the same table with `assetClass` naming the engine, and
 * `./register-classes` gives each its engine, its preparation and the adapter
 * onto the one shape the projection, the roll-up and the screen read. The
 * position is rolled up **per class** from one read of the projection and is
 * never summed or averaged across classes — the score tables differ, and a
 * mean of two categories from two tables means nothing.
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
 * The review lifecycle — recorded → under review → approved, an approved
 * exposure frozen until reopened with a reason — lives in
 * `register-lifecycle.js`; this file owns the read and the write around it.
 */

'use strict';

const crypto = require('crypto');
const store = require('../../../platform/database/store');
const repo = require('../infrastructure/store');
const classes = require('./register-classes');
const { rollUp } = require('../domain/business-loans/portfolio');
const { movementSignificance } = require('../domain/recalculation');
const settingsService = require('./parta-settings');
const { waysToRaise } = require('../domain/business-loans/raise');

/** @typedef {import('../../../shared/types').AppError} AppError */

/* The classes this one register holds — each with its engine, its
   preparation and its adapter onto the register's shape (./register-classes). */
const ASSET_CLASSES = Object.freeze(Object.fromEntries(
  Object.entries(classes.CLASSES).map(([k, c]) => [k, c.engine])));
const DEFAULT_CLASS = classes.DEFAULT_CLASS;

const lifecycle = require('./register-lifecycle');
const { STATUS, TRANSITIONS, assertNotApproved, withMove, approvalOf } = lifecycle;

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
 * One loan, once.
 *
 * A facility keyed in twice doubles its financed emissions and its
 * outstanding, and lifts coverage on money the bank does not lend twice — a
 * register wrong in the direction that flatters it. The bank's own reference
 * (`identifiers.accountNumber`) is the key; where the bank gives none, nothing
 * here can tell two loans apart and nothing pretends to. Uniqueness is on the
 * loan, never the counterparty: two facilities to one borrower are two rows.
 *
 * This is the check that names the existing exposure. Migration 0009's partial
 * unique index is the one that holds when two requests race for the same
 * reference on PostgreSQL; the other three stores read and then write, which
 * narrows that window without shutting it.
 */
async function refuseDuplicateLoan(orgId, reportingYear, engineInput, exceptId) {
  const ref = engineInput.identifiers && engineInput.identifiers.accountNumber;
  if (!ref) return;
  const rows = await store.query(repo.EXPOSURES, String(orgId), {
    where: { reportingYear, 'input.identifiers.accountNumber': String(ref) },
    fields: ['exposureId', 'result.exposure.counterparty.name'],
  });
  const clash = rows.find(r => r.exposureId !== exceptId);
  if (!clash) return;
  throw refuse('DUPLICATE_LOAN',
    `Facility ${ref} is already recorded for ${reportingYear} as exposure ${clash.exposureId}`
    + `${clash.result && clash.result.exposure && clash.result.exposure.counterparty && clash.result.exposure.counterparty.name
      ? ` (${clash.result.exposure.counterparty.name})` : ''}. Recording it again would count its `
    + 'financed emissions and its outstanding twice and lift coverage on money the bank does not lend twice.',
    409,
    `Change the existing exposure at PUT /v1/pcaf/part-a/exposures/${clash.exposureId}, or give this one `
    + 'its own facility reference if it is a different loan.');
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
  const assetClass = input.assetClass || DEFAULT_CLASS;
  const cls = classes.classFor(assetClass);

  const reportingYear = input.reportingYear;
  if (!reportingYear) {
    throw refuse('REPORTING_YEAR_REQUIRED',
      'An exposure is recorded against a reporting year: Part A accounts for positions at one date, the '
      + 'fiscal year-end, and a row with no year belongs to no book.',
      400, 'Supply reportingYear.');
  }

  store.assertWritable();

  const { engineInput, result } = await classes.run(assetClass, input, { orgId });

  await refuseDuplicateLoan(orgId, String(reportingYear), engineInput, null);

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
    /* The bank's own SLFRS S2 classification of this loan. Top-level rather
       than inside the engine's result because the engine did not decide it,
       and the projection carries it so the roll-up can sum §29(b)–(d) without
       reading every record whole. */
    climate: projections.normaliseExposureClimate(input.climate),
    /* The facility as recorded — a fact about the loan, like the climate
       block; what the engine read off it is under result.facility. */
    facility: input.facility || null,
    /* Both halves, and the provenance of the computation itself. */
    input: engineInput,
    result,
    computedAt: now,
    standard: cls.standard,
    createdAt: now,
    updatedAt: now,
  };

  await repo.saveExposure(orgId, record_);
  return record_;
}

/**
 * The engine's answer for a candidate exposure, before anything is recorded.
 *
 * The same path `record()` takes — the class's preparation, its engine, its
 * adapter — over the same validated body, and then nothing: no id, no row,
 * no duplicate check, so the same request twice gives the same answer and
 * moves nothing. It is what the record form shows beneath itself as the
 * fields change, and what makes a refusal something a bank sees before
 * pressing Record rather than after. For §5.2 the answer carries what would
 * raise the score, read off Table 5.2-1.
 *
 * @param {string} orgId
 * @param {Record<string, any>} input
 */
async function preview(orgId, input) {
  const assetClass = input.assetClass || DEFAULT_CLASS;
  const cls = classes.classFor(assetClass);
  const { engineInput, result } = await classes.run(assetClass, input, { orgId });
  const dq = result && result.inventory && result.inventory.dataQuality;
  const raise = assetClass === DEFAULT_CLASS && dq && dq.scope1And2
    ? waysToRaise(dq.scope1And2.option) : null;
  return { assetClass, standard: cls.standard, input: engineInput, result, raise, stored: false };
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
  assertNotApproved(existing, 'changed');

  const assetClass = input.assetClass || existing.assetClass;
  const cls = classes.classFor(assetClass);
  /* Like the climate block: an edit that does not mention the facility leaves
     the recorded one standing, and one that sends null clears it. */
  const facility = 'facility' in input ? (input.facility || null) : (existing.facility || null);
  const { engineInput, result } = await classes.run(assetClass, { ...input, facility: facility || undefined }, { orgId });

  await refuseDuplicateLoan(orgId, String(input.reportingYear || existing.reportingYear), engineInput, exposureId);

  const cp = result.exposure.counterparty || {};
  const now = _now();
  /* A changed input restarts review, and the move is on the trail. */
  const move = (existing.status || STATUS.RECORDED) === STATUS.RECORDED
    ? { status: STATUS.RECORDED, approval: existing.approval || null }
    : withMove(existing, STATUS.RECORDED, { reason: 'Input changed; review restarts.' });
  const next = {
    ...existing,
    ...move,
    reportingYear: String(input.reportingYear || existing.reportingYear),
    assetClass,
    counterparty: {
      name: cp.name || null, sector: cp.sector || null,
      borrowerType: cp.borrowerType || null,
      financialInstitution: Boolean(cp.financialInstitution),
    },
    financialSector: Boolean(result.financialSector),
    /* A change that carries no climate block leaves the one already recorded
       standing: the classification is a separate judgement from the figures,
       and an edit to an outstanding amount must not silently unclassify a loan. */
    climate: 'climate' in input
      ? projections.normaliseExposureClimate(input.climate)
      : (existing.climate || null),
    facility,
    input: engineInput,
    result,
    computedAt: now,
    standard: cls.standard,
    updatedAt: now,
  };
  await repo.saveExposure(orgId, next);
  return next;
}

async function remove(orgId, exposureId) {
  const existing = await get(orgId, exposureId);
  store.assertWritable();
  assertNotApproved(existing, 'removed');
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
  assertNotApproved(existing, 'recomputed');

  /* The entity's own significance threshold, so a movement can be judged
     against the protocol it publishes rather than a figure hidden in code. */
  const settings = await settingsService.getSettings(orgId);

  const cls = classes.classFor(existing.assetClass);
  /* The band and the baselines in force now, not the ones that applied when
     it was recorded: a newly released figure is exactly what a recomputation
     is for. */
  const { result } = await classes.run(existing.assetClass, { ...existing.input, facility: existing.facility || undefined }, { orgId });

  /* Every line and both scores, not the headline alone: a factor that reaches
     only scope 3, or a table that re-scores one option, would otherwise be
     reported as "nothing moved" — which is the one thing this call exists to
     never say untruthfully. */
  const val = x => (x && Number.isFinite(x.value) ? x.value : null);
  const LINES = ['scope1', 'scope2', 'scope1And2', 'scope3', 'removals', 'creditsRetired', 'creditsGenerated'];
  const movementOf = k => {
    const before = val(existing.result.inventory[k]);
    const after = val(result.inventory[k]);
    return {
      line: k, before, after,
      moved: before !== after,
      movementPct: (Number.isFinite(before) && before !== 0 && Number.isFinite(after))
        ? +(((after - before) / before) * 100).toFixed(4) : null,
    };
  };
  const lines = LINES.map(movementOf);
  const dqOf = r => ({
    scope1And2: r.inventory.dataQuality.scope1And2.score,
    scope3: r.inventory.dataQuality.scope3 && !r.inventory.dataQuality.scope3.absent
      ? r.inventory.dataQuality.scope3.score : null,
  });
  const dqBefore = dqOf(existing.result), dqAfter = dqOf(result);
  const dataQuality = {
    before: dqBefore, after: dqAfter,
    moved: dqBefore.scope1And2 !== dqAfter.scope1And2 || dqBefore.scope3 !== dqAfter.scope3,
  };
  /* Findings too: a band released since, or a factor that aged past the
     threshold, moves what the data says about itself and nothing else. */
  const codesOf = r => [...new Set(((r.validation || {}).findings || []).map(f => f.code))].sort();
  const findings = { before: codesOf(existing.result), after: codesOf(result) };
  findings.moved = findings.before.join('|') !== findings.after.join('|');
  const moved = lines.some(l => l.moved) || dataQuality.moved || findings.moved;

  const next = { ...existing, result, computedAt: _now(), standard: cls.standard, updatedAt: _now() };
  await repo.saveExposure(orgId, next);

  const headline = movementOf('scope1And2');
  /* The largest line movement is judged beside the headline, because a change
     reaching only scope 3 can be significant while scope 1 and 2 did not. */
  const largestLinePct = lines
    .map(l => Number(l.movementPct))
    .filter(p => Number.isFinite(p))
    .reduce((m, p) => (Math.abs(p) > Math.abs(m) ? p : m), 0);
  return {
    exposure: next,
    movement: {
      basis: 'every reporting line, both data-quality scores and the findings',
      /* The headline stays where callers first read it. */
      before: headline.before, after: headline.after, movementPct: headline.movementPct,
      lines, dataQuality, findings,
      moved,
      significance: movementSignificance(
        { moved, headlinePct: headline.movementPct, largestLinePct },
        settings.significanceThresholdPct),
      previousStandard: existing.standard,
      standard: cls.standard,
      note: !moved
        ? 'The engine produced the same figures and the same scores from the same input.'
        : `Moved on the same input: ${[...lines.filter(l => l.moved).map(l => l.line), ...(dataQuality.moved ? ['data quality'] : []), ...(findings.moved ? ['findings'] : [])].join(', ')}. `
          + 'The cause is a change in the engine, in a factor or in a baseline, not in what the bank recorded.',
    },
  };
}

// ---------------------------------------------------------------------------
// The book total — what coverage is a percentage of — lives in ./parta-book
// and is re-exported below, so every caller keeps its import.
// ---------------------------------------------------------------------------

const { stateBook, getBook } = require('./parta-book');
const projections = require('./register-projections');
const { undrawnOf, numeratorBasisOf } = require('./register-facility');

// The entity's settings live in ./parta-settings, re-exported below.
const { DEFAULT_SETTINGS, getSettings, saveSettings, installIllustrativeClimate } = settingsService;

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
  const { improvementTarget, assetClass = DEFAULT_CLASS } = /** @type {{improvementTarget?: number, assetClass?: string}} */ (opts);
  const cls = classes.classFor(assetClass);
  const all = await repo.rollupsForYear(orgId, reportingYear);
  const rows = all.filter(r => (r.assetClass || DEFAULT_CLASS) === assetClass);
  if (!rows.length) {
    const others = [...new Set(all.map(r => r.assetClass || DEFAULT_CLASS))];
    throw refuse('EMPTY_YEAR',
      `No ${cls.label} (${cls.section}) exposures are recorded for ${reportingYear}. An empty year is not a position `
      + 'of zero — a book with nothing in it and a book nobody has measured are different claims.'
      + (others.length ? ` The year holds exposures in: ${others.join(', ')}.` : ''),
      409, 'Record exposures of this class for this year first.');
  }
  const book = await repo.getBook(orgId, reportingYear);
  return rollClass(cls, rows, book, reportingYear, improvementTarget);
}

/**
 * Every class's position for a reporting year, from one read of the
 * projection — the consolidated disclosure's question. Each class is rolled
 * up alone, on its own label, groupings and score table; a class the year
 * holds nothing of is `null`, never a position of zero, and nothing here
 * sums or averages across classes.
 */
async function positions(orgId, reportingYear, opts = {}) {
  const { improvementTarget } = /** @type {{improvementTarget?: number}} */ (opts);
  const all = await repo.rollupsForYear(orgId, reportingYear);
  const book = all.length ? await repo.getBook(orgId, reportingYear) : null;
  const byClass = {};
  for (const cls of Object.values(classes.CLASSES)) {
    const rows = all.filter(r => (r.assetClass || DEFAULT_CLASS) === cls.assetClass);
    byClass[cls.assetClass] = rows.length ? rollClass(cls, rows, book, reportingYear, improvementTarget) : null;
  }
  return { reportingYear: String(reportingYear), byClass, exposures: all.length };
}

/** One class's rows rolled up on the class's own binding. */
function rollClass(cls, rows, book, reportingYear, improvementTarget) {
  const inflated = rows.map(projections.inflate);
  const rolled = rollUp(inflated, {
    ...cls.rollUp,
    totalLoansAndInvestments: book ? book.totalLoansAndInvestments : undefined,
    improvementTarget,
  });
  return {
    reportingYear: String(reportingYear),
    ...rolled,
    section: cls.section,
    label: cls.label,
    coverage: {
      ...rolled.coverage,
      ...(book
        ? { totalLoansAndInvestments: book.totalLoansAndInvestments, currency: book.currency, basis: book.basis, statedBy: book.statedBy }
        : { remedy: 'State the reporting year\'s total loans and investments at PUT /v1/pcaf/part-a/book.' }),
    },
    exposures: rows.length,
    approval: approvalOf(rows),
    /* §6.2, summed on its own and never into the lines above; and how many
       numerators were taken from a schedule rather than a ledger. */
    undrawnCommitments: undrawnOf(inflated),
    numeratorBasis: numeratorBasisOf(inflated),
    source: 'Recorded exposures, read from the stored roll-up projection.',
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
  const { limit, cursor, assetClass } = /** @type {{limit?: number, cursor?: string, assetClass?: string}} */ (opts);
  if (assetClass) classes.classFor(assetClass);
  return repo.pageForYear(orgId, reportingYear, { limit, cursor, assetClass });
}

/** Which reporting years this book holds anything for, and how many of each class. */
async function years(orgId) {
  const held = await repo.yearsHeld(orgId);
  const books = await repo.listBooks(orgId);
  const stated = new Set(books.map(b => String(b.reportingYear)));
  return held.map(y => ({ reportingYear: y.reportingYear, bookTotalStated: stated.has(y.reportingYear), exposures: y.exposures, byClass: y.byClass }));
}

/** Not built, and it says which step builds it rather than pretending. */
/**
 * One move through review; the rules live in `register-lifecycle.js`.
 * @param {string} orgId
 * @param {string} exposureId
 * @param {{status: string, reason?: string|null, actor?: string|null}} move
 */
async function setStatus(orgId, exposureId, move) {
  const existing = await get(orgId, exposureId);
  store.assertWritable();
  const next = { ...existing, ...lifecycle.move(existing, move), updatedAt: _now() };
  await repo.saveExposure(orgId, next);
  return next;
}

module.exports = {
  preview,
  ASSET_CLASSES, DEFAULT_CLASS, STATUS, TRANSITIONS, DEFAULT_SETTINGS,
  record, get, update, remove, recompute, setStatus, listExposures,
  rows: projections.rows, rowsByClass: projections.rowsByClass, climateRows: projections.climateRows,
  stateBook, getBook, getSettings, saveSettings, installIllustrativeClimate,
  position, positions, years,
  classes: classes.list,
  _inflate: projections.inflate,
};
