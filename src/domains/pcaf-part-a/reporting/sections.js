// @ts-check
/**
 * The Part A §5.2 disclosure, in the order PCAF Chapter 6 reads
 * (pp.160–174). One content model; the platform renderer draws it to PDF and
 * to Word. Two documents share it — the annual disclosure of one reporting
 * year, and the per-exposure report of one borrower — so a requirement
 * satisfied in one cannot quietly go missing from the other.
 *
 * Section order: scope and coverage · gases and units · absolute emissions ·
 * methodology · data quality · recalculation and significance · emission
 * intensity · limitations and the data checks · conformance. The annexes
 * follow — the factor set and baseline versions, the Annex 10.2 table, and
 * the completed disclosure checklist.
 */

'use strict';

const { b, keep } = require('../../../platform/reporting/report-standard/blocks');

const N = n => (n === null || n === undefined) ? 'not stated'
  : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
const T = n => (n === null || n === undefined) ? '—' : Number(n).toFixed(3);
const pct = n => (n === null || n === undefined) ? 'not stated' : `${(Number(n) * 100).toFixed(2)}%`;
const score = n => (n === null || n === undefined) ? 'not scored' : String(n);

/* Chapter 6 asks the emission-intensive sectors to be singled out. */
const INTENSIVE = new Set(['electricity', 'manufacturing_cement', 'mining', 'transport',
  'manufacturing', 'water_waste', 'agriculture_rice']);

function coverageSection(f) {
  return {
    id: 'coverage', title: 'Scope and coverage',
    blocks: keep([
      b.callout(f.scopeStatement, 'What this report covers'),
      b.body(`Asset class: ${f.assetClassLabel}. Reporting year: ${f.reportingYear}. `
        + `The position is taken at the fiscal year-end, which is how Part A accounts for `
        + `financed emissions (Chapter 4).`),
      f.kind === 'disclosure' ? b.h2('Coverage of the book') : null,
      f.kind === 'disclosure' ? b.figure({
        label: 'Share of total loans and investments assessed',
        value: pct(f.coverage.share), unit: '',
        note: f.coverage.totalLoansAndInvestments
          ? `${N(f.coverage.assessedOutstanding)} of ${N(f.coverage.totalLoansAndInvestments)} ${f.currency}`
            + (f.coverage.statedBy ? `, book total stated by ${f.coverage.statedBy}` : '')
          : 'Book total not yet stated'
      }) : null,
      b.body(f.coverageStatement),
      f.kind === 'disclosure' && f.exposures ? b.body(`${f.exposures} exposure(s) are recorded for the year.`) : null,
    ])
  };
}

function gasesSection(f) {
  return {
    id: 'gases', title: 'Gases and units',
    blocks: keep([
      b.body('Emissions are reported in tonnes of carbon dioxide equivalent (tCO2e), '
        + 'using the IPCC 100-year global warming potentials of the latest assessment '
        + 'report. Borrower figures cover the seven Kyoto Protocol gases where the '
        + 'borrower reports them; a sector-average estimate carries whichever gases its '
        + 'emission factor covers, which the factor register names.'),
      b.table({
        head: ['Gas', 'Formula', 'Where it arises for a lending book'],
        widths: [1.6, 0.8, 3.6], align: ['left', 'left', 'left'], zebra: true,
        rows: f.KYOTO_GASES.map(g => [g.gas, g.formula, g.arises])
      }),
      b.body('Biogenic carbon, where a borrower reports it, is stated separately from the '
        + 'fossil inventory and never netted against it.'),
    ])
  };
}

function absoluteSection(f) {
  if (f.kind === 'exposure') {
    const l = f.lines;
    return {
      id: 'absolute', title: 'Absolute emissions',
      blocks: keep([
        b.figure({ label: 'Financed scope 1 and 2', value: T(l.scope1And2), unit: 'tCO2e',
          score: `Data quality score: ${score(f.dataQuality.scope1And2 && f.dataQuality.scope1And2.score)} (Option ${f.dataQuality.scope1And2 && f.dataQuality.scope1And2.option}). 1 is the highest quality, 5 the lowest.` }),
        b.figure({ label: 'Financed scope 3 — a separate line', value: l.scope3 === null ? '—' : T(l.scope3), unit: 'tCO2e',
          note: l.scope3Reason || 'Reported apart from scope 1 and 2 (§5.2, p.56); never summed with it.' }),
        b.table({
          head: ['Line', 'tCO2e', 'Note'], widths: [2, 1, 3], align: ['left', 'right', 'left'],
          rows: [
            ['Financed scope 1 and 2', T(l.scope1And2), 'The insurer’s attributed share of the borrower’s scope 1 and 2.'],
            ['Financed scope 3', l.scope3 === null ? '—' : T(l.scope3), l.scope3Reason || 'A separate line.'],
            ['Removals', l.removals === null ? '—' : T(l.removals), 'Reported apart from the inventory, netted against nothing (Part A, p.126).'],
            ['Carbon credits generated', l.creditsGenerated === null ? '—' : T(l.creditsGenerated), 'Apart from the inventory.'],
            ['Carbon credits retired', l.creditsRetired === null ? '—' : T(l.creditsRetired), 'Apart from the inventory.'],
          ]
        }),
        b.caption('No row in this table sums scope 1 and 2 with scope 3, and no row nets a credit or a removal against the inventory.'),
      ])
    };
  }
  const l = f.lines;
  return {
    id: 'absolute', title: 'Absolute emissions',
    blocks: keep([
      b.figure({ label: 'Financed scope 1 and 2 across the class', value: T(l.scope1And2), unit: 'tCO2e',
        score: `Weighted data quality score: ${score(f.dataQuality.scope1And2)} (Box 6.1-6, p.168). 1 is the highest quality, 5 the lowest.` }),
      b.figure({ label: 'Financed scope 3 — a separate line', value: T(l.scope3), unit: 'tCO2e',
        note: `${l.scope3Counted} exposure(s) carried a scope 3 figure; ${l.scope3Absent} did not and said why.` }),
      b.table({
        head: ['Line', 'tCO2e', 'Note'], widths: [2, 1, 3], align: ['left', 'right', 'left'],
        rows: [
          ['Financed scope 1 and 2', T(l.scope1And2), 'Scope 3 Category 15 in full — the attributed share of borrower scope 1 and 2.'],
          ['Financed scope 3', T(l.scope3), 'A separate line; never summed with scope 1 and 2.'],
          ['Removals', l.removals === null ? '—' : T(l.removals), 'Reported apart from the inventory (Part A, p.126).'],
          ['Carbon credits generated', l.creditsGenerated === null ? '—' : T(l.creditsGenerated), 'Apart.'],
          ['Carbon credits retired', l.creditsRetired === null ? '—' : T(l.creditsRetired), 'Apart.'],
        ]
      }),
      b.caption('No row sums scope 1 and 2 with scope 3, and no row nets a credit or a removal against the inventory (Part A, p.126).'),
      f.financialSector ? b.callout(
        `Financial-sector borrowers are rolled up separately: ${f.financialSector.exposures} exposure(s), `
        + `scope 1 and 2 ${T(f.financialSector.scope1And2)} tCO2e, scope 3 ${T(f.financialSector.scope3)} tCO2e. `
        + (f.financialSector.note || 'The scope 3 of a financial institution includes its own financed emissions, '
          + 'so the double count is made visible rather than hidden in the total (§5.2, p.56).'),
        'Financed emissions to the financial sector') : null,
    ])
  };
}

function methodologySection(f) {
  const set = f.factorSet;
  return {
    id: 'methodology', title: 'Methodology',
    blocks: keep([
      b.body('Financed emissions are the borrower’s emissions multiplied by an attribution '
        + 'factor: the outstanding amount over the borrower’s value — EVIC where the borrower '
        + 'is listed, total equity plus debt otherwise (§5.2, p.57). The borrower’s emissions '
        + 'are reported by the borrower where held, and estimated from a sector-average '
        + 'factor otherwise; the data-quality score records which option was used.'),
      b.body('The engine performs every arithmetic operation. Nothing in this report is '
        + 'computed by a language model, and no figure here rests on one. Each figure traces '
        + 'to the exposure the register holds and to the factor set named below.'),
      set ? b.body(`Sector factor set: ${set.tables.map(t => `${t.table} v${t.version} (${t.status})`).join(', ')}; `
        + `SHA-256 over the canonical form, ${set.checksum.slice(0, 16)}. `
        + (set.provisionalTables.length
          ? `Provisional pending a released regional value: ${set.provisionalTables.join(', ')}. A provisional row carries the gap it stands in for.`
          : 'Every table is released.')) : null,
      f.band ? b.body(`Sector intensity bands (the plausibility check): ${f.band.basis}`
        + (f.band.provisional ? ' These are illustrative until a baseline is released.' : '')) : null,
    ])
  };
}

function dataQualitySection(f) {
  const dq = f.dataQuality;
  if (f.kind === 'exposure') {
    return {
      id: 'dataquality', title: 'Data quality',
      blocks: keep([
        b.body('PCAF scores data quality on a 1–5 scale by the option used to estimate the '
          + 'figure (Table 5.2-1). 1 is the highest quality, 5 the lowest. A score is a '
          + 'category, not a mark out of five, and scope 3 is scored apart from scope 1 and 2.'),
        b.table({
          head: ['Scope', 'Option', 'Score'], widths: [2, 2, 1.5], align: ['left', 'left', 'right'],
          rows: [
            ['Scope 1 and 2', (dq.scope1And2 && dq.scope1And2.option) || 'n/a', score(dq.scope1And2 && dq.scope1And2.score)],
            ['Scope 3', dq.scope3 && !dq.scope3.absent ? dq.scope3.option : 'not scored',
              dq.scope3 && !dq.scope3.absent ? score(dq.scope3.score) : '—'],
          ]
        }),
      ])
    };
  }
  return {
    id: 'dataquality', title: 'Data quality',
    blocks: keep([
      b.body('The disclosed score is weighted by outstanding amount (Box 6.1-6, p.168), '
        + 'with scope 3 weighted apart from scope 1 and 2 (p.167). An exposure carrying no '
        + 'score is excluded from the weighting, not counted as zero. 1 is the highest '
        + 'quality, 5 the lowest; the score is a category, never a mark out of five.'),
      b.table({
        head: ['', 'Weighted score', 'Excluded, no score'], widths: [2.5, 1.5, 1.5], align: ['left', 'right', 'right'],
        rows: [
          ['Scope 1 and 2', score(dq.scope1And2), String(dq.excludedScope1And2 || 0)],
          ['Scope 3', score(dq.scope3), String(dq.excludedScope3 || 0)],
        ]
      }),
      dq.note ? b.caption(dq.note) : null,
    ])
  };
}

function recalculationSection(f) {
  const r = f.recalculation || { baseYear: null, significanceThresholdPct: null, triggers: [], policy: '' };
  return {
    id: 'recalculation', title: 'Recalculation and significance',
    blocks: keep([
      b.body('A recalculation of the base year is a "shall" under Chapter 6 when the book, '
        + 'the method or a factor changes materially. The base year and the significance '
        + 'threshold belong to the reporting entity; where none has been set, this report '
        + 'states so rather than implying the current year — a base year is a claim about '
        + 'history and belongs to the entity, not to its software.'),
      b.table({
        head: ['Item', 'This reporting entity'],
        widths: [3.2, 2.8], align: ['left', 'left'],
        rows: [
          ['Inventory base year', r.baseYear ? String(r.baseYear) : 'Not yet stated for this reporting entity'],
          ['Significance threshold — triggers a recalculation of base-year emissions',
            r.significanceThresholdPct === null || r.significanceThresholdPct === undefined
              ? 'Not stated'
              : `${r.significanceThresholdPct}% movement in a reported figure`],
        ],
      }),
      b.h2('What triggers a recalculation'),
      r.triggers.length
        ? b.bullets(r.triggers)
        : b.body('No recalculation protocol has been stated for this reporting entity. A §5.2 '
          + 'disclosure requires one.'),
      r.policy ? b.body(r.policy) : null,
      !r.baseYear
        ? b.callout('No base year is stated for this reporting entity. The report says so rather than '
          + 'implying the current year, because a base year is a claim about history and belongs to the '
          + 'entity, not to its software.', 'Open item')
        : null,
      b.body('The register holds both the input a bank keyed and the result the engine '
        + 'computed. A recomputation reruns the engine over the input already held and '
        + 'reports what moved across every line and both scores, and whether the movement '
        + 'reaches the significance threshold above — so a change in a factor or a baseline is '
        + 'a decision somebody takes rather than something that happens to them.'),
    ])
  };
}

function intensitySection(f) {
  if (f.kind === 'exposure') {
    return {
      id: 'intensity', title: 'Emission intensity',
      blocks: keep([
        b.figure({ label: 'Economic emission intensity', value: N(f.economicIntensity), unit: `tCO2e per million ${f.currency}`,
          note: 'Financed scope 1 and 2 per million of the outstanding amount (PCAF Disclosure Checklist Part A, p.127).' }),
      ])
    };
  }
  return {
    id: 'intensity', title: 'Emission intensity',
    blocks: keep([
      b.body('Economic emission intensity — financed scope 1 and 2 per million of the '
        + 'currency outstanding — is reported per exposure and can be aggregated across the '
        + 'class (p.127). A physical intensity per sector is not reported: it needs a '
        + 'physical activity denominator this asset class does not hold.'),
    ])
  };
}

function limitationsSection(f) {
  if (f.kind === 'exposure') {
    const findings = f.findings || [];
    return {
      id: 'limitations', title: 'Limitations, and what the data says about itself',
      blocks: keep([
        b.body('The checks below follow the rule that where an independent path to a figure '
          + 'exists it is recomputed and the divergence reported, and where none exists the '
          + 'gap is stated rather than passed over. None of them refuses a figure or changes '
          + 'one; each records something a reader of the figure should know.'),
        findings.length === 0 ? b.body(f.validationNote || 'No findings.')
          : b.table({
            head: ['Severity', 'What the data says', 'What would clear it'],
            widths: [1, 2.6, 2.4], align: ['left', 'left', 'left'], zebra: true,
            rows: findings.map(x => [x.severity, x.statement, x.remedy])
          }),
      ])
    };
  }
  const plan = f.improvementPlan;
  return {
    id: 'limitations', title: 'Limitations and the improvement plan',
    blocks: keep([
      b.body('A disclosed score is a measurement, not a task list. The plan below is every '
        + 'finding grouped by what would clear it and every option band ordered by '
        + 'outstanding amount times the score points above the target — because ordering by '
        + 'count sends a bank to many small borrowers before the one exposure carrying a '
        + 'fifth of the book. Every figure in it is a scenario run through the same weighting '
        + 'the disclosure uses, never presented as the reported score.'),
      plan && plan.byRemedy && plan.byRemedy.length ? b.table({
        head: ['Finding', 'Severity', 'What would clear it'],
        widths: [1.6, 1, 3.4], align: ['left', 'left', 'left'], zebra: true,
        rows: plan.byRemedy.map(r => [r.code, r.severity, r.remedy])
      }) : b.body('No findings across the book.'),
    ])
  };
}

function conformanceSection(f) {
  return {
    id: 'conformance', title: 'Conformance statement',
    blocks: keep([
      b.body(f.conformanceStatement),
      b.body('This report states PCAF conformance. It does not claim that PCAF, or any other '
        + 'body, has approved, endorsed or certified the report or the figures in it. '
        + 'Independent assurance of the figures, where obtained, is a separate exercise '
        + 'recorded on the cover.'),
    ])
  };
}

/** The whole document, in the checklist's order. */
function buildSections(f) {
  return [
    coverageSection(f),
    gasesSection(f),
    absoluteSection(f),
    methodologySection(f),
    dataQualitySection(f),
    recalculationSection(f),
    intensitySection(f),
    limitationsSection(f),
    conformanceSection(f),
  ];
}

module.exports = { buildSections, INTENSIVE, N, T, pct, score };
