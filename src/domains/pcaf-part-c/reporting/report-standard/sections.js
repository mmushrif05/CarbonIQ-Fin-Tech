// @ts-check
/**
 * The eleven sections, in the order the PCAF Part C disclosure checklist reads.
 */

'use strict';

const { b, keep } = require('./facts');
const { N, T, F4, pct, score, wscore } = require('./common');

/** The whole document, in the checklist's order. */
function buildSections(f) {
  const cur = f.currency;
  const sections = [];

  // ── 2 Scope and coverage ────────────────────────────────────────────────
  sections.push({
    id: 'coverage', title: 'Scope and coverage',
    blocks: keep([
      f.inventoryNote && b.callout(f.inventoryNote, 'What this report covers'),
      b.h2('Aggregated emissions by line of business'),
      b.table({
        head: ['Line of business', 'No.', `Premium ${cur}`, 'Construction tCO2e', 'Use stage tCO2e', 'Attributed IAE tCO2e', 'Data quality'],
        widths: [2, 0.6, 1.5, 1.5, 1.4, 1.5, 1.2],
        align: ['left', 'right', 'right', 'right', 'right', 'right', 'right'],
        zebra: true,
        rows: f.byLineOfBusiness.map(l => [
          l.lineOfBusiness, String(l.policies), N(l.premium),
          Number(l.construction_tCO2e ?? (l.construction_kgCO2e || 0) / 1000).toFixed(3),
          Number(l.useStage_tCO2e ?? (l.useStage_kgCO2e || 0) / 1000).toFixed(3),
          F4(l.insurerIAE_tCO2e),
          score(l.dataQuality)
        ])
      }),
      b.caption('Construction and use stage are separate columns because they are separate lines. No row in this table sums them.'),

      b.h2('Portfolio coverage'),
      b.figure({
        label: 'Share of the inventory assessed',
        value: pct(f.coveragePct), unit: '',
        note: `${f.assessedPolicies} of ${f.policiesInYear} policies`
      }),
      b.body(f.coverageStatement),
      f.unassessed && f.unassessed.length ? b.table({
        head: ['Not yet assessed', 'Line of business', `Premium ${cur}`],
        widths: [3, 1.4, 1.4], align: ['left', 'left', 'right'],
        rows: f.unassessed.map(u => [`${u.projectName} — ${u.clientName}`, u.lineType, N(u.premium)])
      }) : null,

      b.h2('Exclusions, and why'),
      b.table({
        head: ['Excluded', 'Justification'], widths: [1.5, 4], align: ['left', 'left'],
        rows: f.exclusions.map(e => [e.what, e.why])
      }),

      b.h2('The scope applied'),
      b.table({
        head: ['Tier', 'Modules', 'How it is reported'], widths: [1.1, 1.5, 3.4],
        rows: [
          ['Mandatory', 'A4 + A5', f.scopeStatement.mandatory || 'Construction — the PCAF figure.'],
          ['Optional', 'B1 + B4 + B7', f.scopeStatement.optional || 'Use stage — a separate line, policy gated, never summed with construction.'],
          ['Beyond PCAF', 'B2 + B5 + B8', f.scopeStatement.beyondPcaf || 'Voluntary annex only; never part of any PCAF total.']
        ]
      }),
      b.caption(f.scopeCitation)
    ])
  });

  // ── 3 Gases and units ───────────────────────────────────────────────────
  sections.push({
    id: 'gases', title: 'Gases and units',
    blocks: keep([
      b.body('The seven greenhouse gases covered by the Kyoto Protocol are accounted for wherever they arise in the value chain of an insured project.'),
      b.table({
        head: ['Gas', 'Formula', 'Where it arises in this value chain'],
        widths: [1.5, 0.9, 4.2],
        rows: f.gases.map(g => [g.gas, g.formula, g.arises])
      }),
      b.h2('Global warming potential'),
      b.table({
        head: ['Basis', 'Applied'], widths: [1.6, 4.4],
        rows: [
          ['Time horizon', `${f.gwp.horizonYears}-year`],
          ['Assessment report', f.gwp.assessmentReport],
          ['Applied to', 'Every gas in the table above, converted to carbon dioxide equivalent.']
        ]
      }),
      b.body(f.gwp.note),
      b.callout(f.gwp.caveat, 'Assessment report used'),
      f.gwp.used && f.gwp.used.length ? b.table({
        head: ['Factor', 'Value', 'Source'], widths: [1.6, 0.9, 3.5], align: ['left', 'right', 'left'],
        rows: f.gwp.used.map(g => [g.key, N(g.value), g.source])
      }) : null,
      b.h2('Units'),
      b.body(f.unitsStatement)
    ])
  });

  // ── 4 Absolute emissions ────────────────────────────────────────────────
  const ghgRows = [];
  if (f.ghg) {
    for (const [lineKey, lineLabel] of [['construction', 'Construction (A4 + A5)'], ['useStage', 'Use stage (B1 + B4 + B7)']]) {
      const line = f.ghg[lineKey];
      if (lineKey === 'useStage' && !f.useStageApplies) continue;
      for (const scopeKey of ['scope1and2', 'scope3']) {
        for (const st of line[scopeKey].stages) {
          ghgRows.push([lineLabel, line[scopeKey].short, st.stage, N(st.kgCO2e), T(st.kgCO2e)]);
        }
      }
    }
  }

  sections.push({
    id: 'absolute', title: 'Absolute emissions',
    blocks: keep([
      b.callout(f.insurerScopeNote, 'Whose scope this is'),

      b.h2('The reported figures'),
      b.figure({
        label: 'Construction (A4 + A5) — the PCAF figure',
        value: T(f.construction_kgCO2e), unit: 'tCO2e',
        score: f.kind === 'annual'
          ? `data quality ${wscore(f.dqPremiumWeighted)} (premium-weighted)`
          : `data quality ${score(f.dqScore)} (Option ${f.dqOption})`,
        note: `Attributed to the re/insurer: ${F4(f.insurerIAE_tCO2e)} tCO2e.`
      }),
      f.useStageApplies ? b.figure({
        label: 'Use stage (B1 + B4 + B7) — reported separately',
        value: T(f.useStage_kgCO2e), unit: 'tCO2e',
        // No score here, by design: PCAF publishes no table for this line.
        score: 'not scored — see section 6',
        note: `Attributed to the re/insurer: ${F4(f.useStageShare_tCO2e)} tCO2e. Never added to the figure above.`
      }) : b.callout(f.policyGateStatement, 'Use stage'),

      f.scope1and2_tCO2e !== null ? b.h2('The insured\'s scope 1 and 2, and its scope 3') : null,
      f.scope1and2_tCO2e !== null ? b.table({
        head: ['Line', 'Insured scope', 'Stage', 'kgCO2e', 'tCO2e'],
        widths: [2, 1.2, 0.9, 1.3, 1.1], align: ['left', 'left', 'left', 'right', 'right'],
        zebra: true, rows: ghgRows
      }) : null,
      f.scope1and2_tCO2e !== null ? b.table({
        head: ['Reported', 'Insured scope 1 and 2 (combined) tCO2e', 'Insured scope 3 tCO2e', 'Total tCO2e'],
        widths: [1.8, 2, 1.6, 1.3], align: ['left', 'right', 'right', 'right'],
        rows: [
          Object.assign(['Construction — the PCAF figure',
            T(f.ghg.construction.scope1and2.kgCO2e), T(f.ghg.construction.scope3.kgCO2e),
            T(f.ghg.construction.total_kgCO2e)], { _total: true }),
          ...(f.useStageApplies ? [['Use stage — separate line',
            T(f.ghg.useStage.scope1and2.kgCO2e), T(f.ghg.useStage.scope3.kgCO2e),
            T(f.ghg.useStage.total_kgCO2e)]] : [])
        ]
      }) : null,
      f.scope1and2_tCO2e === null ? b.caption('The insured scope 1 and 2 / scope 3 split is reported per assessment; each assessment report in this reporting year carries it.') : null,

      b.h2('Financed emissions'),
      b.body(f.financedEmissionsStatement),

      b.h2('Per policy'),
      b.table({
        head: ['Policy', 'Line', `Premium ${cur}`, 'Attribution factor', 'Project emissions kgCO2e', 'Attributed tCO2e', 'DQ'],
        widths: [2.4, 0.9, 1.4, 1.4, 1.7, 1.3, 0.8],
        align: ['left', 'left', 'right', 'right', 'right', 'right', 'right'],
        zebra: true,
        rows: f.policyRows.map(r => [
          r.policy, r.lineOfBusiness, N(r.premium),
          r.attributionFactor === null || r.attributionFactor === undefined ? '—' : Number(r.attributionFactor).toFixed(6),
          N(r.projectEmissions_kgCO2e), F4(r.attributed_tCO2e), score(r.dataQuality)
        ])
      }),
      f.drivers && f.drivers.length ? b.h2('What drives the figure') : null,
      f.drivers && f.drivers.length ? b.table({
        head: ['Module', 'kgCO2e', 'Share', 'Label'], widths: [0.9, 1.3, 0.9, 3.4],
        align: ['left', 'right', 'right', 'left'],
        rows: f.drivers.map(d => [d.module, N(d.value), `${Number(d.sharePct).toFixed(1)}%`, d.label])
      }) : null
    ])
  });

  // ── 5 Methodology ───────────────────────────────────────────────────────
  sections.push({
    id: 'methodology', title: 'Methodology',
    blocks: keep([
      b.h2('Attribution'),
      b.callout(f.attributionEquation, 'Equation'),
      b.body(f.attributionNote),

      b.h2('The policy gate'),
      b.body(f.policyGateStatement),
      b.caption(f.scopeCitation),

      f.equations.length ? b.h2('Every equation this run executed') : null,
      f.equations.length ? b.table({
        head: ['Module', 'Equation', 'Result kgCO2e'],
        widths: [0.8, 4.2, 1.1], align: ['left', 'left', 'right'],
        rows: f.equations.map(e => [e.module, e.equation, e.value === undefined ? '—' : N(e.value)])
      }) : null,
      f.equations.length ? b.caption(f.equationsNote
        || 'Extracted from the execution that produced the figures above, not transcribed beside it. The factors each equation consulted are listed in Annex A.') : null
    ])
  });

  // ── 6 Data quality ──────────────────────────────────────────────────────
  sections.push({
    id: 'dataQuality', title: 'Data quality',
    blocks: keep([
      b.callout(f.dqScale, 'The scale'),

      f.dqScore !== null && f.dqScore !== undefined ? b.h2('The score, and the option it comes from') : null,
      f.dqScore !== null && f.dqScore !== undefined ? b.figure({
        label: 'Data quality score',
        value: score(f.dqScore), unit: `(Option ${f.dqOption})`,
        note: f.dqOptionLabel
      }) : null,
      f.dqScore !== null && f.dqScore !== undefined
        ? b.body('PCAF assigns one score per project and decides it by which option was used to estimate the emissions. It is not an average across inputs, modules or lifecycle stages.')
        : null,

      f.dqPremiumWeighted !== null ? b.h2('The disclosed weighted score') : null,
      f.dqPremiumWeighted !== null ? b.figure({
        label: 'Premium-weighted data quality score',
        value: wscore(f.dqPremiumWeighted), unit: 'on the 1-5 scale',
        note: 'Box 6-3 (p.107): sum(premium x score) / sum(premium).'
      }) : null,
      f.dqPremiumWeightedBasis ? b.body(f.dqPremiumWeightedBasis) : null,
      f.dqCeded && f.dqCeded.weighted !== null ? b.body(
        `Treaty reinsurance, weighted by ceded premium (Box 6-4, p.108): ${wscore(f.dqCeded.weighted)}.`) : null,
      f.dqPolicyCoverage && f.dqPolicyCoverage.policiesWithoutScore > 0
        ? b.caption(`${f.dqPolicyCoverage.policiesScored} policies carry both a premium and a score and are weighted; ${f.dqPolicyCoverage.policiesWithoutScore} carry no score and are excluded from the weighting rather than counted as zero.`)
        : null,

      b.h2('Scope 3 reported separately from scopes 1 and 2'),
      b.table({
        head: ['Insured scope', 'Option used', 'Data quality score'],
        widths: [2.2, 3, 1.4], align: ['left', 'left', 'right'],
        rows: [
          ['Scope 1 and 2 (combined)', f.dqScope1and2Option ? `Option ${f.dqScope1and2Option}` : 'per policy',
            f.kind === 'annual' ? wscore(f.dqScope1and2) : score(f.dqScope1and2)],
          ['Scope 3', f.dqScope3Option ? `Option ${f.dqScope3Option}` : 'per policy',
            f.kind === 'annual' ? wscore(f.dqScope3) : score(f.dqScope3)]
        ]
      }),
      b.caption('Chapter 6, p.106 requires the score for scope 3 to be reported separately from the score for scopes 1 and 2. The two rest on different data: site energy on energy consumption, the rest on declared quantities.'),

      b.h2('Optional lifetime (use stage) emissions'),
      b.callout(
        (f.dqUseStage && f.dqUseStage.reason)
          || 'PCAF provides no data quality table for optional lifetime emissions on project insurance, so no score is reported for that line.',
        'Not scored'),
      f.dqUseStage && f.dqUseStage.statements && f.dqUseStage.statements.length
        ? b.bullets(f.dqUseStage.statements) : null,

      b.h2('Table 5.3-2 — how the score is assigned'),
      f.dqTable && f.dqTable.length ? b.table({
        head: ['Option', 'Score', 'Data used to estimate the emissions'],
        widths: [0.7, 0.6, 5], align: ['left', 'right', 'left'],
        zebra: true,
        rows: f.dqTable.map(r => [
          r.option === f.dqOption ? `${r.option}  <` : r.option,
          String(r.score), r.data
        ])
      }) : null,
      f.dqTableCitation ? b.caption(`${f.dqTableCitation}${f.dqOption ? `  The row marked < is the one this report used.` : ''}`) : null,

      f.dqDistribution && f.dqDistribution.length ? b.h2('Distribution across the book') : null,
      f.dqDistribution && f.dqDistribution.length ? b.table({
        head: ['Score', 'Option', 'Assessments', 'kgCO2e', 'Share'],
        widths: [0.6, 2.6, 1.1, 1.4, 0.9], align: ['right', 'left', 'right', 'right', 'right'],
        rows: f.dqDistribution.map(d => [String(d.score), d.label, String(d.assessments), N(d.kgCO2e), `${d.sharePct}%`])
      }) : null,

      /* Fenced off, in words, and labelled on its own heading — so it cannot
         be read as, or lifted out as, a PCAF score. */
      (f.dqInternalAid && f.dqInternalAid.rows.length) || (f.dqInputBasis && f.dqInputBasis.length)
        ? b.h2('Internal transparency aid — not a PCAF data quality score') : null,
      (f.dqInternalAid && f.dqInternalAid.rows.length) || (f.dqInputBasis && f.dqInputBasis.length)
        ? b.callout('The table below is not a PCAF data quality score and must not be quoted as one. It records how strong the evidence behind each input is, so effort can be aimed at what is weakest. It is expressed in words, is never averaged, and never enters the score above.', 'Read this first')
        : null,
      f.dqInternalAid && f.dqInternalAid.rows.length ? b.table({
        head: ['Stage', 'Input', 'Insured scope', 'Basis actually used', 'Evidence', 'Source'],
        widths: [0.7, 1.5, 1, 2.8, 0.9, 2],
        align: ['left', 'left', 'left', 'left', 'left', 'left'],
        zebra: true,
        rows: f.dqInternalAid.rows.map(i => [
          i.stage, i.input,
          i.ghgScope === 'scope1and2' ? 'Scope 1 & 2' : i.ghgScope === 'scope3' ? 'Scope 3' : '—',
          i.basis, i.strength || 'not evaluated', i.source
        ])
      }) : null,
      !f.dqInternalAid && f.dqInputBasis && f.dqInputBasis.length ? b.table({
        head: ['Stage', 'Input', 'Basis predominantly used', 'Evidence', 'Assessments'],
        widths: [0.7, 1.5, 3.4, 0.9, 1],
        align: ['left', 'left', 'left', 'left', 'right'],
        zebra: true,
        rows: f.dqInputBasis.map(i => [
          i.stage, i.input,
          i.predominantBasis + (i.basesInUse > 1 ? `  (${i.basesInUse} bases in use)` : ''),
          i.strength || 'not evaluated', String(i.assessments)
        ])
      }) : null,

      f.dqImprovement && f.dqImprovement.actions && f.dqImprovement.actions.length ? b.h2('What would improve it') : null,
      f.dqImprovement && f.dqImprovement.actions && f.dqImprovement.actions.length ? b.table({
        head: ['#', 'Project', 'Share of figure', 'Now', 'Achievable'],
        widths: [0.4, 3, 1.1, 0.7, 0.9], align: ['right', 'left', 'right', 'right', 'right'],
        rows: f.dqImprovement.actions.map(a => [String(a.rank), a.projectName, `${a.sharePct}%`, String(a.currentScore), String(a.achievableScore)])
      }) : null,

      f.dqStatement ? b.h2('Generated data-quality statement') : null,
      f.dqStatement ? b.callout(f.dqStatement) : null
    ])
  });

  // ── 7 Recalculation ─────────────────────────────────────────────────────
  sections.push({
    id: 'recalculation', title: 'Recalculation and significance threshold',
    blocks: keep([
      b.table({
        head: ['Item', 'Stated'], widths: [2.6, 3.4],
        rows: [
          ['Inventory base year', f.baseYear ? String(f.baseYear) : 'Not yet stated for this reporting entity'],
          ['Significance threshold — triggers a base-year recalculation', f.significanceThresholdPct === null ? 'Not stated' : `${f.significanceThresholdPct}% cumulative change in base-year emissions`],
          ['Restatement threshold — makes a new version of a locked assessment a restatement', f.restatementThresholdPct === null ? 'Not stated' : `${f.restatementThresholdPct}% movement in the construction figure`]
        ]
      }),
      b.h2('What triggers a recalculation of base-year emissions'),
      f.recalculationTriggers.length ? b.bullets(f.recalculationTriggers)
        : b.body('No recalculation protocol has been stated for this reporting entity. A Part C disclosure requires one.'),
      f.recalculationPolicy ? b.body(f.recalculationPolicy) : null,
      b.caption('Triggers follow the GHG Protocol Corporate Value Chain (Scope 3) Standard, phrased for an insurance book.'),
      !f.baseYear ? b.callout('No base year is stated for this reporting entity. The report says so rather than implying the current year, because a base year is a claim about history and belongs to the entity, not to its software.', 'Open item') : null,

      f.restatements.length ? b.h2('Restatements in this reporting year') : null,
      f.restatements.length ? b.table({
        head: ['Project', 'As previously reported', 'As restated', 'Movement', 'Reason'],
        widths: [2, 1.4, 1.4, 0.9, 2.6], align: ['left', 'right', 'right', 'right', 'left'],
        rows: f.restatements.map(r => [
          r.projectName || r.assessmentId || '—',
          N(r.previousValue), N(r.newValue),
          r.deltaPct === undefined ? '—' : `${Number(r.deltaPct).toFixed(2)}%`,
          r.reason || 'Not stated'
        ])
      }) : null,
      f.restatementNote ? b.caption(f.restatementNote) : null
    ])
  });

  // ── 8 Emission intensity ────────────────────────────────────────────────
  sections.push({
    id: 'intensity', title: 'Emission intensity',
    blocks: keep([
      b.body(`Economic emission intensity, reported per million ${cur} of premium and per million ${cur} of insured project cost. Premium is what the re/insurer earns; project cost is what it stands behind. A book can move sharply on one measure while barely moving on the other, so both are given.`),
      b.table({
        head: ['Measure', 'Value', 'Unit'], widths: [3.2, 1.4, 1.6],
        align: ['left', 'right', 'left'],
        rows: [
          ['Construction emissions per million of premium', f.intensityPerMillionPremium === null ? 'not available' : N(f.intensityPerMillionPremium), `tCO2e / ${cur}M premium`],
          ['Attributed emissions per million of premium', f.intensityIaePerMillionPremium === null ? 'not available' : N(f.intensityIaePerMillionPremium), `tCO2e / ${cur}M premium`],
          ['Construction emissions per million of insured project cost', f.intensityPerMillionCost === null ? 'not available' : N(f.intensityPerMillionCost), `tCO2e / ${cur}M cost`],
          ['Construction emissions per m2 of insured floor area', f.intensityPerM2 === null ? 'not available' : N(f.intensityPerM2), 'kgCO2e / m2']
        ]
      }),
      b.table({
        head: ['Denominator', 'Value'], widths: [2.6, 3.4], align: ['left', 'right'],
        rows: [
          [`Premium (${cur})`, N(f.premiumTotal)],
          [`Insured project cost (${cur})`, N(f.projectCostTotal)],
          ['Insured floor area (m2)', N(f.insuredArea_m2)]
        ]
      }),
      b.caption('Intensity is reported for the construction line. The use-stage line is never added into it.')
    ])
  });

  // ── 9 Limitations ───────────────────────────────────────────────────────
  sections.push({
    id: 'limitations', title: 'Limitations and assumptions',
    blocks: keep([
      b.body('Recorded by the calculation engine at the time each figure was produced, not written afterwards. A limitation that recurs across projects is listed once with the count.'),
      f.limitations.length ? b.table({
        head: ['Severity', 'Limitation', f.kind === 'annual' ? 'Projects' : 'Module'],
        widths: [0.9, 4.5, 1.2], align: ['left', 'left', 'left'],
        zebra: true,
        rows: f.limitations.map(l => [
          l.severity || 'info', l.message,
          f.kind === 'annual'
            ? String(l.occurrences || (l.projects || []).length || 1)
            : (l.module || l.source || '—')
        ])
      }) : b.body('The engine recorded no limitation for this run.'),
      f.dataGaps.length ? b.h2('Data gaps and the research priority') : null,
      f.dataGaps.length ? b.table({
        head: ['Factor', 'Gap', 'Tier'], widths: [1.8, 4, 0.9],
        rows: f.dataGaps.slice(0, 40).map(g => [g.key || g.factor || '—', g.message || g.note || '—', g.tier || 'n/a'])
      }) : null
    ])
  });

  // ── 10 Conformance ──────────────────────────────────────────────────────
  sections.push({
    id: 'conformance', title: 'Conformance statement',
    blocks: keep([
      b.callout(f.conformanceStatement, 'Statement'),
      b.body('Conformance is a statement by the preparer about the method applied. It is not an endorsement, approval or certification by PCAF, which does not approve or certify software or disclosures. No part of this document claims otherwise.'),
      f.conformanceRules.length ? b.h2('Rule, implementation, and the test that proves it') : null,
      f.conformanceRules.length ? b.table({
        head: ['Rule', 'Clause', 'Status'], widths: [4, 1.6, 1],
        rows: f.conformanceRules.map(r => [r.rule, r.clause, r.status])
      }) : null,
      f.conformanceRules.length ? b.caption('Each rule cites the code that enforces it and the test that proves it; the build fails if either ceases to exist.') : null
    ])
  });

  return sections;
}

module.exports = { buildSections };
