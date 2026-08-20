/**
 * CarbonIQ FinTech — PCAF Part C: the disclosure checklist, completed
 *
 * PCAF's Secretariat reviews a disclosure against a checklist. A report that
 * ships with that checklist already answered — item by item, each pointing
 * at the section that evidences it — is reviewable in one pass rather than
 * three.
 *
 * What this is, precisely: a self-assessment against the disclosure
 * requirements of Part C Chapter 6, "Reporting requirements and
 * recommendations". The item wording is CarbonIQ's own and the clause
 * reference is printed beside every item, so a reviewer can check each
 * answer against the published standard rather than taking this document's
 * word for the question. It is not a reproduction of PCAF's own form, and
 * the annex says so on its face.
 *
 * Every answer is derived from the facts the report was built from — the
 * same object its sections render. An item cannot answer Yes to something
 * the report does not contain, because there is nothing else for it to read.
 */

'use strict';

const SHALL  = 'shall';
const SHOULD = 'should';

const YES = 'Yes';
const NO  = 'No';
const NA  = 'Not applicable';

/**
 * The items, in the checklist's own order.
 *
 * `test(facts)` returns true, false, or the string 'na' where the item does
 * not apply to this report; `justify(facts)` supplies the reason whenever the
 * answer is not Yes, because an unexplained No is the thing a reviewer has to
 * come back and ask about.
 */
const ITEMS = [
  // ── Coverage ────────────────────────────────────────────────────────────
  {
    id: 'COV-1', group: 'Coverage', clause: 'Part C ch.6, COVERAGE (p.103)', duty: SHALL,
    item: 'Aggregated absolute insurance-associated emissions are reported by line of business.',
    section: 'coverage',
    test: f => Array.isArray(f.byLineOfBusiness) && f.byLineOfBusiness.length > 0,
    justify: () => 'No policy in this report carries a line of business.'
  },
  {
    id: 'COV-2', group: 'Coverage', clause: 'Part C ch.6, COVERAGE (p.103)', duty: SHALL,
    item: 'The percentage of the total re/insurance portfolio covered by the inventory is stated.',
    section: 'coverage',
    test: f => f.coveragePct !== null && f.coveragePct !== undefined,
    justify: () => 'Portfolio coverage could not be computed for this report.'
  },
  {
    id: 'COV-3', group: 'Coverage', clause: 'Part C ch.6, COVERAGE (p.103)', duty: SHALL,
    item: 'Exclusions from the inventory are stated with a justification.',
    section: 'coverage',
    test: f => Array.isArray(f.exclusions) && f.exclusions.length > 0,
    justify: () => 'Nothing is excluded from this inventory.'
  },
  {
    id: 'COV-4', group: 'Coverage', clause: 'Part C v2 §5.3 (p.51)', duty: SHALL,
    item: 'The scope applied is stated: A4+A5 mandatory, use stage optional and separate, beyond-PCAF excluded.',
    section: 'coverage',
    test: f => !!f.scopeStatement
  },

  // ── Gases and units ─────────────────────────────────────────────────────
  {
    id: 'GAS-1', group: 'Gases and units', clause: 'Part C ch.6, GASES AND UNITS (p.103)', duty: SHALL,
    item: 'The seven Kyoto Protocol gases are accounted for where emitted in the value chain.',
    section: 'gases',
    test: f => Array.isArray(f.gases) && f.gases.length === 7
  },
  {
    id: 'GAS-2', group: 'Gases and units', clause: 'Part C ch.6, GASES AND UNITS (pp.103, 61)', duty: SHALL,
    item: 'The global warming potential basis is named: 100-year horizon and the IPCC assessment report used.',
    section: 'gases',
    test: f => !!(f.gwp && f.gwp.assessmentReport && f.gwp.horizonYears)
  },
  {
    id: 'GAS-3', group: 'Gases and units', clause: 'Part C ch.6, GASES AND UNITS (p.103)', duty: SHALL,
    item: 'Units are stated for every reported figure.',
    section: 'gases',
    test: f => !!f.unitsStatement
  },

  // ── Absolute emissions ──────────────────────────────────────────────────
  {
    id: 'ABS-1', group: 'Absolute emissions', clause: 'Part C ch.6, ABSOLUTE EMISSIONS (pp.104-105)', duty: SHALL,
    item: 'Absolute emissions for the insured\'s scope 1 and 2 combined are reported.',
    section: 'absolute',
    test: f => f.scope1and2_tCO2e !== null && f.scope1and2_tCO2e !== undefined
  },
  {
    id: 'ABS-2', group: 'Absolute emissions', clause: 'Part C ch.6, ABSOLUTE EMISSIONS (pp.104-105)', duty: SHALL,
    item: 'The insured\'s scope 3 emissions are reported separately from its scope 1 and 2.',
    section: 'absolute',
    test: f => f.scope3_tCO2e !== null && f.scope3_tCO2e !== undefined
  },
  {
    id: 'ABS-3', group: 'Absolute emissions', clause: 'Part C ch.6, ABSOLUTE EMISSIONS (pp.104-105)', duty: SHALL,
    item: 'Financed emissions and insurance-associated emissions are reported separately and never combined.',
    section: 'absolute',
    test: f => !!f.financedEmissionsStatement
  },
  {
    id: 'ABS-4', group: 'Absolute emissions', clause: 'Part C v2 §5.3', duty: SHALL,
    item: 'The optional use-stage line is reported separately from the mandatory construction figure and never summed with it.',
    section: 'absolute',
    test: f => f.useStageApplies ? !!f.useStageReportedSeparately : 'na',
    justify: () => 'Non-applicable — construction-only cover (CAR/EAR) carries no use stage, so B1, B4 and B7 are zero by scope rule rather than by omission.'
  },
  {
    id: 'ABS-5', group: 'Absolute emissions', clause: 'Part C ch.6, ABSOLUTE EMISSIONS (pp.104-105)', duty: SHOULD,
    item: 'A per-policy table is given: policy, line of business, premium, attribution factor, project emissions and attributed emissions.',
    section: 'absolute',
    test: f => Array.isArray(f.policyRows) && f.policyRows.length > 0
  },

  // ── Methodology ─────────────────────────────────────────────────────────
  {
    id: 'MET-1', group: 'Methodology', clause: 'Part C ch.6, METHODOLOGY', duty: SHALL,
    item: 'The attribution equation and its denominator are stated.',
    section: 'methodology',
    test: f => !!f.attributionEquation
  },
  {
    id: 'MET-2', group: 'Methodology', clause: 'Part C ch.6, METHODOLOGY', duty: SHALL,
    item: 'Every module equation is given with its inputs, factors and named sources.',
    section: 'methodology',
    test: f => Array.isArray(f.equations) && f.equations.length > 0
  },
  {
    id: 'MET-3', group: 'Methodology', clause: 'Part C v2 §5.3 (p.51)', duty: SHALL,
    item: 'The policy gate is stated: a construction-only policy carries zero use stage by scope rule, not by omission.',
    section: 'methodology',
    test: f => !!f.policyGateStatement
  },
  {
    id: 'MET-4', group: 'Methodology', clause: 'Part C v2 §5.3 "Emission scopes covered" (p.51)', duty: SHALL,
    item: 'The clause governing the scope applied is cited.',
    section: 'methodology',
    test: f => !!f.scopeCitation
  },

  // ── Data and data quality ───────────────────────────────────────────────
  {
    id: 'DQ-1', group: 'Data and data quality', clause: 'Part C ch.6, DATA AND DATA QUALITY (p.106)', duty: SHALL,
    item: 'A weighted data-quality score is disclosed, weighted by outstanding premium (Box 6-3).',
    section: 'dataQuality',
    test: f => f.dqPremiumWeighted !== null && f.dqPremiumWeighted !== undefined,
    justify: () => 'No policy in this report carries both a premium and a data-quality score, so a premium-weighted score cannot be formed.'
  },
  {
    id: 'DQ-2', group: 'Data and data quality', clause: 'Part C ch.6, DATA AND DATA QUALITY (p.106)', duty: SHALL,
    item: 'The scope 3 data-quality score is reported separately from the scope 1 and 2 score.',
    section: 'dataQuality',
    test: f => f.dqScope3 !== null && f.dqScope3 !== undefined
        && f.dqScope1and2 !== null && f.dqScope1and2 !== undefined
  },
  {
    id: 'DQ-3', group: 'Data and data quality', clause: 'Part C ch.6, DATA AND DATA QUALITY (p.106)', duty: SHOULD,
    item: 'The scoring table (Table 5.3-2) and the basis actually used for each input are given.',
    section: 'dataQuality',
    /* A per-assessment report lists the basis input by input; an annual
       disclosure has no single set of inputs, so it reports the basis each
       input predominantly took across the book and the range of scores it
       produced. Either satisfies the requirement; neither is a substitute
       for the rubric, which both must carry. */
    test: f => Array.isArray(f.dqTable) && f.dqTable.length === 6
      && ((f.dqInternalAid && f.dqInternalAid.rows.length > 0)
        || (Array.isArray(f.dqInputBasis) && f.dqInputBasis.length > 0)),
    justify: f => Array.isArray(f.dqTable) && f.dqTable.length === 6
      ? 'No assessment in this report records the basis behind each input, so the evidence supporting the score cannot be shown.'
      : 'Table 5.3-2 is not reproduced in this report.'
  },
  {
    id: 'DQ-4', group: 'Data and data quality', clause: 'Part C ch.6, DATA AND DATA QUALITY (p.106)', duty: SHOULD,
    item: 'The reported construction figure carries its data-quality score and the option behind it.',
    section: 'dataQuality',
    /* Deliberately not "every figure": the optional use-stage line carries
       no score because PCAF publishes no table for it, and inventing one to
       satisfy a checkbox would be the worse failure. */
    test: f => f.everyFigureScored === true,
    justify: () => 'The construction figure in this report carries no data-quality score.'
  },
  {
    id: 'DQ-5', group: 'Data and data quality', clause: 'Part C Table 5.3-2 (p.58)', duty: SHALL,
    item: 'The optional use-stage line is not given a numeric data-quality score, since the standard publishes no table for it; its basis is described instead.',
    section: 'dataQuality',
    test: f => !!(f.dqUseStage && f.dqUseStage.scored === false)
  },

  // ── Recalculation ───────────────────────────────────────────────────────
  {
    id: 'REC-1', group: 'Recalculation', clause: 'Part C ch.6, RECALCULATION (p.99)', duty: SHALL,
    item: 'A base-year recalculation protocol is stated: the circumstances that trigger recalculation.',
    section: 'recalculation',
    test: f => Array.isArray(f.recalculationTriggers) && f.recalculationTriggers.length > 0
  },
  {
    id: 'REC-2', group: 'Recalculation', clause: 'Part C ch.6, RECALCULATION (p.99)', duty: SHALL,
    item: 'The significance threshold that triggers a base-year recalculation is stated as a percentage.',
    section: 'recalculation',
    test: f => typeof f.significanceThresholdPct === 'number'
  },
  {
    id: 'REC-3', group: 'Recalculation', clause: 'Part C ch.6, RECALCULATION (p.99)', duty: SHOULD,
    item: 'The inventory base year is stated.',
    section: 'recalculation',
    test: f => !!f.baseYear,
    justify: () => 'No base year has been set for this reporting entity. The first year disclosed would ordinarily become the base year; stating one is a decision for the entity and the report does not assume it.'
  },

  // ── Emission intensity ──────────────────────────────────────────────────
  {
    id: 'INT-1', group: 'Emission intensity', clause: 'Part C ch.6, recommendation (p.101)', duty: SHOULD,
    item: 'Economic emission intensity is reported, in tCO2e per million of premium or revenue.',
    section: 'intensity',
    test: f => f.intensityPerMillionPremium !== null && f.intensityPerMillionPremium !== undefined,
    justify: () => 'No premium is recorded against the policies in this report, so an economic intensity cannot be formed.'
  },

  // ── Limitations ─────────────────────────────────────────────────────────
  {
    id: 'LIM-1', group: 'Limitations', clause: 'Part C ch.6, METHODOLOGY', duty: SHALL,
    item: 'Limitations and assumptions are named rather than buried.',
    section: 'limitations',
    test: f => Array.isArray(f.limitations) && f.limitations.length > 0
  },

  // ── Conformance ─────────────────────────────────────────────────────────
  {
    id: 'CNF-1', group: 'Conformance', clause: 'Part C ch.6', duty: SHALL,
    item: 'A conformance statement names the standard and its edition.',
    section: 'conformance',
    test: f => !!f.conformanceStatement && /in conformance with/i.test(f.conformanceStatement)
  },
  {
    id: 'CNF-2', group: 'Conformance', clause: 'PCAF use-of-name policy', duty: SHALL,
    item: 'The report claims conformance only, and nowhere claims PCAF approval, endorsement or certification.',
    section: 'conformance',
    test: f => f.endorsementLanguageFound === false
  },

  // ── Annex ───────────────────────────────────────────────────────────────
  {
    id: 'ANX-1', group: 'Annex', clause: 'Part C ch.6, DATA AND DATA QUALITY (p.106)', duty: SHOULD,
    item: 'A factor register gives value, unit, data-quality tier and named source for every factor used.',
    section: 'annexFactors',
    test: f => Array.isArray(f.factorRegister) && f.factorRegister.length > 0
  },
  {
    id: 'ANX-2', group: 'Annex', clause: 'Audit and assurance', duty: SHOULD,
    item: 'A calculation trace is given for every reported figure.',
    section: 'annexTrace',
    test: f => f.auditTrailEntries > 0
  },
  {
    id: 'ANX-3', group: 'Annex', clause: 'Part C ch.6', duty: SHOULD,
    item: 'A completed disclosure checklist is included.',
    section: 'annexChecklist',
    test: () => true
  }
];

/**
 * Answer every item from the facts the report was built on.
 *
 * @param {Object} facts   assembled by the report model builder
 * @returns {Object} header, items and a summary of what was met
 */
function completeChecklist(facts, meta = {}) {
  const items = ITEMS.map(def => {
    let raw;
    try { raw = def.test(facts); } catch (_) { raw = false; }

    const answer = raw === 'na' ? NA : raw ? YES : NO;
    const justification = answer === YES ? null
      : (def.justify ? def.justify(facts) : 'Not present in this report.');

    return {
      id: def.id, group: def.group, clause: def.clause, duty: def.duty,
      item: def.item, section: def.section, answer, justification
    };
  });

  const required = items.filter(i => i.duty === SHALL);
  const recommended = items.filter(i => i.duty === SHOULD);
  const met = i => i.answer === YES || i.answer === NA;

  return {
    title: 'PCAF Disclosure Checklist for Part C — completed',
    provenance:
      'A self-assessment against the disclosure requirements of PCAF Part C, Chapter 6 ' +
      '("Reporting requirements and recommendations"). The wording of each item is ' +
      'CarbonIQ\'s and the governing clause is printed beside it, so each answer can be ' +
      'checked against the published standard. This annex is not a reproduction of any ' +
      'form published by PCAF, and inclusion of a completed checklist is not an ' +
      'endorsement, approval or certification by PCAF.',
    header: {
      reinsurer: meta.insurer || 'Not stated',
      reportTitle: meta.title || 'Insurance-Associated Emissions Disclosure',
      reportingYear: meta.reportingYear ?? null,
      publicationDate: meta.publishedAt || null,
      reportReference: meta.reportId || null,
      url: meta.url || null
    },
    legend: {
      shall: 'Requirement — the standard says "shall".',
      should: 'Recommendation — the standard says "should".'
    },
    items,
    summary: {
      total: items.length,
      answeredYes: items.filter(i => i.answer === YES).length,
      notApplicable: items.filter(i => i.answer === NA).length,
      answeredNo: items.filter(i => i.answer === NO).length,
      requirements: { total: required.length, met: required.filter(met).length },
      recommendations: { total: recommended.length, met: recommended.filter(met).length }
    }
  };
}

module.exports = { ITEMS, completeChecklist, SHALL, SHOULD, YES, NO, NA };
