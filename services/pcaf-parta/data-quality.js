/**
 * PCAF Part A data quality: a lookup by (asset class, option).
 *
 * Part A scores data quality by which option was used to estimate the
 * emissions, in tables shaped like Part C's — Option, when to use it, score.
 * But the option-to-score mapping is NOT uniform across asset classes: the
 * same label carries a different score in different classes. So there is no
 * global lookup here, and there must never be one. The score is resolved from
 * the table belonging to the asset class, and asking the wrong table is an
 * error rather than a silently wrong answer.
 *
 * The scale has a direction and the direction is the point: 1 is the highest
 * quality, 5 the lowest. A score is a category, never a mark out of five —
 * written "3 / 5" it reads as a fraction and inverts the meaning for anyone who
 * has not opened the standard.
 */

'use strict';

const TABLES = {
  'project-finance': require('../../data/pcaf-parta/dq-project-finance.json'),
};

/** The data-quality table for an asset class, or an error naming the gap. */
function tableFor(assetClass) {
  const t = TABLES[assetClass];
  if (!t) {
    const err = new Error(
      `No PCAF Part A data quality table is held for asset class "${assetClass}". `
      + 'Each asset class has its own table and the option-to-score mapping differs '
      + 'between them, so no other table may be substituted.');
    err.statusCode = 501;
    err.code = 'DQ_TABLE_NOT_HELD';
    throw err;
  }
  return t;
}

/** Every option offered for an asset class — what a form should show. */
function optionsFor(assetClass) {
  return tableFor(assetClass).options.map(o => ({ ...o }));
}

/**
 * Score one assessment.
 *
 * @param {string} assetClass
 * @param {string} option  e.g. '2a'
 */
function score(assetClass, option) {
  const table = tableFor(assetClass);
  const row = table.options.find(o => o.option === String(option).toLowerCase());

  if (!row) {
    const err = new Error(
      `Option "${option}" is not in ${table.table} for ${assetClass}. `
      + `Options are: ${table.options.map(o => o.option).join(', ')}.`);
    err.statusCode = 400;
    err.code = 'UNKNOWN_DQ_OPTION';
    throw err;
  }

  return {
    score: row.score,
    option: row.option,
    family: row.family,
    when: row.when,
    /* Rendered as a category with the scale beside it. Never "3 / 5". */
    label: `Data quality score: ${row.score} (Option ${row.option})`,
    scale: table.scale,
    reference: `${table.standard} ${table.section}, ${table.table}`,
    tableStatus: table.status,
    tableNote: table.note,
  };
}

/**
 * The disclosed score across a book, weighted by OUTSTANDING AMOUNT.
 *
 * Part A weights by outstanding amount (Disclosure Checklist p.128). Part C
 * weights by premium (Box 6-3, p.107). The two must never share a function,
 * which is why this one lives here and names its basis in what it returns.
 *
 * An exposure carrying no score is excluded rather than counted as zero, and
 * the count of exclusions travels with the score.
 */
function weightedByOutstanding(exposures) {
  const scored = exposures.filter(e => Number.isFinite(e.score) && Number.isFinite(e.outstanding) && e.outstanding > 0);
  const excluded = exposures.length - scored.length;
  const weight = scored.reduce((s, e) => s + e.outstanding, 0);

  if (!scored.length || weight <= 0) {
    return { score: null, basis: 'outstanding amount', scored: 0, excluded, reference: 'PCAF Disclosure Checklist Part A, p.128' };
  }

  const total = scored.reduce((s, e) => s + e.outstanding * e.score, 0);
  return {
    score: +(total / weight).toFixed(2),
    basis: 'outstanding amount',
    scored: scored.length,
    excluded,
    reference: 'PCAF Disclosure Checklist Part A, p.128',
  };
}

module.exports = { tableFor, optionsFor, score, weightedByOutstanding, TABLES };
