// @ts-check
/**
 * The §5.9 sovereign exposure register — the book the position is rolled up
 * over.
 *
 * S2 shipped the engine as a stateless read; this persists what it computes so
 * coverage can be stated over the whole book and a disclosed figure can be
 * traced to a holding that still exists. It follows every rule the §5.2
 * register established: the input the bank keyed and the result the engine
 * computed are both kept; nothing recomputes on read; `recompute()` is a
 * separate call that reports what moved; one bond is recorded once. The book
 * total and the entity settings are shared with §5.2 — coverage is against the
 * same whole-book denominator and the recalculation protocol is one entity-wide
 * claim — so only the exposure rows are the sovereign register's own.
 *
 * Lifecycle is deliberately not here, the same as §5.2: an exposure is recorded
 * and can be changed; there is no lock and no supersede, because nothing yet
 * publishes from this register (the §5.9 report is a later step).
 */

'use strict';

const crypto = require('crypto');
const store = require('../../../platform/database/store');
const repo = require('../infrastructure/store');           // book + settings (shared)
const sovRepo = require('../infrastructure/sovereign-store'); // sovereign exposures
const { assessSovereign, STANDARD } = require('../domain/sovereign');
const { rollUpSovereign } = require('../domain/sovereign/portfolio');
const { movementSignificance } = require('../domain/recalculation');
const settingsService = require('./parta-settings');

/** @typedef {import('../../../shared/types').AppError} AppError */

const ASSET_CLASS = 'sovereign-debt';
const STATUS = Object.freeze({ RECORDED: 'recorded' });

const _id = () => `pas_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
const _now = () => new Date().toISOString();

function refuse(code, message, statusCode = 400, remedy) {
  const err = /** @type {AppError} */ (new Error(message));
  err.statusCode = statusCode; err.code = code;
  if (remedy) err.remedy = remedy;
  return err;
}

/** One bond, once — the check that names the existing exposure. */
async function refuseDuplicate(orgId, reportingYear, input, exceptId) {
  const ref = input.identifiers && input.identifiers.accountNumber;
  if (!ref) return;
  const rows = await sovRepo.byAccountNumber(orgId, String(reportingYear), String(ref));
  const clash = rows.find(r => r.exposureId !== exceptId);
  if (!clash) return;
  throw refuse('DUPLICATE_SOVEREIGN_HOLDING',
    `Reference ${ref} is already recorded for ${reportingYear} as exposure ${clash.exposureId}`
    + `${clash.country && clash.country.name ? ` (${clash.country.name})` : ''}. Recording it again would `
    + 'count its financed emissions and its outstanding twice and lift coverage on money not held twice.',
    409,
    `Change the existing exposure at PUT /v1/pcaf/part-a/sovereign/exposures/${clash.exposureId}, or give `
    + 'this one its own reference if it is a different holding.');
}

/** The country identity the record is browsed and grouped by. */
function countryOf(result) {
  const s = result.sovereign || {};
  return { code: s.country || null, name: s.name || null, iso3: s.iso3 || null };
}

/**
 * Record one sovereign exposure: keep what was keyed, compute what follows.
 * The engine runs before anything is written, so a holding the standard refuses
 * never reaches the book.
 */
async function record(orgId, input) {
  const reportingYear = input.reportingYear;
  if (!reportingYear) {
    throw refuse('REPORTING_YEAR_REQUIRED',
      'A sovereign exposure is recorded against a reporting year: Part A accounts for positions at the '
      + 'fiscal year-end, and a row with no year belongs to no book.', 400, 'Supply reportingYear.');
  }
  store.assertWritable();

  const result = assessSovereign(input);
  await refuseDuplicate(orgId, String(reportingYear), input, null);

  const now = _now();
  const record_ = {
    exposureId: _id(),
    orgId: String(orgId),
    status: STATUS.RECORDED,
    reportingYear: String(reportingYear),
    assetClass: ASSET_CLASS,
    country: countryOf(result),
    input,
    result,
    computedAt: now,
    standard: STANDARD,
    createdAt: now,
    updatedAt: now,
  };
  await sovRepo.saveExposure(orgId, record_);
  return record_;
}

async function get(orgId, exposureId) {
  const found = await sovRepo.getExposure(orgId, exposureId);
  if (!found) throw refuse('SOVEREIGN_EXPOSURE_NOT_FOUND', `No sovereign exposure ${exposureId} in this book.`, 404);
  return found;
}

async function update(orgId, exposureId, input) {
  const existing = await get(orgId, exposureId);
  store.assertWritable();
  const result = assessSovereign(input);
  await refuseDuplicate(orgId, String(input.reportingYear || existing.reportingYear), input, exposureId);

  const now = _now();
  const next = {
    ...existing,
    status: STATUS.RECORDED,
    reportingYear: String(input.reportingYear || existing.reportingYear),
    assetClass: ASSET_CLASS,
    country: countryOf(result),
    input,
    result,
    computedAt: now,
    standard: STANDARD,
    updatedAt: now,
  };
  await sovRepo.saveExposure(orgId, next);
  return next;
}

async function remove(orgId, exposureId) {
  await get(orgId, exposureId);
  store.assertWritable();
  await sovRepo.removeExposure(orgId, exposureId);
  return { exposureId, removed: true };
}

/** Rerun the engine over the stored input and say what moved. */
async function recompute(orgId, exposureId) {
  const existing = await get(orgId, exposureId);
  store.assertWritable();
  const settings = await settingsService.getSettings(orgId);
  const result = assessSovereign(existing.input);

  const val = (inv, path) => {
    const f = path.reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), inv);
    return f && !f.absent && Number.isFinite(f.value) ? f.value : null;
  };
  /** @type {[string, string[]][]} */
  const LINES = [
    ['scope1 excl LULUCF', ['scope1', 'exclLULUCF']],
    ['scope1 incl LULUCF', ['scope1', 'inclLULUCF']],
    ['scope2', ['scope2']],
    ['scope3', ['scope3']],
  ];
  const movementOf = ([line, path]) => {
    const before = val(existing.result.inventory, path);
    const after = val(result.inventory, path);
    return {
      line, before, after, moved: before !== after,
      movementPct: (Number.isFinite(before) && before !== 0 && Number.isFinite(after))
        ? +(((after - before) / before) * 100).toFixed(4) : null,
    };
  };
  const lines = LINES.map(movementOf);
  const dqBefore = existing.result.inventory.dataQuality.score;
  const dqAfter = result.inventory.dataQuality.score;
  const dataQuality = { before: dqBefore, after: dqAfter, moved: dqBefore !== dqAfter };
  const codesOf = r => [...new Set(((r.validation || {}).findings || []).map(f => f.code))].sort();
  const findings = { before: codesOf(existing.result), after: codesOf(result) };
  findings.moved = findings.before.join('|') !== findings.after.join('|');
  const moved = lines.some(l => l.moved) || dataQuality.moved || findings.moved;

  const next = { ...existing, result, computedAt: _now(), standard: STANDARD, updatedAt: _now() };
  await sovRepo.saveExposure(orgId, next);

  const headline = lines[0]; // scope 1 excl LULUCF is the headline
  const largestLinePct = lines
    .map(l => Number(l.movementPct)).filter(p => Number.isFinite(p))
    .reduce((m, p) => (Math.abs(p) > Math.abs(m) ? p : m), 0);
  return {
    exposure: next,
    movement: {
      basis: 'scope 1 on both LULUCF boundaries, scope 2 and 3, the data-quality score and the findings',
      before: headline.before, after: headline.after, movementPct: headline.movementPct,
      lines, dataQuality, findings, moved,
      significance: movementSignificance(
        { moved, headlinePct: headline.movementPct, largestLinePct },
        settings.significanceThresholdPct),
      previousStandard: existing.standard,
      standard: STANDARD,
      note: !moved
        ? 'The engine produced the same figures and the same score from the same input.'
        : `Moved on the same input: ${[...lines.filter(l => l.moved).map(l => l.line), ...(dataQuality.moved ? ['data quality'] : []), ...(findings.moved ? ['findings'] : [])].join(', ')}. `
          + 'The cause is a change in the engine or the sovereign dataset, not in what the bank recorded.',
    },
  };
}

/** A projected row → the shape the roll-up reads. */
function inflate(row) {
  const inv = (row.result && row.result.inventory) || {};
  const s1 = inv.scope1 || {};
  const v = f => (f && !f.absent && Number.isFinite(f.value) ? f.value : null);
  return {
    exposureId: row.exposureId,
    reportingYear: row.reportingYear || null,
    country: row.country || { code: null, name: (row.result && row.result.sovereign && row.result.sovereign.name) || null },
    provisional: Boolean(row.result && row.result.sovereign && row.result.sovereign.provisional),
    outstanding: (row.input && row.input.exposure && Number(row.input.exposure.amount)) || null,
    attributed: {
      scope1Excl: v(s1.exclLULUCF),
      scope1Incl: v(s1.inclLULUCF),
      scope2: v(inv.scope2),
      scope3: v(inv.scope3),
    },
    dqScore: inv.dataQuality ? inv.dataQuality.score : null,
    dqOption: inv.dataQuality ? inv.dataQuality.option : null,
    findings: (row.result && row.result.validation && row.result.validation.findings) || [],
  };
}

/**
 * The reporting-year position, rolled up from the stored projection. A year
 * with no sovereign exposures is a 409, not a position of zero.
 */
async function position(orgId, reportingYear) {
  const rows = await sovRepo.rollupsForYear(orgId, reportingYear);
  if (!rows.length) {
    throw refuse('EMPTY_SOVEREIGN_YEAR',
      `No sovereign exposures are recorded for ${reportingYear}. An empty year is not a position of zero.`,
      409, 'Record sovereign exposures for this year first.');
  }
  const book = await repo.getBook(orgId, reportingYear);
  const rolled = rollUpSovereign(rows.map(inflate), {
    totalLoansAndInvestments: book ? book.totalLoansAndInvestments : undefined,
    currency: book ? book.currency : undefined,
  });
  return {
    reportingYear: String(reportingYear),
    ...rolled,
    coverage: {
      ...rolled.coverage,
      ...(book ? { basisStatedBy: book.statedBy || null } : { remedy: 'State the reporting year\'s total loans and investments at PUT /v1/pcaf/part-a/book.' }),
    },
    source: 'Recorded sovereign exposures, read from the stored roll-up projection.',
  };
}

async function listExposures(orgId, reportingYear, opts = {}) {
  const { limit, cursor } = /** @type {{limit?: number, cursor?: string}} */ (opts);
  return sovRepo.pageForYear(orgId, reportingYear, { limit, cursor });
}

async function years(orgId) {
  const found = await sovRepo.years(orgId);
  const books = await repo.listBooks(orgId);
  const stated = new Set(books.map(b => String(b.reportingYear)));
  return found.map(y => ({ reportingYear: y, bookTotalStated: stated.has(y) }));
}

module.exports = {
  ASSET_CLASS, STATUS,
  record, get, update, remove, recompute, position, listExposures, years,
  _inflate: inflate,
};
