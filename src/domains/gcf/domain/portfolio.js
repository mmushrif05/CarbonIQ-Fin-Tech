// @ts-check
/**
 * The pipeline as a bank and the Fund read it: by stage of the cycle, by
 * results area, by stream; the money on one line; the results on their own
 * boundaries; the evidence behind them; the accreditation envelope; and what
 * to do next.
 *
 * Nothing here computes an emission or a score. The carbon figures come from
 * `emissions.portfolioEmissions`, the gate from `screening.screen`, the
 * readiness of each project from `readiness.assess`; this module lays them
 * side by side and counts. A second engine producing "the same" figure is how
 * a screen ends up disagreeing with a document generated from the same book.
 */

'use strict';

const cycle = require('./cycle');
const readiness = require('./readiness');
const criteria = require('./criteria');
const emissions = require('./emissions');
const record = require('./record');
const screening = require('./screening');
const { RESULTS_AREAS } = require('./reference');

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const sum = (xs, f) => xs.reduce((s, x) => s + num(f(x)), 0);
const val = f => (f && typeof f === 'object' && Number.isFinite(f.value) ? f.value : null);

function areaLabel(code) {
  const a = RESULTS_AREAS.areas.find(x => x.code === code);
  return a ? a.name : code;
}

/**
 * @param {any[]} projects
 * @param {{accreditation:any, now?:string}} opts
 */
function portfolio(projects, { accreditation, now = new Date().toISOString() }) {
  const gate = screening.screen(projects, { accreditation });
  const gateById = new Map(gate.rows.map(r => [r.id, r]));
  const carbon = emissions.portfolioEmissions(projects, { label: 'pipeline' });

  const rows = projects.map(p => {
    const r = readiness.assess(p, { now });
    const c = criteria.assess(p);
    const g = gateById.get(p.id) || { status: 'unknown', flags: [], exclusions: [] };
    const info = cycle.stageInfo(p.stage);
    const f = p.financing || {};
    const projected = r.timeline.projected;
    return {
      id: p.id, code: p.code, name: p.name, stream: p.stream,
      resultsArea: p.resultsArea, resultsAreaLabel: areaLabel(p.resultsArea),
      stage: p.stage, stageLabel: r.stageLabel, cycle: info ? info.cycle.n : null, cycleLabel: info ? info.cycle.label : null,
      daysInStage: r.daysInStage,
      gate: g.status, gateReasons: [...(g.exclusions || []), ...(g.flags || [])].map(x => x.detail),
      essCategory: p.essCategory,
      totalCost: num(f.totalCost), gcfAsk: num(f.gcfAsk), dfcc: num(f.dfcc), other: num(f.other), instrument: f.instrument || null,
      mobilisation: num(f.gcfAsk) > 0 ? +(num(f.totalCost) / num(f.gcfAsk)).toFixed(2) : null,
      mitigationLifetime_tCO2e: p.stream === 'mitigation' ? val(p.mitigation && p.mitigation.lifetime_tCO2e) : null,
      coBenefitLifetime_tCO2e: p.stream === 'adaptation' && p.mitigation && p.mitigation.isCoBenefit ? val(p.mitigation.lifetime_tCO2e) : null,
      directBeneficiaries: val(p.beneficiaries && p.beneficiaries.direct),
      indirectBeneficiaries: val(p.beneficiaries && p.beneficiaries.indirect),
      hectares: val(p.area && p.area.hectares), assetsProtected_usd: val(p.assets && p.assets.valueProtected_usd),
      weakestTier: record.weakestTier(p),
      readinessPct: r.pctReady, blockers: r.blockers.length, nextMissing: r.next ? r.next.missing : 0,
      nextStep: r.nextStep, nda: (p.nda && p.nda.status) || 'not_requested',
      sapEligible: r.sap.eligible, ppfEligible: r.ppf.eligible,
      criteriaEvidenced: c.evidenced,
      selectedForCN: Boolean(p.selectedForCN),
      nextMilestone: nextMilestone(r.timeline, projected),
    };
  });

  const byStage = cycle.STAGES.map(s => {
    const here = rows.filter(r => r.stage === s);
    const info = cycle.stageInfo(s);
    return { stage: s, label: info ? info.label : s, cycle: info ? info.cycle.n : null, count: here.length, gcfAsk: sum(here, r => r.gcfAsk), ids: here.map(r => r.id) };
  });
  const byCycle = cycle.CYCLE.map(c => {
    const here = rows.filter(r => r.cycle === c.n);
    return { n: c.n, key: c.key, label: c.label, actor: c.actor, count: here.length, gcfAsk: sum(here, r => r.gcfAsk), totalCost: sum(here, r => r.totalCost), ids: here.map(r => r.id) };
  });
  const byStream = ['mitigation', 'adaptation'].map(s => {
    const here = rows.filter(r => r.stream === s);
    return { stream: s, count: here.length, gcfAsk: sum(here, r => r.gcfAsk), totalCost: sum(here, r => r.totalCost) };
  });
  const byArea = RESULTS_AREAS.areas.map(a => {
    const here = rows.filter(r => r.resultsArea === a.code);
    return { code: a.code, label: a.name, stream: a.stream, count: here.length, gcfAsk: sum(here, r => r.gcfAsk) };
  }).filter(a => a.count > 0);

  const totalCost = sum(rows, r => r.totalCost); const gcfAsk = sum(rows, r => r.gcfAsk);
  const ceiling = accreditation && accreditation.sizeRange_usd ? accreditation.sizeRange_usd[1] : null;
  const largest = rows.length ? rows.reduce((m, r) => (r.totalCost > m.totalCost ? r : m), rows[0]) : null;

  const actions = rows
    .filter(r => r.nextStep && r.stage !== 'closed')
    .sort((a, b) => (b.cycle || 0) - (a.cycle || 0) || (b.daysInStage || 0) - (a.daysInStage || 0))
    .map(r => ({ id: r.id, code: r.code, name: r.name, stage: r.stage, stageLabel: r.stageLabel, daysInStage: r.daysInStage,
      what: r.nextStep.what, who: r.nextStep.who, document: r.nextStep.document, blockers: r.blockers, nextMissing: r.nextMissing }));

  const upcoming = rows.flatMap(r => (r.nextMilestone ? [{ ...r.nextMilestone, id: r.id, code: r.code, name: r.name }] : []))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return {
    count: rows.length,
    money: {
      currency: 'USD', totalCost, gcfAsk, dfcc: sum(rows, r => r.dfcc), other: sum(rows, r => r.other),
      mobilisation: gcfAsk > 0 ? +(totalCost / gcfAsk).toFixed(2) : null,
      mobilisationNote: 'Total cost over the GCF ask. GCF sets no minimum co-financing ratio; the Private Sector Facility reports about three dollars mobilised per dollar of GCF money.',
    },
    envelope: {
      decision: accreditation ? accreditation.decision : null, sizeCategory: accreditation ? accreditation.sizeCategory : null,
      ceiling_usd: ceiling, essCategory: accreditation ? accreditation.essCategory : null, grantModality: accreditation ? accreditation.grantModality : null,
      largestProject: largest ? { id: largest.id, code: largest.code, totalCost: largest.totalCost, shareOfCeiling: ceiling ? +(largest.totalCost / ceiling).toFixed(3) : null } : null,
      overCeiling: ceiling ? rows.filter(r => r.totalCost > ceiling).map(r => r.code) : [],
      note: 'The size ceiling applies per project, not to the pipeline as a whole; GCF size categories are nested ceilings.',
    },
    /* One verdict per project, from the screening row: the engine's `eligible`
       list includes the flagged ones, and three tiles that do not partition
       the pool read as a count that is wrong. */
    gate: {
      eligible: rows.filter(r => r.gate === 'eligible').length,
      flagged: rows.filter(r => r.gate === 'flagged').length,
      excluded: rows.filter(r => r.gate === 'excluded').length,
      note: gate.note,
    },
    results: {
      mitigation: carbon.headline,
      adaptationCoBenefit: carbon.adaptationCoBenefit,
      embodiedCarbon: carbon.embodiedCarbon,
      financedEmissions: carbon.financedEmissions,
      beneficiaries: {
        direct: sum(rows, r => r.directBeneficiaries), indirect: sum(rows, r => r.indirectBeneficiaries),
        note: 'Direct and indirect are two core indicators and are never summed (IRMF Core Indicator 2).',
      },
      hectares: sum(rows, r => r.hectares), assetsProtected_usd: sum(rows, r => r.assetsProtected_usd),
      evidence: carbon.evidence,
    },
    byStage, byCycle, byStream, byArea,
    readiness: {
      averagePct: rows.length ? Math.round(sum(rows, r => r.readinessPct) / rows.length) : null,
      sapEligible: rows.filter(r => r.sapEligible).map(r => r.code),
      ppfEligible: rows.filter(r => r.ppfEligible).map(r => r.code),
      selectedForCN: rows.filter(r => r.selectedForCN).map(r => r.code),
    },
    actions, upcoming, rows,
    timing: cycle.TIMING,
    note: 'Every figure is one the record or an engine returned, laid side by side; nothing here is recomputed.',
  };
}

function nextMilestone(t, projected) {
  const today = t.today;
  const pending = t.recorded.filter(m => m.target && m.date >= today).map(m => ({ milestone: m.label, date: m.date, projected: false, basis: 'Target set by the bank' }));
  const all = [...pending, ...projected.filter(m => m.date >= today)].sort((a, b) => a.date.localeCompare(b.date));
  return all[0] || null;
}

module.exports = { portfolio, areaLabel };
