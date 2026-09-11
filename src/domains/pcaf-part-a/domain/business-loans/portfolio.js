// @ts-check
/**
 * The book: many exposures, rolled up the way Chapter 6 asks — and the
 * worklist that comes out of it.
 *
 * Six lines summed per group and never across lines. The disclosed
 * data-quality score is weighted by OUTSTANDING AMOUNT (Box 6.1-6, p.168),
 * scope 1 and 2 together and scope 3 apart (p.167). Exposures to financial
 * institutions are rolled up separately, because PCAF recommends it (p.56):
 * the scope 3 of a bank includes its own financed emissions, so a book holding
 * bank paper counts those a second time.
 *
 * The second half is the part a bank asks for on the day after its first
 * disclosure: **what do we fix first?** A score is a measurement and not a
 * task list, and "improve your data quality" is not a plan. So every finding
 * raised across the book is grouped by what would clear it, carries the
 * outstanding amount it sits on, and is ordered by how much of the book's
 * weighted score it holds down. The figure beside each row is a scenario, run
 * through the same weighting the disclosure uses, and it is labelled a
 * scenario — it is what the score would be if those exposures reached that
 * option, not a forecast that they will.
 *
 * Two things this module refuses to do. It never averages the scores of the
 * groups it produces — the weighting runs once, over exposures, per group. And
 * it never presents a scenario score as the reported one; they are separate
 * keys with separate labels, for the same reason the capital forecast is
 * hatched.
 */

'use strict';

const dataQuality = require('../data-quality');

const LINES = ['scope1', 'scope2', 'scope1And2', 'scope3', 'removals', 'creditsRetired', 'creditsGenerated'];

const val = line => (line && Number.isFinite(line.value) && !line.absent) ? line.value : null;
const amountOf = r => r.exposure.outstanding.value;

function sumLines(results) {
  const out = {};
  for (const k of LINES) {
    const present = results.map(r => val(r.inventory[k])).filter(v => v !== null);
    out[k] = {
      value: present.length ? +present.reduce((s, v) => s + v, 0).toFixed(2) : null,
      unit: 'tCO2e',
      counted: present.length,
      absent: results.length - present.length,
    };
  }
  return out;
}

function weighted(results, pick) {
  return dataQuality.weightedByOutstanding(results.map(r => ({
    score: pick(r), outstanding: amountOf(r),
  })));
}

const scope12Score = r => r.inventory.dataQuality.scope1And2.score;
const scope3Score = r => (r.inventory.dataQuality.scope3 && !r.inventory.dataQuality.scope3.absent)
  ? r.inventory.dataQuality.scope3.score : null;

function group(results, label) {
  return {
    label,
    exposures: results.length,
    outstanding: +results.reduce((s, r) => s + amountOf(r), 0).toFixed(2),
    lines: sumLines(results),
    dataQuality: {
      scope1And2: weighted(results, scope12Score),
      scope3: weighted(results, scope3Score),
      note: 'Weighted by outstanding amount (Box 6.1-6, p.168). Scope 3 weighted separately from scope 1 and 2 '
        + '(p.167). An exposure without a score is excluded, not counted as zero.',
    },
    withoutAttributionFactor: results.filter(r => !r.attribution).length,
  };
}

/**
 * What to fix first, and what it would be worth.
 *
 * The ordering is by weighted score held down — outstanding × the score points
 * above the target — because that is what moves a disclosed figure. Ordering
 * by count would send a bank to two hundred small borrowers before the one
 * exposure carrying a fifth of the book.
 */
function improvementPlan(results, { target = 2 } = {}) {
  const totalOutstanding = results.reduce((s, r) => s + amountOf(r), 0);
  const current = weighted(results, scope12Score);

  /* Grouped by remedy: the sentence that says what evidence closes it. */
  const byRemedy = new Map();
  for (const r of results) {
    for (const f of r.validation.findings) {
      const row = byRemedy.get(f.code) || {
        code: f.code, severity: f.severity, field: f.field, remedy: f.remedy,
        reference: f.reference, exposures: 0, outstanding: 0, examples: [],
      };
      row.exposures += 1;
      row.outstanding += amountOf(r);
      if (row.examples.length < 3) row.examples.push(r.exposure.counterparty.name || r.exposure.identifiers.id || null);
      byRemedy.set(f.code, row);
    }
  }

  /* Grouped by option: where the score itself sits, and what one step would
     be worth if those exposures reached the target. */
  const byOption = new Map();
  for (const r of results) {
    const o = r.inventory.dataQuality.scope1And2;
    const row = byOption.get(o.option) || { option: o.option, score: o.score, exposures: 0, outstanding: 0, weightHeld: 0 };
    row.exposures += 1;
    row.outstanding += amountOf(r);
    row.weightHeld += amountOf(r) * Math.max(0, o.score - target);
    byOption.set(o.option, row);
  }

  const steps = [...byOption.values()]
    .filter(row => row.score > target)
    .sort((a, b) => b.weightHeld - a.weightHeld)
    .map(row => {
      /* The scenario: these exposures at the target, everything else as it is,
         through the same weighting the disclosure uses. */
      const scenario = dataQuality.weightedByOutstanding(results.map(r => ({
        outstanding: amountOf(r),
        score: r.inventory.dataQuality.scope1And2.option === row.option
          ? target : scope12Score(r),
      })));
      return {
        option: row.option,
        currentScore: row.score,
        exposures: row.exposures,
        outstanding: +row.outstanding.toFixed(2),
        shareOfBook: totalOutstanding > 0 ? +(row.outstanding / totalOutstanding).toFixed(4) : null,
        ifTheseReachedScore: target,
        scenarioScore: scenario.score,
        movement: (current.score !== null && scenario.score !== null)
          ? +(current.score - scenario.score).toFixed(2) : null,
      };
    });

  return {
    reportedScore: current,
    target,
    targetNote: `The target is score ${target} — the borrower's own reported figure, unverified (Option 1b). `
      + 'Score 1 needs third-party verification, which is the borrower\'s decision and not the lender\'s, so '
      + 'it is not the default target.',
    steps,
    byRemedy: [...byRemedy.values()]
      .map(r => ({ ...r, outstanding: +r.outstanding.toFixed(2), shareOfBook: totalOutstanding > 0 ? +(r.outstanding / totalOutstanding).toFixed(4) : null }))
      .sort((a, b) => b.outstanding - a.outstanding),
    scenarioNote: 'Every figure under "steps" is a scenario run through the weighting the disclosure uses. It '
      + 'is what the score would be if those exposures reached that option; it is not the reported score and '
      + 'is never printed as one.',
  };
}

/**
 * @param {Object[]} results  outputs of assessBusinessLoan
 * @param {Object} [opts]
 * @param {number} [opts.totalLoansAndInvestments]  the whole book, for coverage (DCL p.124)
 * @param {number} [opts.improvementTarget]
 */
function rollUp(results, opts = {}) {
  if (!Array.isArray(results) || !results.length) {
    const err = /** @type {import('../../../../shared/types').AppError} */ (new Error('A roll-up needs at least one assessed exposure. An empty book is not a position of zero.'));
    err.statusCode = 409; err.code = 'EMPTY_BOOK';
    throw err;
  }

  const fin = results.filter(r => r.financialSector);
  const nonFin = results.filter(r => !r.financialSector);

  const by = (key, fallback) => {
    const m = {};
    for (const r of results) {
      const k = key(r) || fallback;
      (m[k] = m[k] || []).push(r);
    }
    return Object.fromEntries(Object.entries(m).map(([k, rs]) => [k, group(rs, k)]));
  };

  const total = group(results, 'Business loans and unlisted equity');
  const coverage = Number.isFinite(Number(opts.totalLoansAndInvestments)) && Number(opts.totalLoansAndInvestments) > 0
    ? { share: +(total.outstanding / Number(opts.totalLoansAndInvestments)).toFixed(4), basis: 'outstanding amount assessed ÷ total loans and investments', reference: 'PCAF Disclosure Checklist Part A, p.124' }
    : { share: null, reason: 'Total loans and investments not supplied; coverage cannot be stated (DCL p.124).' };

  return {
    assetClass: 'business-loans-unlisted-equity',
    total,
    excludingFinancialSector: group(nonFin.length ? nonFin : results, 'Excluding financial-sector borrowers'),
    financialSector: fin.length
      ? { ...group(fin, 'Financial-sector borrowers'), note: 'Reported separately, as PCAF recommends (§5.2, p.56): the scope 3 of a financial institution includes its own financed emissions, so the double count is made visible rather than hidden in the total.' }
      : null,
    bySector: by(r => r.exposure.counterparty.sector || r.exposure.counterparty.naceL2, 'unclassified'),
    byKind: by(r => r.exposure.kind, 'business-loan'),
    byBorrowerType: by(r => r.exposure.counterparty.borrowerType, 'company'),
    coverage,
    improvementPlan: improvementPlan(results, { target: opts.improvementTarget }),
    separation: 'Absolute emissions, emission removals and carbon credits are separate lines and are not netted '
      + '(§5.2, pp.62–63). Scope 3 is separate from scope 1 and 2 (p.56).',
  };
}

module.exports = { rollUp, improvementPlan, LINES };
