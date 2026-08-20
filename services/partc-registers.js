/**
 * CarbonIQ FinTech — PCAF Part C: Registers
 *
 * Three records, all DERIVED from the traced-value tree rather than narrated,
 * so they can never contradict the arithmetic they describe:
 *
 *   A — Assumptions and Limitations Register
 *   B — Data Gap Ledger
 *   C — Audit Trail
 *
 * Per the agreed MVP behaviour these never interrupt the client. The main
 * result screen stays clean; the registers sit behind their own panels and
 * their own report annexes, for the reader who needs them.
 */

'use strict';

const { walk } = require('./pcaf-partc/provenance');

const SEVERITY_RANK = { material: 0, notable: 1, info: 2 };

// ---------------------------------------------------------------------------
// Annex A — Assumptions and Limitations Register
// ---------------------------------------------------------------------------

/**
 * @param {Object} result - output of runPartC()
 * @returns {Object} register with entries sorted most-material first
 */
function assumptionsRegister(result) {
  const entries = [];

  for (const a of result.assumptions || []) {
    entries.push({
      source: 'calculation',
      code: a.code,
      module: a.module || null,
      severity: a.severity,
      message: a.message,
      context: a.context || {}
    });
  }

  // Plausibility findings run silently in MVP and land here rather than
  // interrupting the client.
  for (const f of result.findings || []) {
    entries.push({
      source: 'plausibility check',
      code: f.code,
      module: null,
      severity: f.severity,
      message: f.message,
      context: f.context || {},
      note: f.interactive ? null : 'Recorded without interrupting the assessment. Interactive challenge is planned for a later release.'
    });
  }

  entries.sort((x, y) => (SEVERITY_RANK[x.severity] ?? 3) - (SEVERITY_RANK[y.severity] ?? 3));

  const counts = entries.reduce((acc, e) => {
    acc[e.severity] = (acc[e.severity] || 0) + 1;
    return acc;
  }, {});

  return {
    annex: 'A',
    title: 'Assumptions and Limitations Register',
    total: entries.length,
    counts: { material: counts.material || 0, notable: counts.notable || 0, info: counts.info || 0 },
    /** Entries that must be disclosed as limitations (everything above info). */
    limitations: entries.filter(e => e.severity !== 'info'),
    entries
  };
}

// ---------------------------------------------------------------------------
// Annex B — Data Gap Ledger
// ---------------------------------------------------------------------------

/**
 * Missing or weak factors. Per the MVP ruling these are calculated silently
 * with a fallback, but always highlighted here — and ranked by the emissions
 * flowing through them, which turns the ledger into a research priority list.
 */
function dataGapLedger(result) {
  const materiality = new Map();
  for (const f of (result.sensitivity && result.sensitivity.factorMateriality) || []) {
    materiality.set(f.key, f);
  }

  const entries = [];
  for (const f of result.factorsUsed || []) {
    const isGap = !!f.gap || !!f.fallback || f.tier === 'Global';
    if (!isGap) continue;
    const m = materiality.get(f.key);
    entries.push({
      factorKey: f.key,
      value: f.value,
      unit: f.unit || null,
      tier: f.tier,
      reference: f.reference,
      gap: f.gap || (f.fallback ? 'Table default applied — no specific row for this item' : 'Global-tier factor; a local value would improve data quality'),
      isFallback: !!f.fallback,
      emissionsThrough_kgCO2e: m ? m.emissionsThrough_kgCO2e : 0,
      sharePct: m ? m.sharePct : 0
    });
  }

  entries.sort((a, b) => b.emissionsThrough_kgCO2e - a.emissionsThrough_kgCO2e);

  return {
    annex: 'B',
    title: 'Data Gap Ledger',
    total: entries.length,
    fallbacks: entries.filter(e => e.isFallback).length,
    globalTier: entries.filter(e => e.tier === 'Global').length,
    /** The factors worth localising first, by emissions flowing through them. */
    researchPriority: entries.slice(0, 5).map((e, i) => ({
      rank: i + 1,
      factorKey: e.factorKey,
      sharePct: e.sharePct,
      gap: e.gap
    })),
    entries,
    note: 'Missing factors are calculated using a documented fallback rather than blocking the assessment. Every fallback is recorded here.'
  };
}

// ---------------------------------------------------------------------------
// Annex C — Audit Trail
// ---------------------------------------------------------------------------

/**
 * Every traced value: the equation that produced it, the inputs that fed it,
 * and the factors it consulted with their tier and source.
 */
function auditTrail(result) {
  const nodes = walk(result.tree || []);
  const entries = nodes
    .filter(n => n.equation)
    .map((n, i) => ({
      step: i + 1,
      module: n.module,
      label: n.label,
      equation: n.equation,
      inputs: n.inputs,
      value: n.value,
      unit: n.unit,
      factors: (n.factors || []).map(f => ({
        key: f.key, value: f.value, unit: f.unit, tier: f.tier,
        reference: f.reference, fallback: !!f.fallback
      }))
    }));

  return {
    annex: 'C',
    title: 'Audit Trail',
    total: entries.length,
    entries,
    note: 'Generated from the calculation itself. Every figure in this disclosure traces to an equation, its inputs, and a named factor source with a data-quality tier.'
  };
}

// ---------------------------------------------------------------------------

/**
 * Build all three registers plus the badge counts the UI shows beside the
 * main result.
 */
function buildRegisters(result) {
  const a = assumptionsRegister(result);
  const b = dataGapLedger(result);
  const c = auditTrail(result);
  return {
    assumptions: a,
    dataGaps: b,
    auditTrail: c,
    badges: { assumptions: a.total, dataGaps: b.total, auditTrail: c.total }
  };
}

module.exports = { buildRegisters, assumptionsRegister, dataGapLedger, auditTrail };
