// @ts-check
/**
 * Which baseline is in force, and why that one.
 *
 * Precedence is **organisation → country → global → the shipped seed**, and
 * the most specific *released* record wins. Two rules make it safe to quote:
 *
 * **The answer always says where it came from.** A figure that cannot name
 * the baseline behind it is a figure nobody can check, and this product's
 * whole claim is that every figure can be checked. So a resolution carries
 * the scope, the version, the source and whether it was provisional — and a
 * caller renders that beside the number rather than the number alone.
 *
 * **A recorded baseline replaces the seed entirely; the two are never
 * merged.** That is the discipline the capital book and the GCF pipeline
 * already follow. A half-shipped, half-recorded band set is a figure with two
 * authors and no author.
 *
 * **Absence is an answer.** Where no baseline exists for a country, the
 * resolution says so and names what it would need, rather than falling back
 * to a global default nobody set. A number invented to fill the gap would be
 * quoted as regional judgement, which is exactly the thing this registry
 * exists to make trustworthy.
 */

'use strict';

const { STATUS, SPECIFICITY } = require('./baseline');
const { metric } = require('./metrics');

/**
 * @typedef {Object} Resolution
 * @property {string} metric
 * @property {Record<string, number>|null} values
 * @property {string|null} unit
 * @property {boolean} resolved
 * @property {'organisation'|'country'|'global'|'seed'|null} scope
 * @property {string|null} baselineId
 * @property {number|null} version
 * @property {string|null} source
 * @property {string|null} authority
 * @property {boolean} provisional
 * @property {string} basis a sentence a screen or a report prints as it stands.
 *   The full `source` is carried separately rather than folded in, because a
 *   source is a citation and can run to several lines.
 * @property {string} [needs] what would settle it, where nothing did
 * @property {Array<{scope: string, why: string}>} [considered]
 */

/**
 * Resolve one metric for a request.
 *
 * @param {string} metricKey
 * @param {{country?: string|null, orgId?: string|null}} ctx
 * @param {any[]} released every released baseline visible to this caller
 * @param {any[]} [seed] the shipped provisional set
 * @returns {Resolution}
 */
function resolve(metricKey, ctx = {}, released = [], seed = []) {
  const def = metric(metricKey);
  const country = ctx.country ? String(ctx.country).toUpperCase() : null;
  const orgId = ctx.orgId ? String(ctx.orgId) : null;
  const unit = def ? def.unit : null;

  if (!def) {
    return absent(metricKey, unit, `"${metricKey}" is not a metric this registry governs.`,
      'Add it to src/domains/baseline/domain/metrics.js, where the value shape and what reads it are declared.');
  }

  const applies = b =>
    b && b.metric === metricKey && b.status === STATUS.RELEASED &&
    (b.scope === 'global'
      || (b.scope === 'country' && country && b.country === country)
      || (b.scope === 'organisation' && orgId && b.orgId === orgId && (!country || b.country === country)));

  /* Most specific first, and the newest version within a scope — a superseded
     record is not released, so the sort only has to break ties between a
     record and one released after it. */
  const candidates = released.filter(applies).sort((a, b) =>
    (SPECIFICITY[b.scope] - SPECIFICITY[a.scope]) || (b.version - a.version)
    || String(b.releasedAt || '').localeCompare(String(a.releasedAt || '')));

  const hit = candidates[0];
  if (hit) {
    return {
      metric: metricKey,
      values: { ...hit.values },
      unit,
      resolved: true,
      scope: hit.scope,
      baselineId: hit.baselineId,
      version: hit.version,
      source: hit.source,
      authority: hit.authority || null,
      provisional: false,
      basis: `${def.label} — ${scopeWords(hit)}, version ${hit.version}, released ${(hit.releasedAt || '').slice(0, 10)}.`,
      considered: candidates.map(c => ({ scope: c.scope, why: `released v${c.version}` })),
    };
  }

  const shipped = (seed || []).filter(s => s.metric === metricKey && (!s.country || !country || s.country === country));
  const s = shipped.sort((a, b) => (b.country ? 1 : 0) - (a.country ? 1 : 0))[0];
  if (s) {
    return {
      metric: metricKey,
      values: { ...s.values },
      unit,
      resolved: true,
      scope: 'seed',
      baselineId: null,
      version: null,
      source: s.source,
      authority: s.authority || null,
      /* The whole point of the flag: a demonstration runs on this, and a
         disclosure must not. */
      provisional: true,
      basis: `${def.label} — illustrative dataset, not a released baseline.`,
      needs: 'Release a baseline for this country to put a governed figure in force.',
    };
  }

  return absent(metricKey, unit,
    `No baseline is in force for ${def.label}${country ? ` in ${country}` : ''}.`,
    `Release a ${country ? 'country' : 'global'} baseline for "${metricKey}". `
    + 'Nothing is assumed in its place: a figure invented here would be quoted as regional judgement.');
}

function scopeWords(b) {
  if (b.scope === 'organisation') return `this organisation's own baseline (${b.country})`;
  if (b.scope === 'country') return `the ${b.country} baseline`;
  return 'the global baseline';
}

/** @returns {Resolution} */
function absent(metricKey, unit, basis, needs) {
  return {
    metric: metricKey, values: null, unit, resolved: false,
    scope: null, baselineId: null, version: null, source: null, authority: null,
    provisional: false, basis, needs,
  };
}

module.exports = { resolve };
