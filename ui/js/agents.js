/* ============================================================
   CarbonIQ — AI Agents Panel Controller
   ui/js/agents.js
   ============================================================

   Controls the 5-stage green loan AI agent panel.
   Handles: stage switching, dynamic form rendering, API calls,
   step log animation, markdown report display, recent runs.
*/

const AgentsPage = (() => {
  'use strict';

  const API_KEY    = 'ck_test_00000000000000000000000000000000';
  const ENDPOINTS  = {
    screen:     '/v1/agent/screen',
    underwrite: '/v1/agent/underwrite',
    covenants:  '/v1/agent/covenants',
    monitor:    '/v1/agent/monitor',
    portfolio:  '/v1/agent/portfolio',
  };

  // ── Stage configuration ──────────────────────────────────
  const STAGE_META = {
    screen: {
      label: 'Pre-Screening Agent · Stage 1',
      desc:  'Benchmark-based eligibility assessment before a BOQ exists. Returns a Go/Conditional/No-Go Eligibility Memo with P25/P50/P75 carbon ranges and taxonomy alignment across all 4 frameworks.',
    },
    underwrite: {
      label: 'Underwriting Agent · Stage 2',
      desc:  'Full green loan underwriting from a Bill of Quantities. Extracts materials, computes embodied carbon, checks taxonomies, calculates CFS score, and drafts an Underwriting Memo with a credit recommendation.',
    },
    covenants: {
      label: 'Covenant Design Agent · Stage 3',
      desc:  'Designs a scientifically calibrated covenant package with 3 scenarios (Conservative/Standard/Ambitious). Benchmarks KPI thresholds, stress-tests them, and drafts APLMA Model Provisions-aligned terms with a pricing ratchet.',
    },
    monitor: {
      label: 'Monitoring Agent · Stage 4',
      desc:  'Tests agreed covenants against current construction metrics. Projects trajectory to practical completion and produces a Monitoring Report with a Drawdown Recommendation (Approve/Conditional/Hold).',
    },
    portfolio: {
      label: 'Portfolio Reporting Agent · Stage 5',
      desc:  'Aggregates a portfolio of green loans for PCAF/TCFD/GLP 2025 ESG disclosure. Calculates financed emissions, CFS distribution, taxonomy alignment, and produces a regulatory-ready Portfolio Report.',
    },
  };

  const BUILDING_TYPES = [
    ['', '-- Select building type --'],
    ['residential_low_rise',  'Residential — Low Rise'],
    ['residential_high_rise', 'Residential — High Rise'],
    ['commercial_office',     'Commercial Office'],
    ['retail',                'Retail'],
    ['industrial_warehouse',  'Industrial / Warehouse'],
    ['hospital',              'Hospital'],
    ['education',             'Education'],
    ['infrastructure',        'Infrastructure'],
  ];

  const REGIONS = [
    ['Singapore', 'Singapore'],
    ['Hong Kong', 'Hong Kong'],
    ['Malaysia',  'Malaysia'],
    ['Thailand',  'Thailand'],
    ['Indonesia', 'Indonesia'],
    ['Vietnam',   'Vietnam'],
    ['Australia', 'Australia'],
    ['UK',        'United Kingdom'],
    ['EU',        'European Union'],
  ];

  const CERTIFICATIONS = [
    ['', '-- None / Not specified --'],
    ['green_mark',       'Green Mark (BCA Singapore)'],
    ['super_low_energy', 'Green Mark Super Low Energy'],
    ['zero_carbon_ready','Green Mark Zero Carbon Ready'],
    ['platinum',         'BEAM Plus Platinum (HK)'],
    ['gold_plus',        'BEAM Plus Gold+ (HK)'],
    ['gold',             'LEED Gold'],
    ['silver',           'LEED Silver'],
    ['certified',        'LEED Certified'],
  ];

  const VERIFICATION_STATUSES = [
    ['none',      'None'],
    ['submitted', 'Submitted to verifier'],
    ['in_review', 'Under review'],
    ['verified',  'Verified'],
  ];

  const COVENANT_METRICS = [
    ['tco2e_per_m2',            'Carbon Intensity (kgCO2e/m²)'],
    ['epd_coverage',            'EPD Coverage (%)'],
    ['reduction_pct',           'Carbon Reduction (%)'],
    ['total_tco2e',             'Total Carbon (tCO2e)'],
    ['material_substitution_rate', 'Material Substitution (%)'],
  ];

  const COVENANT_OPERATORS = [
    ['lte', '≤ (less than or equal)'],
    ['gte', '≥ (greater than or equal)'],
    ['lt',  '< (less than)'],
    ['gt',  '> (greater than)'],
  ];

  // ── State ────────────────────────────────────────────────
  let currentStage   = 'screen';
  let isRunning      = false;
  let lastResult     = null;
  let abortCtrl      = null;

  // ── DOM refs (populated on init) ────────────────────────
  let elStages, elMeta, elForm, elRunBtn, elRunLabel;
  let elIdle, elRunning, elRunningSub, elResults, elError, elErrorMsg;
  let elStepsList, elStepsCount, elReportBody;
  let elCopyBtn, elDownloadBtn, elRetryBtn;
  let elRecentList, elRefreshBtn;

  // ── Init ─────────────────────────────────────────────────
  function init() {
    elStages     = document.getElementById('agentStages');
    elMeta       = document.getElementById('agentMeta');
    elForm       = document.getElementById('agentForm');
    elRunBtn     = document.getElementById('runAgentBtn');
    elRunLabel   = document.getElementById('runBtnLabel');
    elIdle       = document.getElementById('outputIdle');
    elRunning    = document.getElementById('outputRunning');
    elRunningSub = document.getElementById('runningSubtitle');
    elResults    = document.getElementById('outputResults');
    elError      = document.getElementById('outputError');
    elErrorMsg   = document.getElementById('errorMsg');
    elStepsList  = document.getElementById('stepsList');
    elStepsCount = document.getElementById('stepsCount');
    elReportBody = document.getElementById('reportBody');
    elCopyBtn    = document.getElementById('copyReportBtn');
    elDownloadBtn = document.getElementById('downloadReportBtn');
    elRetryBtn   = document.getElementById('retryBtn');
    elRecentList = document.getElementById('recentRunsList');
    elRefreshBtn = document.getElementById('refreshRunsBtn');

    // Wire stage buttons
    elStages.querySelectorAll('.agents-stage').forEach(btn => {
      btn.addEventListener('click', () => switchStage(btn.dataset.stage));
    });

    elRunBtn.addEventListener('click', runAgent);
    elCopyBtn.addEventListener('click', copyReport);
    elDownloadBtn.addEventListener('click', downloadReport);
    elRetryBtn.addEventListener('click', runAgent);
    elRefreshBtn.addEventListener('click', loadRecentRuns);

    switchStage('screen');
    loadRecentRuns();
  }

  // ── Stage switching ───────────────────────────────────────
  function switchStage(stage) {
    currentStage = stage;

    elStages.querySelectorAll('.agents-stage').forEach(btn => {
      const active = btn.dataset.stage === stage;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    renderMeta(stage);
    renderForm(stage);
    showOutput('idle');
    lastResult = null;
  }

  // ── Agent meta description ────────────────────────────────
  function renderMeta(stage) {
    const m = STAGE_META[stage];
    elMeta.innerHTML = `
      <div class="agents-agent-badge">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <circle cx="5" cy="5" r="4.2" stroke="currentColor" stroke-width="1.2"/>
          <path d="M3.5 5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          <circle cx="5" cy="5" r=".6" fill="currentColor"/>
        </svg>
        ${m.label}
      </div>
      <p class="agents-agent-desc">${m.desc}</p>`;
  }

  // ── Form rendering ────────────────────────────────────────
  function renderForm(stage) {
    elForm.innerHTML = '';
    elRunBtn.disabled = false;

    const builders = { screen, underwrite, covenants, monitor, portfolio };
    builders[stage]();
  }

  // helpers
  function field(id, label, type, opts = {}) {
    const div = document.createElement('div');
    div.className = 'agents-field';
    const reqMark   = opts.required ? '<span class="agents-field-req">*</span>' : '';
    const hintText  = opts.hint     ? `<span class="agents-field-hint">${opts.hint}</span>` : '';
    div.innerHTML = `<label for="${id}">${label}${reqMark}${hintText}</label>`;

    let inp;
    if (type === 'select') {
      inp = document.createElement('select');
      (opts.options || []).forEach(([val, txt]) => {
        const o = document.createElement('option');
        o.value = val; o.textContent = txt;
        if (opts.value && val === opts.value) o.selected = true;
        inp.appendChild(o);
      });
    } else if (type === 'textarea') {
      inp = document.createElement('textarea');
      inp.rows = opts.rows || 4;
      if (opts.tall) inp.classList.add('tall');
      if (opts.placeholder) inp.placeholder = opts.placeholder;
    } else {
      inp = document.createElement('input');
      inp.type = type;
      if (opts.min  != null) inp.min  = opts.min;
      if (opts.max  != null) inp.max  = opts.max;
      if (opts.step != null) inp.step = opts.step;
      if (opts.placeholder) inp.placeholder = opts.placeholder;
      if (opts.value != null) inp.value = opts.value;
    }
    inp.id   = id;
    inp.name = id;
    if (opts.required) inp.required = true;
    div.appendChild(inp);
    return div;
  }

  function fieldRow(...fields) {
    const row = document.createElement('div');
    row.className = 'agents-field-row';
    fields.forEach(f => row.appendChild(f));
    return row;
  }

  function section(title) {
    const div = document.createElement('div');
    div.className = 'agents-form-section';
    div.innerHTML = `<div class="agents-form-section__title">${title}</div>`;
    return div;
  }

  function append(...nodes) {
    nodes.forEach(n => elForm.appendChild(n));
  }

  // ── Stage 1: Screen ──────────────────────────────────────
  function screen() {
    append(
      field('projectName',       'Project Name', 'text', { placeholder: 'Marina Bay Tower 3' }),
      field('projectDescription','Project Description', 'textarea', {
        rows: 3, placeholder: 'Briefly describe the project: purpose, design intent, sustainability goals…'
      }),
      fieldRow(
        field('buildingType',    'Building Type',  'select', { options: BUILDING_TYPES, required: true }),
        field('buildingArea_m2', 'Floor Area (m²)', 'number', { min: 1, placeholder: '25000', required: true })
      ),
      fieldRow(
        field('region',               'Region',   'select', { options: REGIONS }),
        field('targetCertification',  'Target Certification', 'select', { options: CERTIFICATIONS })
      ),
      fieldRow(
        field('investorJurisdiction', 'Investor Jurisdiction', 'text', { placeholder: 'ASEAN, Singapore' }),
        field('loanAmount',           'Indicative Loan (SGD)', 'number', { min: 0, placeholder: '50000000' })
      )
    );
  }

  // ── Stage 2: Underwrite ──────────────────────────────────
  function underwrite() {
    append(
      field('boqContent', 'Bill of Quantities', 'textarea', {
        tall: true, rows: 8,
        placeholder: 'Paste BOQ here — CSV rows, Excel copy, or free text.\n\nExample:\nConcrete C35, 2500 m³\nReinforcement rebar, 450 tonnes\nStructural steel, 180 tonnes\nGlass curtain wall, 3200 m²'
      }),
      fieldRow(
        field('projectName',   'Project Name', 'text', { placeholder: 'Marina Bay Tower 3' }),
        field('boqFormat',     'BOQ Format', 'select', {
          options: [['text','Free Text'],['csv','CSV'],['json','JSON']]
        })
      ),
      fieldRow(
        field('buildingType',    'Building Type',  'select', { options: BUILDING_TYPES }),
        field('buildingArea_m2', 'Floor Area (m²)', 'number', { min: 1, placeholder: '25000' })
      ),
      fieldRow(
        field('region',             'Region',    'select', { options: REGIONS }),
        field('certificationLevel', 'Target Cert', 'select', { options: CERTIFICATIONS })
      ),
      fieldRow(
        field('loanAmount',    'Loan Amount (SGD)',    'number', { min: 0, placeholder: '50000000' }),
        field('projectValue',  'Project Value (SGD)',  'number', { min: 0, placeholder: '200000000' })
      ),
      fieldRow(
        field('reductionTarget', 'Reduction Target (%)', 'number', { min: 0, max: 100, placeholder: '20' }),
        field('region2', '', 'text', { placeholder: '' }) // spacer hack-free: use empty div
      )
    );
    // Remove the spacer field (simpler: just skip last item)
    const lastRow = elForm.lastElementChild;
    if (lastRow && lastRow.classList.contains('agents-field-row')) {
      const spacer = lastRow.querySelector('#region2');
      if (spacer) spacer.closest('.agents-field').remove();
    }
  }

  // ── Stage 3: Covenants ───────────────────────────────────
  function covenants() {
    const sec1 = section('Project Details');
    sec1.appendChild(field('projectName', 'Project Name', 'text', { placeholder: 'Marina Bay Tower 3' }));
    sec1.appendChild(fieldRow(
      field('buildingType',    'Building Type',   'select', { options: BUILDING_TYPES, required: true }),
      field('buildingArea_m2', 'Floor Area (m²)',  'number', { min: 1, placeholder: '25000', required: true })
    ));
    sec1.appendChild(fieldRow(
      field('region',               'Region',          'select', { options: REGIONS }),
      field('targetCertification',  'Target Cert',     'select', { options: CERTIFICATIONS })
    ));

    const sec2 = section('Carbon Metrics (from underwriting)');
    sec2.appendChild(fieldRow(
      field('currentTCO2e',               'Total Carbon (tCO2e)', 'number', { min: 0, step: '0.1', placeholder: '1250' }),
      field('currentIntensity_kgCO2e_m2', 'Intensity (kgCO2e/m²)', 'number', { min: 0, step: '0.1', placeholder: '500' })
    ));
    sec2.appendChild(fieldRow(
      field('reductionPct',    'Reduction vs Baseline (%)', 'number', { min: 0, max: 100, placeholder: '0' }),
      field('epdCoveragePct',  'EPD Coverage (%)',          'number', { min: 0, max: 100, placeholder: '0' })
    ));

    const sec3 = section('Loan Parameters');
    sec3.appendChild(fieldRow(
      field('loanAmount',   'Loan Amount (SGD)',   'number', { min: 0, placeholder: '50000000' }),
      field('projectValue', 'Project Value (SGD)', 'number', { min: 0, placeholder: '200000000' })
    ));
    sec3.appendChild(fieldRow(
      field('loanTermYears', 'Loan Term (years)', 'number', { min: 1, max: 30, placeholder: '5' }),
      field('_pad1', '', 'text', { placeholder: '' })
    ));
    const padField = sec3.querySelector('#_pad1');
    if (padField) padField.closest('.agents-field').style.visibility = 'hidden';

    append(sec1, sec2, sec3);
  }

  // ── Stage 4: Monitor ─────────────────────────────────────
  function monitor() {
    const sec1 = section('Project Details');
    sec1.appendChild(field('projectName', 'Project Name', 'text', { placeholder: 'Marina Bay Tower 3' }));
    sec1.appendChild(fieldRow(
      field('buildingType',    'Building Type',   'select', { options: BUILDING_TYPES, required: true }),
      field('buildingArea_m2', 'Floor Area (m²)',  'number', { min: 1, placeholder: '25000', required: true })
    ));
    sec1.appendChild(fieldRow(
      field('region',               'Region',         'select', { options: REGIONS }),
      field('targetCertification',  'Target Cert',    'select', { options: CERTIFICATIONS })
    ));

    // Progress slider
    const sec2 = section('Construction Progress');
    const progressField = document.createElement('div');
    progressField.className = 'agents-field';
    progressField.innerHTML = `
      <label for="projectComplete_pct">Construction Complete <span class="agents-field-req">*</span></label>
      <div class="agents-range-wrap">
        <input type="range" id="projectComplete_pct" name="projectComplete_pct" min="0" max="100" value="40" step="5">
        <span class="agents-range-val" id="pctDisplay">40%</span>
      </div>`;
    sec2.appendChild(progressField);

    const drawdownWrap = document.createElement('div');
    drawdownWrap.className = 'agents-checkbox';
    drawdownWrap.innerHTML = `
      <input type="checkbox" id="drawdownRequested" name="drawdownRequested">
      <label for="drawdownRequested">Drawdown being requested</label>`;
    sec2.appendChild(drawdownWrap);

    const drawdownAmt = field('drawdownAmount', 'Drawdown Amount (SGD)', 'number', { min: 0, placeholder: '10000000' });
    drawdownAmt.id = 'drawdownAmtWrap';
    drawdownAmt.style.display = 'none';
    sec2.appendChild(drawdownAmt);

    // Current metrics
    const sec3 = section('Current Carbon Metrics');
    sec3.appendChild(fieldRow(
      field('totalBaseline_tCO2e', 'Total Carbon (tCO2e)', 'number', { min: 0, step: '0.1', placeholder: '500', required: true }),
      field('reductionPct_m',      'Reduction vs Baseline (%)', 'number', { min: 0, max: 100, placeholder: '0' })
    ));
    sec3.appendChild(fieldRow(
      field('epdCoveragePct_m', 'EPD Coverage (%)',       'number', { min: 0, max: 100, placeholder: '0' }),
      field('substitutionRate', 'Substitution Rate (%)', 'number', { min: 0, max: 100, placeholder: '0' })
    ));
    sec3.appendChild(fieldRow(
      field('verificationStatus', 'Verification Status', 'select', { options: VERIFICATION_STATUSES }),
      field('loanTermYears_m',    'Loan Term (years)',   'number', { min: 1, max: 30, placeholder: '5' })
    ));

    // Covenants repeater
    const sec4 = section('Agreed Covenant Package');
    const repeater = document.createElement('div');
    repeater.className = 'agents-repeater';
    repeater.id = 'covenantRepeater';
    sec4.appendChild(repeater);

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'agents-repeater-add';
    addBtn.innerHTML = '+ Add Covenant';
    addBtn.addEventListener('click', () => addCovenantRow(repeater));
    sec4.appendChild(addBtn);

    append(sec1, sec2, sec3, sec4);

    // Wire range slider
    const slider = document.getElementById('projectComplete_pct');
    const display = document.getElementById('pctDisplay');
    slider.addEventListener('input', () => { display.textContent = slider.value + '%'; });

    // Wire drawdown checkbox
    const cb = document.getElementById('drawdownRequested');
    const amtWrap = document.getElementById('drawdownAmtWrap');
    cb.addEventListener('change', () => {
      amtWrap.style.display = cb.checked ? 'flex' : 'none';
    });

    // Add 1 default covenant
    addCovenantRow(repeater, { metric: 'tco2e_per_m2', operator: 'lte', threshold: '500', label: 'Carbon Intensity' });
  }

  function addCovenantRow(container, defaults = {}) {
    const row = document.createElement('div');
    row.className = 'agents-repeater-row';
    const idx = container.children.length;

    row.innerHTML = `
      <div class="agents-field" style="flex:2">
        <label>Metric</label>
        <select name="c_metric_${idx}">
          ${COVENANT_METRICS.map(([v,t]) => `<option value="${v}"${defaults.metric === v ? ' selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="agents-field" style="flex:1.5">
        <label>Operator</label>
        <select name="c_operator_${idx}">
          ${COVENANT_OPERATORS.map(([v,t]) => `<option value="${v}"${defaults.operator === v ? ' selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="agents-field" style="flex:1">
        <label>Threshold</label>
        <input type="number" name="c_threshold_${idx}" min="0" step="any" value="${defaults.threshold || ''}" placeholder="500">
      </div>
      <div class="agents-field" style="flex:2">
        <label>Label (opt)</label>
        <input type="text" name="c_label_${idx}" value="${defaults.label || ''}" placeholder="e.g. Carbon Intensity">
      </div>
      <button type="button" class="agents-repeater-remove" title="Remove" aria-label="Remove covenant">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>`;

    row.querySelector('.agents-repeater-remove').addEventListener('click', () => row.remove());
    container.appendChild(row);
  }

  // ── Stage 5: Portfolio ────────────────────────────────────
  function portfolio() {
    const sec1 = section('Portfolio Details');
    sec1.appendChild(fieldRow(
      field('portfolioName',   'Portfolio Name',    'text', { placeholder: 'APAC Green Construction 2025' }),
      field('reportingEntity', 'Reporting Entity',  'text', { placeholder: 'CarbonIQ Bank Singapore' })
    ));
    sec1.appendChild(fieldRow(
      field('reportingPeriod', 'Reporting Period', 'text', { placeholder: 'FY2025' }),
      field('_pad2', '', 'text', { placeholder: '' })
    ));
    const pad = sec1.querySelector('#_pad2');
    if (pad) pad.closest('.agents-field').style.visibility = 'hidden';

    const sec2 = section('Loan Assets');
    const repeater = document.createElement('div');
    repeater.className = 'agents-repeater';
    repeater.id = 'assetRepeater';
    repeater.style.gap = '10px';
    sec2.appendChild(repeater);

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'agents-repeater-add';
    addBtn.innerHTML = '+ Add Asset';
    addBtn.addEventListener('click', () => addAssetRow(repeater));
    sec2.appendChild(addBtn);

    append(sec1, sec2);

    // Add 2 default asset rows
    addAssetRow(repeater, { loanId: 'LOAN-001', projectName: 'Marina Bay Office', buildingType: 'commercial_office', buildingArea_m2: '25000', totalTCO2e: '1250', epdCoveragePct: '45', reductionPct: '15', loanAmount: '50000000', projectValue: '200000000' });
    addAssetRow(repeater, { loanId: 'LOAN-002', projectName: 'Buona Vista Residential', buildingType: 'residential_high_rise', buildingArea_m2: '18000', totalTCO2e: '860', epdCoveragePct: '20', reductionPct: '5', loanAmount: '30000000', projectValue: '120000000' });
  }

  function addAssetRow(container, defaults = {}) {
    const idx = container.children.length;
    const label = defaults.projectName || `Asset ${idx + 1}`;

    const wrapper = document.createElement('div');
    wrapper.className = 'agents-asset-row open';

    wrapper.innerHTML = `
      <div class="agents-asset-row__header">
        <span class="agents-asset-row__label">${label}</span>
        <div style="display:flex;align-items:center;gap:8px">
          <svg class="agents-asset-row__chevron" width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 4.5l4 4 4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <button type="button" class="agents-repeater-remove" title="Remove asset">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>
      <div class="agents-asset-row__body">
        <div class="agents-field-row">
          <div class="agents-field"><label>Loan ID</label><input type="text" name="a_loanId_${idx}" value="${defaults.loanId||''}" placeholder="LOAN-001"></div>
          <div class="agents-field"><label>Project Name</label><input type="text" name="a_projectName_${idx}" value="${defaults.projectName||''}" placeholder="Project name"></div>
        </div>
        <div class="agents-field-row">
          <div class="agents-field"><label>Building Type</label>
            <select name="a_buildingType_${idx}">
              ${BUILDING_TYPES.map(([v,t]) => `<option value="${v}"${defaults.buildingType===v?' selected':''}>${t}</option>`).join('')}
            </select>
          </div>
          <div class="agents-field"><label>Floor Area (m²)</label><input type="number" name="a_buildingArea_m2_${idx}" value="${defaults.buildingArea_m2||''}" placeholder="25000" min="1"></div>
        </div>
        <div class="agents-field-row">
          <div class="agents-field"><label>Total tCO2e</label><input type="number" name="a_totalTCO2e_${idx}" value="${defaults.totalTCO2e||''}" placeholder="1250" min="0" step="0.1"></div>
          <div class="agents-field"><label>EPD Coverage (%)</label><input type="number" name="a_epdCoveragePct_${idx}" value="${defaults.epdCoveragePct||''}" placeholder="45" min="0" max="100"></div>
        </div>
        <div class="agents-field-row">
          <div class="agents-field"><label>Reduction (%)</label><input type="number" name="a_reductionPct_${idx}" value="${defaults.reductionPct||''}" placeholder="15" min="0" max="100"></div>
          <div class="agents-field"><label>Region</label>
            <select name="a_region_${idx}">
              ${REGIONS.map(([v,t]) => `<option value="${v}">${t}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="agents-field-row">
          <div class="agents-field"><label>Loan Amount (SGD)</label><input type="number" name="a_loanAmount_${idx}" value="${defaults.loanAmount||''}" placeholder="50000000" min="0"></div>
          <div class="agents-field"><label>Project Value (SGD)</label><input type="number" name="a_projectValue_${idx}" value="${defaults.projectValue||''}" placeholder="200000000" min="0"></div>
        </div>
        <div class="agents-field-row">
          <div class="agents-field"><label>Certification</label>
            <select name="a_certificationLevel_${idx}">
              ${CERTIFICATIONS.map(([v,t]) => `<option value="${v}">${t}</option>`).join('')}
            </select>
          </div>
          <div class="agents-field"><label>Verification</label>
            <select name="a_verificationStatus_${idx}">
              ${VERIFICATION_STATUSES.map(([v,t]) => `<option value="${v}">${t}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>`;

    // Toggle expand/collapse
    wrapper.querySelector('.agents-asset-row__header').addEventListener('click', e => {
      if (e.target.closest('.agents-repeater-remove')) return;
      wrapper.classList.toggle('open');
      const labelEl = wrapper.querySelector('.agents-asset-row__label');
      const nameInp = wrapper.querySelector(`[name="a_projectName_${idx}"]`);
      if (nameInp) labelEl.textContent = nameInp.value || `Asset ${idx + 1}`;
    });

    wrapper.querySelector('.agents-repeater-remove').addEventListener('click', () => wrapper.remove());
    container.appendChild(wrapper);
  }

  // ── Output panel states ───────────────────────────────────
  function showOutput(state) {
    elIdle.hidden    = state !== 'idle';
    elRunning.hidden = state !== 'running';
    elResults.hidden = state !== 'results';
    elError.hidden   = state !== 'error';
  }

  // ── Collect form data ─────────────────────────────────────
  function collectFormData() {
    const fd = new FormData(elForm);
    const raw = Object.fromEntries(fd.entries());

    const num = (k) => raw[k] !== '' && raw[k] != null ? Number(raw[k]) : undefined;
    const str = (k) => raw[k] || undefined;
    const bool = (k) => !!raw[k];

    if (currentStage === 'screen') {
      return {
        projectName:          str('projectName'),
        projectDescription:   str('projectDescription'),
        buildingType:         str('buildingType'),
        buildingArea_m2:      num('buildingArea_m2'),
        region:               str('region'),
        targetCertification:  str('targetCertification'),
        investorJurisdiction: str('investorJurisdiction'),
        loanAmount:           num('loanAmount'),
      };
    }

    if (currentStage === 'underwrite') {
      return {
        boqContent:        str('boqContent'),
        boqFormat:         str('boqFormat') || 'text',
        projectName:       str('projectName'),
        buildingType:      str('buildingType'),
        buildingArea_m2:   num('buildingArea_m2'),
        region:            str('region'),
        certificationLevel:str('certificationLevel'),
        loanAmount:        num('loanAmount'),
        projectValue:      num('projectValue'),
        reductionTarget:   num('reductionTarget'),
      };
    }

    if (currentStage === 'covenants') {
      return {
        projectName:                str('projectName'),
        buildingType:               str('buildingType'),
        buildingArea_m2:            num('buildingArea_m2'),
        region:                     str('region'),
        targetCertification:        str('targetCertification'),
        currentTCO2e:               num('currentTCO2e'),
        currentIntensity_kgCO2e_m2: num('currentIntensity_kgCO2e_m2'),
        reductionPct:               num('reductionPct'),
        epdCoveragePct:             num('epdCoveragePct'),
        loanAmount:                 num('loanAmount'),
        projectValue:               num('projectValue'),
        loanTermYears:              num('loanTermYears'),
      };
    }

    if (currentStage === 'monitor') {
      // Collect covenants from repeater
      const covenants = [];
      document.querySelectorAll('#covenantRepeater .agents-repeater-row').forEach((row, i) => {
        const metric    = raw[`c_metric_${i}`];
        const operator  = raw[`c_operator_${i}`];
        const threshold = Number(raw[`c_threshold_${i}`]);
        const label     = raw[`c_label_${i}`];
        if (metric && operator && !isNaN(threshold)) {
          covenants.push({ metric, operator, threshold, ...(label ? { label } : {}) });
        }
      });

      return {
        projectName:         str('projectName'),
        buildingType:        str('buildingType'),
        buildingArea_m2:     num('buildingArea_m2'),
        region:              str('region'),
        targetCertification: str('targetCertification'),
        verificationStatus:  str('verificationStatus') || 'none',
        loanTermYears:       num('loanTermYears_m'),
        projectComplete_pct: num('projectComplete_pct'),
        drawdownRequested:   bool('drawdownRequested'),
        drawdownAmount:      num('drawdownAmount'),
        covenants,
        currentMetrics: {
          totalBaseline_tCO2e: num('totalBaseline_tCO2e'),
          reductionPct:        num('reductionPct_m')  ?? 0,
          epdCoveragePct:      num('epdCoveragePct_m') ?? 0,
          substitutionRate:    num('substitutionRate') ?? 0,
        },
      };
    }

    if (currentStage === 'portfolio') {
      const assets = [];
      document.querySelectorAll('#assetRepeater .agents-asset-row').forEach((row, i) => {
        const loanId         = raw[`a_loanId_${i}`];
        const projectName    = raw[`a_projectName_${i}`];
        const buildingType   = raw[`a_buildingType_${i}`];
        const buildingArea   = Number(raw[`a_buildingArea_m2_${i}`]);
        const totalTCO2e     = Number(raw[`a_totalTCO2e_${i}`]);
        const epdCoveragePct = Number(raw[`a_epdCoveragePct_${i}`]);
        const reductionPct   = Number(raw[`a_reductionPct_${i}`]);
        const loanAmount     = Number(raw[`a_loanAmount_${i}`]);
        const projectValue   = Number(raw[`a_projectValue_${i}`]);
        const certificationLevel  = raw[`a_certificationLevel_${i}`];
        const verificationStatus  = raw[`a_verificationStatus_${i}`];
        const region         = raw[`a_region_${i}`];

        assets.push({
          loanId:          loanId         || undefined,
          projectName:     projectName    || undefined,
          buildingType:    buildingType   || undefined,
          buildingArea_m2: buildingArea   || undefined,
          region:          region         || 'Singapore',
          totalTCO2e:      totalTCO2e     || undefined,
          epdCoveragePct:  epdCoveragePct || 0,
          reductionPct:    reductionPct   || 0,
          loanAmount:      loanAmount     || undefined,
          projectValue:    projectValue   || undefined,
          certificationLevel: certificationLevel || undefined,
          verificationStatus: verificationStatus || 'none',
        });
      });

      return {
        portfolioName:   str('portfolioName'),
        reportingEntity: str('reportingEntity'),
        reportingPeriod: str('reportingPeriod'),
        assets,
      };
    }
  }

  // ── Run agent ─────────────────────────────────────────────
  async function runAgent() {
    if (isRunning) return;
    const payload = collectFormData();
    if (!payload) return;

    isRunning = true;
    elRunBtn.disabled = true;
    elRunBtn.classList.add('running');
    elRunLabel.textContent = 'Running…';
    showOutput('running');

    const subtitles = {
      screen:     'Estimating carbon · checking taxonomies · generating Eligibility Memo…',
      underwrite: 'Parsing BOQ · computing carbon · checking taxonomies · drafting memo…',
      covenants:  'Anchoring benchmarks · stress-testing KPIs · designing covenant package…',
      monitor:    'Testing covenants · projecting trajectory · assessing drawdown risk…',
      portfolio:  'Scoring assets · checking taxonomies · aggregating PCAF emissions…',
    };
    elRunningSub.textContent = subtitles[currentStage] || 'Calling CarbonIQ tools…';

    abortCtrl = new AbortController();

    try {
      const res = await fetch(ENDPOINTS[currentStage], {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
        body:    JSON.stringify(payload),
        signal:  abortCtrl.signal,
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = data.message || data.error || `HTTP ${res.status}`;
        throw new Error(msg);
      }

      lastResult = data;
      await displayResults(data);
      loadRecentRuns();

    } catch (err) {
      if (err.name === 'AbortError') return;
      showOutput('error');
      elErrorMsg.textContent = err.message || 'An unexpected error occurred.';
    } finally {
      isRunning = false;
      elRunBtn.disabled = false;
      elRunBtn.classList.remove('running');
      elRunLabel.textContent = 'Run Agent';
      abortCtrl = null;
    }
  }

  // ── Display results ───────────────────────────────────────
  async function displayResults(data) {
    showOutput('results');

    // Steps
    const toolSteps = (data.steps || []).filter(s => s.type === 'tool_use' || s.type === 'tool_result');
    elStepsCount.textContent = `${toolSteps.length} steps`;
    elStepsList.innerHTML = '';

    // Animate steps with stagger
    for (let i = 0; i < toolSteps.length; i++) {
      await new Promise(r => setTimeout(r, 80));
      renderStep(toolSteps[i], i);
    }

    // Render markdown report
    const reportText = data.result || '';
    if (window.marked) {
      elReportBody.innerHTML = window.marked.parse(reportText);
    } else {
      // Fallback: pre-wrap plain text
      elReportBody.textContent = reportText;
    }
    elReportBody.scrollTop = 0;
  }

  function renderStep(step, idx) {
    const el = document.createElement('div');
    el.className = 'agents-step';
    el.style.animationDelay = `${idx * 0.04}s`;

    const isUse    = step.type === 'tool_use';
    const isResult = step.type === 'tool_result';
    const iconClass = isUse ? 'tool' : (step.isError ? 'error' : 'result');
    const iconText  = isUse ? '⚙' : (step.isError ? '✗' : '✓');

    let detail = '';
    if (isUse && step.input) {
      const keys = Object.keys(step.input).slice(0, 3);
      detail = keys.map(k => {
        const v = step.input[k];
        if (typeof v === 'object') return k;
        return `${k}=${v}`;
      }).join(', ');
    } else if (isResult) {
      const out = step.output;
      if (out && typeof out === 'object') {
        const keys = Object.keys(out).slice(0, 2);
        detail = keys.map(k => `${k}: ${JSON.stringify(out[k]).slice(0, 30)}`).join(' · ');
      }
    }

    el.innerHTML = `
      <div class="agents-step__icon agents-step__icon--${iconClass}">${iconText}</div>
      <div class="agents-step__content">
        <div class="agents-step__name">${isUse ? step.tool : (step.tool ? `↩ ${step.tool}` : 'Result')}</div>
        ${detail ? `<div class="agents-step__detail">${detail}</div>` : ''}
      </div>`;

    elStepsList.appendChild(el);
  }

  // ── Copy / Download ───────────────────────────────────────
  function copyReport() {
    if (!lastResult) return;
    navigator.clipboard.writeText(lastResult.result || '').then(() => {
      elCopyBtn.textContent = '✓ Copied';
      setTimeout(() => {
        elCopyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M4 4V3a1 1 0 011-1h5l2 2v5a1 1 0 01-1 1h-1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg> Copy`;
      }, 2000);
    });
  }

  function downloadReport() {
    if (!lastResult) return;
    const blob = new Blob([lastResult.result || ''], { type: 'text/markdown' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href     = url;
    a.download = `carboniq-${currentStage}-${ts}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Recent runs ───────────────────────────────────────────
  async function loadRecentRuns() {
    try {
      const res = await fetch('/v1/agent/runs?limit=5', {
        headers: { 'X-API-Key': API_KEY }
      });
      if (!res.ok) return;
      const data = await res.json();
      renderRecentRuns(data.runs || []);
    } catch (_) { /* silent */ }
  }

  function renderRecentRuns(runs) {
    if (!runs.length) {
      elRecentList.innerHTML = '<p class="agents-recent__empty">No recent runs yet.</p>';
      return;
    }
    elRecentList.innerHTML = '';
    runs.forEach(run => {
      const el = document.createElement('div');
      el.className = 'agents-run-item';
      const dotClass = run.status === 'completed' ? 'completed' : run.status === 'running' ? 'running' : 'failed';
      const ts = run.createdAt ? new Date(run.createdAt).toLocaleString() : '—';
      const tokens = run.tokensUsed ? `${(run.tokensUsed / 1000).toFixed(1)}k tokens` : '';

      el.innerHTML = `
        <div class="agents-run-item__dot agents-run-item__dot--${dotClass}"></div>
        <div class="agents-run-item__info">
          <div class="agents-run-item__type">${run.agentType || 'unknown'}</div>
          <div class="agents-run-item__meta">${ts} · ${run.status} · ${(run.metadata && run.metadata.projectName) || ''}</div>
        </div>
        <div class="agents-run-item__tokens">${tokens}</div>`;
      elRecentList.appendChild(el);
    });
  }

  return { init };
})();
