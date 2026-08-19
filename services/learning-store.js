/**
 * CarbonIQ FinTech — PCAF Part C: Learning Store
 *
 * Every completed assessment leaves something behind that makes the next one
 * cheaper or better. Four record types:
 *
 *   1. per-m² factors   {region, projectType, GIFA, policyType} -> kgCO2e/m²
 *                       The benchmark flywheel: enough of these and a policy
 *                       can be screened from floor area alone, no BOQ.
 *
 *   2. mapping memory   BOQ line wording -> factor keys, plus any client
 *                       correction. The next similar BOQ maps with higher
 *                       confidence and fewer questions.
 *
 *   3. override log     Where a client replaced a default with their own
 *                       figure. These are the raw material of a Sri Lankan
 *                       Local-tier factor set.
 *
 *   4. gap ledger       Which factors fell back, how often, weighted by the
 *                       emissions flowing through them. Produces an
 *                       evidence-ranked list of which factor to research next.
 *
 * Persistence degrades gracefully: with no Firebase configured the store is
 * a no-op and the assessment still completes.
 */

'use strict';

const fb = require('../bridge/firebase');

function _now() { return new Date().toISOString(); }

/**
 * Record everything learnable from one completed assessment.
 *
 * @param {Object} params
 * @param {string} params.orgId
 * @param {string} params.runId
 * @param {Object} params.result   - runPartC() output
 * @param {Object} [params.context]- { region, projectType, projectName }
 * @param {Object[]} [params.materials]
 * @param {Object} [params.overrides]
 */
async function recordLearnings({ orgId, runId, result, context = {}, materials = [], overrides = {} }) {
  const records = buildLearningRecords({ runId, result, context, materials, overrides });
  await fb.savePartCLearnings(orgId, runId, records).catch(() => {});
  return records;
}

/** Pure builder — testable without Firebase. */
function buildLearningRecords({ runId, result, context = {}, materials = [], overrides = {} }) {
  const recordedAt = _now();

  // 1 — per-m² benchmark
  const perM2 = result.summary.perM2Factor_kgCO2e_m2;
  const perM2Record = perM2 > 0 ? {
    runId,
    region:       context.region || 'Sri Lanka',
    projectType:  context.projectType || 'unspecified',
    policyType:   result.policy.policyType,
    gifa_m2:      result.rollup.perM2Factor.inputs.gifa_m2,
    perM2_kgCO2e: perM2,
    construction_kgCO2e: result.summary.construction_kgCO2e,
    dataQualityOption: result.dataQuality.option,
    dataQualityScore:  result.dataQuality.score,
    siteEnergyMethod:  (result.modules.a5.children.find(c => c.module === 'A5.2') || {}).inputs?.method || null,
    recordedAt
  } : null;

  // 2 — mapping memory
  const mappingRecords = materials
    .filter(m => m.name)
    .map(m => ({
      runId,
      sourceText:  m.sourceText || m.name,
      materialName: m.name,
      unit:        m.unit || null,
      densityKey:  m.densityKey || null,
      massFactorKey: m.massFactorKey || null,
      wasteCategory: m.wasteCategory || null,
      serviceLifeCategory: m.serviceLifeCategory || null,
      confidence:  m.confidence || null,
      correctedByClient: !!m.correctedByClient,
      recordedAt
    }));

  // 3 — override log
  const overrideRecords = Object.entries(overrides).map(([key, o]) => ({
    runId, factorKey: key,
    value: o.value, tier: o.tier || 'Local',
    reference: o.reference || 'Client override',
    candidateLocalFactor: true,
    recordedAt
  }));

  // 4 — gap contributions
  const gapRecords = ((result.sensitivity && result.sensitivity.topFactorGaps) || []).map(g => ({
    runId,
    factorKey: g.key,
    tier: g.tier,
    gap: g.gap,
    isFallback: g.isFallback,
    emissionsThrough_kgCO2e: g.emissionsThrough_kgCO2e,
    sharePct: g.sharePct,
    recordedAt
  }));

  return {
    runId,
    recordedAt,
    perM2Factor: perM2Record,
    mappingMemory: mappingRecords,
    overrides: overrideRecords,
    gapContributions: gapRecords,
    counts: {
      perM2Factors: perM2Record ? 1 : 0,
      mappingEntries: mappingRecords.length,
      overrides: overrideRecords.length,
      gaps: gapRecords.length
    }
  };
}

/**
 * Aggregate the gap ledger across a book of assessments into a ranked
 * research list. This is what turns "we should localise our factors" into
 * "localise these three, in this order, and here is why".
 */
function aggregateResearchPriority(allLearnings = []) {
  const totals = new Map();

  for (const l of allLearnings) {
    for (const g of l.gapContributions || []) {
      const cur = totals.get(g.factorKey) || {
        factorKey: g.factorKey, tier: g.tier, gap: g.gap,
        occurrences: 0, totalEmissions_kgCO2e: 0, avgSharePct: 0, _shareSum: 0
      };
      cur.occurrences += 1;
      cur.totalEmissions_kgCO2e += g.emissionsThrough_kgCO2e || 0;
      cur._shareSum += g.sharePct || 0;
      totals.set(g.factorKey, cur);
    }
  }

  return [...totals.values()]
    .map(r => ({
      factorKey: r.factorKey, tier: r.tier, gap: r.gap,
      occurrences: r.occurrences,
      totalEmissions_kgCO2e: r.totalEmissions_kgCO2e,
      avgSharePct: r.occurrences > 0 ? r._shareSum / r.occurrences : 0
    }))
    .sort((a, b) => b.totalEmissions_kgCO2e - a.totalEmissions_kgCO2e)
    .map((r, i) => ({ rank: i + 1, ...r }));
}

/**
 * Look up a per-m² benchmark for screening (Mode D / phase D3).
 * Returns null until enough comparable projects have been recorded.
 */
async function findBenchmark({ orgId, region, projectType, minSamples = 3 }) {
  const all = await fb.listPartCBenchmarks(orgId).catch(() => []);
  const matches = (all || []).filter(b =>
    b && b.perM2_kgCO2e > 0 &&
    (!region || b.region === region) &&
    (!projectType || b.projectType === projectType));

  if (matches.length < minSamples) {
    return { available: false, samples: matches.length, minSamples,
             note: `${matches.length} of ${minSamples} comparable projects recorded. Screening from floor area alone becomes available once the library is large enough.` };
  }

  const values = matches.map(m => m.perM2_kgCO2e).sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)];
  return {
    available: true, samples: matches.length,
    median_kgCO2e_m2: median,
    min_kgCO2e_m2: values[0],
    max_kgCO2e_m2: values[values.length - 1],
    region, projectType
  };
}

module.exports = { recordLearnings, buildLearningRecords, aggregateResearchPriority, findBenchmark };
