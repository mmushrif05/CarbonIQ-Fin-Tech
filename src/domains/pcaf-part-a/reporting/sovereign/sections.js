// @ts-check
/**
 * The Part A §5.9 sovereign-debt disclosure, in the order PCAF Chapter 6 reads
 * (pp.160–174). One content model; the platform renderer draws it to PDF and
 * to Word. Two documents share it — the annual disclosure of one reporting
 * year, and the per-holding report of one bond or loan.
 *
 * Section order: scope and coverage · gases and units · absolute emissions ·
 * methodology · data quality · recalculation and significance · emission
 * intensity · limitations and the data checks · conformance.
 */

'use strict';

const { b, keep } = require('../../../../platform/reporting/report-standard/blocks');

const N = n => (n === null || n === undefined) ? 'not stated'
  : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
const pct = n => (n === null || n === undefined) ? 'not stated' : `${Number(n).toFixed(2)}%`;
const score = n => (n === null || n === undefined) ? 'not scored' : String(n);

function coverageSection(f) {
  const c = f.coverage || {};
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
        value: pct(c.share), unit: '',
        note: c.totalLoansAndInvestments
          ? `${N(c.assessedOutstanding)} of ${N(c.totalLoansAndInvestments)} ${f.currency}`
            + (c.statedBy ? `, book total stated by ${c.statedBy}` : '')
          : 'Book total not yet stated',
      }) : null,
      b.body(f.coverageStatement),
      f.kind === 'disclosure' && f.exposures ? b.body(`${f.exposures} sovereign holding(s) are recorded for the year.`) : null,
    ]),
  };
}

function gasesSection(f) {
  return {
    id: 'gases', title: 'Gases and units',
    blocks: keep([
      b.body('Emissions are reported in tonnes of carbon dioxide equivalent (tCO2e), using '
        + 'the IPCC 100-year global warming potentials of the latest assessment report. A '
        + 'sovereign figure is the country’s own national inventory reported to the UNFCCC, '
        + 'covering the seven Kyoto Protocol gases the inventory reports.'),
      b.table({
        head: ['Gas', 'Formula', 'Where it arises in a national inventory'],
        widths: [1.6, 0.8, 3.6], align: ['left', 'left', 'left'], zebra: true,
        rows: f.KYOTO_GASES.map(g => [g.gas, g.formula, g.arises]),
      }),
      b.body('Land-use, land-use change and forestry (LULUCF) is reported as a boundary on '
        + 'scope 1 — both including and excluding it — rather than netted against the fossil '
        + 'inventory (§5.9, p.141).'),
    ]),
  };
}

/* Scope 1 on both LULUCF boundaries, never summed; scope 2 and 3 shoulds,
   absent-not-zero; scope 3 apart from scope 1. */
function absoluteSection(f) {
  if (f.kind === 'holding') {
    const s1 = f.scope1 || {};
    const excl = s1.exclLULUCF || {};
    const incl = s1.inclLULUCF || {};
    const s2 = f.scope2 || {};
    const s3 = f.scope3 || {};
    const val = fig => (fig && Number.isFinite(fig.value)) ? N(fig.value) : '—';
    const dq = f.dataQuality || {};
    return {
      id: 'absolute', title: 'Absolute emissions',
      blocks: keep([
        b.figure({ label: 'Financed scope 1 — territorial, excluding LULUCF', value: val(excl), unit: 'tCO2e',
          score: `Data quality score: ${score(dq.score)} (Option ${dq.option || 'n/a'}, Table 5.9-6). 1 is the highest quality, 5 the lowest.` }),
        b.figure({ label: 'Financed scope 1 — territorial, including LULUCF', value: val(incl), unit: 'tCO2e',
          note: incl.absent ? (incl.reason || 'Not held; reported absent, never summed with the above.') : 'The same emissions on the other LULUCF boundary — never summed with the above.' }),
        b.figure({ label: 'Financed scope 3 — a separate line', value: val(s3), unit: 'tCO2e',
          note: s3.absent ? (s3.reason || 'A §5.9 should; reported absent, never summed with scope 1 and 2.') : 'Non-energy imports; a separate line, never summed with scope 1 and 2.' }),
        b.table({
          head: ['Line', 'tCO2e', 'Note'], widths: [2.3, 1.1, 2.6], align: ['left', 'right', 'left'],
          rows: [
            ['Financed scope 1, excl. LULUCF', val(excl), 'Domestic territorial emissions attributed by PPP-GDP; the headline (§5.9, p.141).'],
            ['Financed scope 1, incl. LULUCF', val(incl), 'The same emissions including land use — never added to the line above.'],
            ['Financed scope 2', val(s2), s2.absent ? 'Imported grid energy: a should, reported absent.' : 'Imported grid electricity, heat, steam and cooling.'],
            ['Financed scope 3', val(s3), s3.absent ? 'Non-energy imports: a should, reported absent.' : 'Non-energy imports; a separate line.'],
          ],
        }),
        b.caption('No row sums scope 1 excluding LULUCF with scope 1 including LULUCF — they are the '
          + 'same emissions on two boundaries — and no row sums scope 3 into scope 1 and 2 (§5.9, p.141).'),
      ]),
    };
  }
  const t = f.totals;
  const inclNote = t.scope1Incl && t.scope1Incl.note ? t.scope1Incl.note : 'The same emissions on the other LULUCF boundary — never added to the excluding-LULUCF sum.';
  return {
    id: 'absolute', title: 'Absolute emissions',
    blocks: keep([
      b.figure({ label: 'Financed scope 1 across the class — excluding LULUCF', value: N(t.scope1Excl), unit: 'tCO2e',
        score: `Weighted data quality score: ${score(f.dataQuality.score)} (Table 5.9-6, weighted by outstanding amount, p.128). 1 is the highest quality, 5 the lowest.` }),
      b.figure({ label: 'Financed scope 1 across the class — including LULUCF', value: t.scope1Incl ? N(t.scope1Incl.value) : '—', unit: 'tCO2e', note: inclNote }),
      b.figure({ label: 'Financed scope 3 — a separate line', value: t.scope3 && Number.isFinite(t.scope3.value) ? N(t.scope3.value) : '—', unit: 'tCO2e',
        note: `${(t.scope3 && t.scope3.heldCount) || 0} holding(s) carried a scope 3 figure; the rest reported it absent (a §5.9 should).` }),
      b.table({
        head: ['Line', 'tCO2e', 'Note'], widths: [2.3, 1.1, 2.6], align: ['left', 'right', 'left'],
        rows: [
          ['Financed scope 1, excl. LULUCF', N(t.scope1Excl), 'The headline: domestic territorial emissions attributed by PPP-GDP (§5.9, p.141).'],
          ['Financed scope 1, incl. LULUCF', t.scope1Incl ? N(t.scope1Incl.value) : '—', 'The same emissions including land use — never added to the line above.'],
          ['Financed scope 2', t.scope2 && Number.isFinite(t.scope2.value) ? N(t.scope2.value) : '—', 'Imported grid energy: a should.'],
          ['Financed scope 3', t.scope3 && Number.isFinite(t.scope3.value) ? N(t.scope3.value) : '—', 'Non-energy imports: a should; a separate line.'],
        ],
      }),
      b.caption('Scope 1 is reported on both LULUCF boundaries and the two are never summed; '
        + 'scope 3 is reported apart from scope 1 and 2 and never summed into it (§5.9, p.141).'),
    ]),
  };
}

function methodologySection(f) {
  const d = f.dataset;
  return {
    id: 'methodology', title: 'Methodology',
    blocks: keep([
      b.body('Financed emissions of sovereign debt are the country’s territorial emissions '
        + 'multiplied by an attribution factor: the exposure in international USD over the '
        + 'sovereign’s PPP-adjusted GDP in international USD (§5.9, p.144). The denominator is '
        + 'PPP-adjusted GDP, never equity plus debt: debt alone is a poor denominator — a '
        + 'near-debt-free sovereign would attribute a thousandfold more per dollar — so output '
        + 'stands in for enterprise value (Annex 10.3, pp.201–204).'),
      b.body('The engine performs every arithmetic operation. Nothing in this report is '
        + 'computed by a language model, and no figure here rests on one. Each figure traces to '
        + 'the holding the register holds and to the sovereign dataset named below.'),
      d ? b.body(`Sovereign dataset: ${d.tables.map(t => `${t.table} v${t.version} (${t.status})`).join(', ')}; `
        + `SHA-256 over the canonical form, ${String(d.checksum || '').slice(0, 16)}. `
        + (d.provisionalTables && d.provisionalTables.length
          ? `Provisional pending a released set: ${d.provisionalTables.join(', ')}. A provisional row carries the gap it stands in for.`
          : 'The shipped set is provisional where a row says so.')) : null,
      b.body('The public sources PCAF names for this class (Table 10.3-4, pp.205–206): the '
        + 'UNFCCC data interface, Climate Watch, EDGAR (a four-year lag), OECD trade-embodied '
        + 'CO2 for scope 2 and 3, and World Bank PPP GDP.'),
    ]),
  };
}

function dataQualitySection(f) {
  const dq = f.dataQuality || {};
  if (f.kind === 'holding') {
    return {
      id: 'dataquality', title: 'Data quality',
      blocks: keep([
        b.body('PCAF scores sovereign data quality on a 1–5 scale by the source the figure '
          + 'rests on (Table 5.9-6, p.147): verified UNFCCC-reported is 1, unverified is 2, '
          + 'physical energy activity is 3, sectoral revenue is 4, a proxy country is 5. 1 is '
          + 'the highest quality, 5 the lowest; a score is a category, not a mark out of five.'),
        b.table({
          head: ['Basis', 'Option', 'Score'], widths: [3, 1.5, 1.5], align: ['left', 'left', 'right'],
          rows: [[dq.basis || 'as recorded', dq.option || 'n/a', score(dq.score)]],
        }),
      ]),
    };
  }
  return {
    id: 'dataquality', title: 'Data quality',
    blocks: keep([
      b.body('The disclosed score is one score, weighted by outstanding amount (PCAF '
        + 'Disclosure Checklist Part A, p.128) — not by premium, which belongs to a different '
        + 'part of the standard. A holding carrying no score is excluded from the weighting, '
        + 'not counted as zero. 1 is the highest quality, 5 the lowest; the score is a '
        + 'category, never a mark out of five.'),
      b.table({
        head: ['', 'Weighted score', 'Holdings scored', 'Excluded, no score'],
        widths: [2.2, 1.4, 1.4, 1.4], align: ['left', 'right', 'right', 'right'],
        rows: [['Sovereign debt', score(dq.score), String(dq.scored || 0), String(dq.excluded || 0)]],
      }),
    ]),
  };
}

function recalculationSection(f) {
  const r = f.recalculation || { baseYear: null, significanceThresholdPct: null, triggers: [], policy: '' };
  return {
    id: 'recalculation', title: 'Recalculation and significance',
    blocks: keep([
      b.body('A recalculation of the base year is a "shall" under Chapter 6 when the book, the '
        + 'method or a figure changes materially. The base year and the significance threshold '
        + 'belong to the reporting entity; where none has been set, this report states so rather '
        + 'than implying the current year.'),
      b.table({
        head: ['Item', 'This reporting entity'], widths: [3.2, 2.8], align: ['left', 'left'],
        rows: [
          ['Inventory base year', r.baseYear ? String(r.baseYear) : 'Not yet stated for this reporting entity'],
          ['Significance threshold — triggers a recalculation of base-year emissions',
            r.significanceThresholdPct === null ? 'Not stated' : `${r.significanceThresholdPct}% movement in a reported figure`],
        ],
      }),
      b.h2('What triggers a recalculation'),
      r.triggers.length ? b.bullets(r.triggers)
        : b.body('No recalculation protocol has been stated for this reporting entity. A §5.9 '
          + 'disclosure requires one.'),
      r.policy ? b.body(r.policy) : null,
      !r.baseYear ? b.callout('No base year is stated for this reporting entity. The report says so '
        + 'rather than implying the current year, because a base year is a claim about history and '
        + 'belongs to the entity, not to its software.', 'Open item') : null,
      b.body('The register holds both the input a bank keyed and the result the engine computed. '
        + 'A recomputation reruns the engine over the input already held and reports what moved '
        + 'across scope 1 on both LULUCF boundaries, scope 2 and 3, the data-quality score and the '
        + 'findings — so a change in the sovereign dataset is a decision somebody takes rather than '
        + 'something that happens to them.'),
    ]),
  };
}

function intensitySection(f) {
  if (f.kind === 'holding') {
    const pi = f.productionIntensity;
    return {
      id: 'intensity', title: 'Emission intensity',
      blocks: keep([
        pi ? b.figure({ label: 'Production emission intensity', value: N(pi.value), unit: pi.unit,
          note: 'Country scope 1 excluding LULUCF over PPP-adjusted GDP — a country-level figure, '
            + 'not attributed (§5.9, p.144). The plausibility check reads it: PPP-GDP exists to remove '
            + 'the distortion an implausible value would show.' })
          : b.body('Production intensity is not available for this sovereign: it needs the country '
            + 'scope 1 figure and PPP-GDP, and one of them is not held.'),
      ]),
    };
  }
  return {
    id: 'intensity', title: 'Emission intensity',
    blocks: keep([
      b.body('Production emission intensity — a sovereign’s territorial scope 1 (excluding '
        + 'LULUCF) over its PPP-adjusted GDP — is reported per holding (§5.9, p.144). PCAF also '
        + 'recommends a consumption-per-capita intensity and at least five years of history; the '
        + 'consumption view needs trade-embodied data this dataset does not yet hold, and is '
        + 'reported as not computed rather than invented.'),
    ]),
  };
}

function limitationsSection(f) {
  if (f.kind === 'holding') {
    const findings = f.findings || [];
    return {
      id: 'limitations', title: 'Limitations, and what the data says about itself',
      blocks: keep([
        b.body('The checks below follow the rule that where an independent path to a figure '
          + 'exists it is recomputed and the divergence reported, and where none exists the gap is '
          + 'stated rather than passed over. None of them refuses a figure or changes one; each '
          + 'records something a reader of the figure should know.'),
        findings.length === 0 ? b.body(f.validationNote || 'No findings.')
          : b.table({
            head: ['Severity', 'What the data says', 'What would clear it'],
            widths: [1, 2.6, 2.4], align: ['left', 'left', 'left'], zebra: true,
            rows: findings.map(x => [x.severity, x.statement, x.remedy]),
          }),
        f.consumption ? b.caption(f.consumption.reason) : null,
      ]),
    };
  }
  const plan = f.improvementPlan || [];
  return {
    id: 'limitations', title: 'Limitations and the improvement plan',
    blocks: keep([
      b.body('A disclosed score is a measurement, not a task list. The plan below is every '
        + 'finding across the sovereign book grouped by what would clear it, the material ones '
        + 'first. PCAF records its own limitations for this class: the scope definitions are an '
        + 'analogy to the corporate scopes rather than a one-to-one match, double counting with '
        + 'the corporate classes is accepted where it is reported separately, and PPP-GDP is a '
        + 'flow standing in for a stock (§5.9, p.148).'),
      plan.length ? b.table({
        head: ['Finding', 'Severity', 'Sovereigns', 'What would clear it'],
        widths: [1.7, 0.9, 1.3, 2.1], align: ['left', 'left', 'left', 'left'], zebra: true,
        rows: plan.map(r => [r.code, r.severity, String((r.sovereigns || []).length || r.count || 0), r.remedy]),
      }) : b.body('No findings across the sovereign book.'),
    ]),
  };
}

function conformanceSection(f) {
  return {
    id: 'conformance', title: 'Conformance statement',
    blocks: keep([
      b.body(f.conformanceStatement),
      b.body('This report states PCAF conformance. It does not claim that PCAF, or any other '
        + 'body, has approved, endorsed or certified the report or the figures in it. Independent '
        + 'assurance of the figures, where obtained, is a separate exercise recorded on the cover.'),
    ]),
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

module.exports = { buildSections, N, pct, score };
