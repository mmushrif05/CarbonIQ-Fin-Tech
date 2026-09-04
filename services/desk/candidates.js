/**
 * CarbonIQ FinTech — the candidates a desk can actually act on
 *
 * The GCF Pipeline tab answers *why* a candidate ranks where it does, at
 * length and with every tier on the page. This answers the two questions that
 * come after it: **can we carry this**, and **which would we write**.
 *
 * Composed, not recomputed. The gate is `gcf/screening.screen`, the ranking is
 * `gcf/screening.rank`, the structure is `gcf/instruments.structurePipeline`,
 * and the link to the book is the `origin` on an investment. Nothing here
 * decides anything those modules have not already decided.
 *
 * ── Three rules the shape enforces ─────────────────────────────────────────
 *
 * **A gate is not a score.** An excluded project keeps its row and its reason.
 * Dropping it would leave a reader unable to tell "we considered and refused
 * it" from "it was never in the pool", and down-ranking instead of excluding
 * drifts a pipeline towards projects that touch nobody.
 *
 * **Two rankings, never merged.** Mitigation ranks on tCO2e per dollar of
 * concessional ask; adaptation ranks on direct beneficiaries per dollar and
 * touches carbon at no point. One league table would put irrigation and
 * mangroves at the bottom every time, which is a fact about the sort key.
 * `rank` is therefore a position **within a stream** and the stream travels
 * with it; there is no overall rank anywhere in this payload to sort on.
 *
 * **The uncovered barrier is the finding.** Coverage is always reported with
 * what it leaves standing, because the barrier no deliverable structure
 * addresses is the one that kills the deal.
 */

'use strict';

const screening = require('../gcf/screening');
const instruments = require('../gcf/instruments');

const round = (n, dp = 2) => (n === null || n === undefined || !Number.isFinite(Number(n))
  ? null : Math.round(Number(n) * 10 ** dp) / 10 ** dp);

/**
 * @param {object[]} projects     the GCF candidate pool
 * @param {object[]} investments  the capital book, for the adoption link
 * @param {object} opts           accreditation, weights
 */
function candidates(projects = [], investments = [], { accreditation = {}, weights } = {}) {
  const ranked = screening.rank(projects, { accreditation, weights });
  const structured = instruments.structurePipeline(projects, { accreditation });

  const gateById = new Map(ranked.screening.rows.map(r => [r.id, r]));
  const structById = new Map(structured.projects.map(r => [r.id, r]));
  const rankById = new Map();
  for (const list of [ranked.mitigation, ranked.adaptation]) {
    for (const r of list.projects) rankById.set(r.id, r);
  }

  const adoptedByRecord = new Map();
  for (const inv of investments || []) {
    if (inv.origin && inv.origin.system === 'gcf' && inv.origin.recordId) {
      adoptedByRecord.set(inv.origin.recordId, inv);
    }
  }

  const rows = projects.map((p) => {
    const gate = gateById.get(p.id) || { status: 'eligible', exclusions: [], flags: [] };
    const rk = rankById.get(p.id) || null;
    const st = structById.get(p.id) || null;
    const inv = adoptedByRecord.get(p.id) || null;
    const fin = p.financing || {};

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      sector: p.sector || null,
      stream: p.stream,
      resultsArea: p.resultsArea,
      stage: p.stage,

      /* The gate answer, with its reason. Three states, because a finding is
         not always a verdict: flagged means eligible with something to verify. */
      gate: {
        verdict: gate.status,
        eligible: gate.eligible !== false,
        reasons: [...(gate.exclusions || []), ...(gate.flags || [])].map(r => r.detail),
      },

      /* Rank is a position WITHIN a stream. There is no overall rank here and
         there must not be one. An excluded project is not ranked at all. */
      rank: rk ? rk.rank : null,
      score: rk ? rk.score : null,
      impact: rk && rk.components && rk.components.impact
        ? {
          value: round(rk.components.impact.raw, 1),
          metric: rk.components.impact.metric,
          basis: rk.impactBasis,
        }
        : { value: null, metric: null, basis: rk ? rk.impactBasis : null },
      unscoredComponents: rk ? rk.missing : [],

      financing: {
        currency: fin.currency || 'USD',
        totalCost: fin.totalCost ?? null,
        gcfAsk: fin.gcfAsk ?? null,
        /* The bank's own share, which is what a commitment on this book would
           be. The Fund's ask and any sponsor equity are somebody else's money
           and are never added to it. */
        bankShare: fin.dfcc ?? null,
      },

      structure: st ? {
        recommended: st.recommended ? st.recommended.name : null,
        barriersLeftStanding: (st.barriersLeftStanding || []).map(b => b.label || b.id || b),
        needsSupport: st.concessionality ? st.concessionality.needsSupport : null,
        note: st.recommendedNote || null,
      } : null,

      /* The link to the book, or its absence. */
      adopted: inv ? { investmentId: inv.id, status: inv.status, commitment: inv.commitment } : null,
    };
  });

  /* Ordered the way a reader works: what we can carry, best first; then what
     needs verifying; then what we cannot carry at all — still visible, because
     "considered and refused" and "never in the pool" are different facts. */
  const order = { eligible: 0, flagged: 1, excluded: 2 };
  rows.sort((a, b) => (order[a.gate.verdict] - order[b.gate.verdict])
    || ((b.score ?? -1) - (a.score ?? -1))
    || String(a.code).localeCompare(String(b.code)));

  const count = v => rows.filter(r => r.gate.verdict === v).length;

  return {
    pool: rows.length,
    eligible: count('eligible'),
    flagged: count('flagged'),
    excluded: count('excluded'),
    adopted: rows.filter(r => r.adopted).length,
    rows,

    accreditation: ranked.screening.accreditation,
    gateNote: ranked.screening.note,

    streams: {
      mitigation: { note: ranked.mitigation.note, ranked: ranked.mitigation.projects.length },
      adaptation: { note: ranked.adaptation.note, ranked: ranked.adaptation.projects.length },
      note: ranked.note,
    },

    /* Named on the face of the result rather than left implicit. A ranking
       that hides its own limits is worth nothing to whoever defends it. */
    unscoredCriteria: ranked.criteria.notScored.map(c => ({ id: c.id, name: c.name, reason: c.reason })),
    criteriaNote: ranked.criteria.note,

    mandateGap: structured.mandateGap,
    minimumConcessionality: structured.minimumConcessionality,
    weights: ranked.mitigation.weights,
  };
}

module.exports = { candidates };
