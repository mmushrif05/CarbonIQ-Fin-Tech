/**
 * CarbonIQ — AI BOQ Material Extractor
 * Client-side controller for ui/pages/extract.html
 *
 * Architecture
 * ────────────
 * This file is an IIFE (Immediately Invoked Function Expression) module.
 * It exposes nothing to global scope except what app.js explicitly calls.
 *
 * Sections
 *   1. Constants
 *   2. DOM references
 *   3. State
 *   4. Public API  (called by app.js after page HTML is injected)
 *   5. Event wiring
 *   6. Network layer (fetch → POST /v1/extract)
 *   7. Offline simulation (demo / no-API-key fallback)
 *   8. Render functions (summary bar, totals, table, next-steps)
 *   9. Utility helpers
 */

const ExtractPage = (() => {

  /* ──────────────────────────────────────────────────────────
   * 1. Constants
   * ────────────────────────────────────────────────────────── */

  const API_ENDPOINT = '/v1/extract';
  const API_DEMO_KEY = 'ck_test_00000000000000000000000000000000';
  const FETCH_TIMEOUT_MS = 15_000;

  /** ICE Database v3 emission factors (kgCO2e / kg material) */
  const ICE_FACTORS = Object.freeze({
    concrete:   0.13,
    steel:      1.55,
    timber:    -1.00,
    aluminium:  6.67,
    glass:      1.44,
    insulation: 1.86,
    masonry:    0.24,
    plastics:   3.31,
    other:      0.50,
  });

  /** Standard densities for unit conversion (kg / m³) */
  const DENSITIES = Object.freeze({
    concrete:   2400,
    steel:      7850,
    timber:      550,
    glass:      2500,
    aluminium:  2700,
    masonry:    1800,
    insulation:   30,
    plastics:    950,
    other:      1000,
  });

  /** Tailwind-free colour tokens mapped to ICE categories */
  const CATEGORY_COLORS = Object.freeze({
    concrete:   '#3b82f6',
    steel:      '#ef4444',
    timber:     '#10b981',
    aluminium:  '#8b5cf6',
    glass:      '#06b6d4',
    insulation: '#f59e0b',
    masonry:    '#ec4899',
    plastics:   '#6366f1',
    other:      '#6b7280',
  });

  /** Keyword regex per category (used in offline simulation) */
  const CATEGORY_KEYWORDS = Object.freeze({
    concrete:   /concrete|cement|grout|mortar/i,
    steel:      /steel|rebar|reinforc|structur.*metal|iron/i,
    timber:     /timber|wood|glulam|lumber|plywood|mdf/i,
    aluminium:  /alumin/i,
    glass:      /glass|glaz/i,
    insulation: /insulat|wool|foam|rockwool|glasswool/i,
    masonry:    /brick|masonry|block|tile/i,
    plastics:   /plastic|hdpe|pvc|polymer/i,
  });

  const SAMPLE_DATA = Object.freeze({
    csv: `Material,Quantity,Unit,Notes
Concrete C30/37,850,tonnes,Foundation and core columns
Rebar Steel B500B,120,tonnes,High-yield reinforcement
Float Glass,45,tonnes,Curtain wall glazing
Structural Timber (Glulam),30,m3,Roof structure
Primary Aluminium,8,tonnes,Window and curtain wall frames
Clay Bricks,60,tonnes,Internal partition walls
Glass Wool Insulation,12,tonnes,Roof and cavity wall insulation
HDPE Plastic Pipes,3,tonnes,Mechanical plumbing services`,

    text: `Marina Bay Tower — BOQ Summary (Phase 2)

Site preparation and substructure:
- 850 metric tonnes of reinforced concrete (C30/37 specification)
- 120 tonnes high-yield rebar steel (B500B)

Superstructure and envelope:
- 30 cubic metres of glulam structural timber
- 8 tonnes primary aluminium extrusions (curtain wall frames)
- 45 tonnes float glass (full-height glazing)

Internal fit-out and services:
- 60 tonnes clay masonry bricks (partition walls)
- 12 tonnes glass wool insulation (roof and wall cavities)
- 3 tonnes HDPE plastic piping (mechanical services)`,
  });

  /* ──────────────────────────────────────────────────────────
   * 2. DOM References  (resolved lazily after page injection)
   * ────────────────────────────────────────────────────────── */

  const $ = (id) => document.getElementById(id);

  const dom = {
    get submitBtn()       { return $('extract-submit-btn'); },
    get clearBtn()        { return $('extract-clear-btn'); },
    get trySampleBtn()    { return $('extract-try-sample-btn'); },
    get copyJsonBtn()     { return $('extract-copy-json-btn'); },
    get projectName()     { return $('extract-project-name'); },
    get textarea()        { return $('extract-textarea'); },
    get fileInput()       { return $('extract-file-input'); },
    get dropzone()        { return $('extract-dropzone'); },
    get errorEl()         { return $('extract-error'); },
    get statePlaceholder(){ return $('extract-state-placeholder'); },
    get stateLoading()    { return $('extract-state-loading'); },
    get resultsEl()       { return $('extract-results'); },
    get summaryBar()      { return $('extract-summary-bar'); },
    get totalsContent()   { return $('extract-totals-content'); },
    get tableBody()       { return $('extract-table-body'); },
    get formatRadios()    { return document.querySelectorAll('input[name="extractFormat"]'); },
    get formatTabs()      { return document.querySelectorAll('.extract-format-tab'); },
    get sampleBtns()      { return document.querySelectorAll('[data-sample]'); },
    get nextStepBtns()    { return document.querySelectorAll('[data-navigate]'); },
  };

  /* ──────────────────────────────────────────────────────────
   * 3. State
   * ────────────────────────────────────────────────────────── */

  let lastExtractedMaterials = [];

  /* ──────────────────────────────────────────────────────────
   * 4. Public API  (called from app.js)
   * ────────────────────────────────────────────────────────── */

  function init() {
    _wireFormatTabs();
    _wireDropzone();
    _wireSampleButtons();
    _wireSubmit();
    _wireClear();
    _wireCopyJson();
    _wireNextSteps();
    _wireTrySample();
  }

  /* ──────────────────────────────────────────────────────────
   * 5. Event Wiring
   * ────────────────────────────────────────────────────────── */

  function _wireFormatTabs() {
    dom.formatRadios.forEach((radio) => {
      radio.addEventListener('change', _syncFormatTabStyles);
    });
    _syncFormatTabStyles();
  }

  function _syncFormatTabStyles() {
    dom.formatTabs.forEach((tab) => {
      const radio = tab.querySelector('input[type="radio"]');
      tab.classList.toggle('extract-format-tab--active', radio && radio.checked);
    });
  }

  function _wireDropzone() {
    const dz = dom.dropzone;
    const fi = dom.fileInput;
    if (!dz || !fi) return;

    dz.addEventListener('click', () => fi.click());
    dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') fi.click(); });
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('extract-dropzone--drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('extract-dropzone--drag-over'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('extract-dropzone--drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (file) _loadFile(file);
    });
    fi.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) _loadFile(file);
    });
  }

  function _loadFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      dom.textarea.value = e.target.result;
      // Auto-detect format from file extension
      if (file.name.endsWith('.csv'))  _setFormat('csv');
      else if (file.name.endsWith('.json')) _setFormat('json');
      else _setFormat('text');
    };
    reader.readAsText(file);
  }

  function _setFormat(value) {
    dom.formatRadios.forEach((r) => { r.checked = r.value === value; });
    _syncFormatTabStyles();
  }

  function _wireSampleButtons() {
    dom.sampleBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.sample;
        if (SAMPLE_DATA[type]) {
          dom.textarea.value = SAMPLE_DATA[type];
          _setFormat(type === 'json' ? 'json' : type);
        }
      });
    });
  }

  function _wireSubmit() {
    dom.submitBtn?.addEventListener('click', _runExtraction);
  }

  function _wireClear() {
    dom.clearBtn?.addEventListener('click', () => {
      dom.textarea.value = '';
      dom.projectName.value = '';
      _hideError();
      _showState('placeholder');
      lastExtractedMaterials = [];
    });
  }

  function _wireCopyJson() {
    dom.copyJsonBtn?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(lastExtractedMaterials, null, 2));
        const btn = dom.copyJsonBtn;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy JSON'; }, 2000);
      } catch {
        /* clipboard unavailable in non-secure context */
      }
    });
  }

  function _wireNextSteps() {
    dom.nextStepBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.navigate;
        const navLink = document.querySelector(`.nav-item[data-page="${target}"]`);
        navLink?.click();
      });
    });
  }

  function _wireTrySample() {
    dom.trySampleBtn?.addEventListener('click', () => {
      dom.textarea.value = SAMPLE_DATA.csv;
      _setFormat('csv');
      _runExtraction();
    });
  }

  /* ──────────────────────────────────────────────────────────
   * 6. Network Layer
   * ────────────────────────────────────────────────────────── */

  async function _runExtraction() {
    const content = dom.textarea?.value.trim();
    if (!content) {
      _showError('Please paste your BOQ data before extracting.');
      return;
    }

    const format      = _getSelectedFormat();
    const projectName = dom.projectName?.value.trim() || null;

    _hideError();
    _setSubmitLoading(true);
    _showState('loading');

    try {
      let result;

      try {
        result = await _fetchExtract({ content, format, projectName });
      } catch {
        // Graceful degradation: offline simulation for demo/development
        result = _simulateExtraction(content, format, projectName);
      }

      lastExtractedMaterials = result.extraction.materials;
      _render(result, projectName);
      _showState('results');

    } catch (err) {
      _showState('placeholder');
      _showError(err.message || 'Extraction failed. Please try again.');
    } finally {
      _setSubmitLoading(false);
    }
  }

  async function _fetchExtract({ content, format, projectName }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(API_ENDPOINT, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key':    API_DEMO_KEY,
        },
        body:   JSON.stringify({ content, format, projectName, computeTotal: true }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`API responded with HTTP ${response.status}`);
      }

      return response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /* ──────────────────────────────────────────────────────────
   * 7. Offline Simulation  (demo / no-API-key fallback)
   * ────────────────────────────────────────────────────────── */

  function _simulateExtraction(content, format, projectName) {
    const lines   = content.split('\n').map((l) => l.trim()).filter(Boolean);
    const materials = [];

    const csvRe  = /^(.+?),\s*([\d.,]+)\s*,\s*(\w+)/;
    const textRe = /([\d.,]+)\s*(kg|t|tonnes?|m3|m2|m)\s+(?:of\s+)?(.+)/i;

    for (const line of lines) {
      if (/material|item|description|notes/i.test(line) && line.includes(',')) continue;

      let name = '', rawQty = null, rawUnit = '';

      const csvMatch  = line.match(csvRe);
      const textMatch = line.match(textRe);

      if (csvMatch) {
        name    = csvMatch[1].trim();
        rawQty  = parseFloat(csvMatch[2].replace(',', ''));
        rawUnit = csvMatch[3];
      } else if (textMatch) {
        rawQty  = parseFloat(textMatch[1].replace(',', ''));
        rawUnit = textMatch[2];
        name    = textMatch[3].replace(/[^\w\s()/-]/g, '').trim();
      } else {
        continue;
      }

      const category  = _detectCategory(name);
      const qtyKg     = _toKilograms(rawQty, rawUnit, category);
      const factor    = ICE_FACTORS[category] ?? ICE_FACTORS.other;
      const totalKgCO2e = qtyKg != null
        ? parseFloat((qtyKg * factor).toFixed(2))
        : null;

      materials.push({
        name,
        category,
        quantity:         qtyKg != null ? parseFloat(qtyKg.toFixed(1)) : null,
        originalQuantity: rawQty,
        originalUnit:     rawUnit,
        recycledContent:  null,
        confidence:       category === 'other' ? 'low' : 'high',
        notes:            rawUnit.toLowerCase() !== 'kg'
          ? `Converted from ${rawQty} ${rawUnit} using standard density`
          : '',
        emissionFactor:       factor,
        emissionFactorUnit:   'kgCO2e/kg',
        emissionFactorSource: 'ICE v3',
        totalKgCO2e,
      });
    }

    const carbonTotals = _computeCarbonTotals(materials);

    return {
      extraction: {
        materials,
        summary: {
          totalItems:         materials.length,
          lowConfidenceItems: materials.filter((m) => m.confidence === 'low').length,
          unresolvableItems:  0,
          parseNotes:         'Client-side simulation (demo mode — AI API not available)',
        },
      },
      carbonTotals,
      meta: {
        model:        'demo-simulation',
        tokensUsed:   { input: 0, output: 0 },
        extractedAt:  new Date().toISOString(),
        inputFormat:  format,
        factorSource: 'ICE v3',
      },
    };
  }

  function _detectCategory(name) {
    for (const [cat, re] of Object.entries(CATEGORY_KEYWORDS)) {
      if (re.test(name)) return cat;
    }
    return 'other';
  }

  function _toKilograms(qty, unit, category) {
    if (qty == null) return null;
    const u = unit.toLowerCase();
    if (u === 'kg')                 return qty;
    if (u === 't' || /tonnes?/.test(u)) return qty * 1000;
    if (u === 'm3')                 return qty * (DENSITIES[category] ?? DENSITIES.other);
    return qty; // m, m2, pieces — return as-is (no density conversion)
  }

  function _computeCarbonTotals(materials) {
    const valid = materials.filter((m) => m.totalKgCO2e != null);
    if (valid.length === 0) {
      return { totalKgCO2e: 0, totalTCO2e: 0, byCategory: {}, itemsExtracted: materials.length, itemsWithEmissions: 0, coveragePercent: 0 };
    }

    const totalKgCO2e = valid.reduce((s, m) => s + m.totalKgCO2e, 0);
    const byCategory  = {};

    for (const m of valid) {
      if (!byCategory[m.category]) {
        byCategory[m.category] = { kgCO2e: 0, quantityKg: 0, itemCount: 0 };
      }
      byCategory[m.category].kgCO2e    += m.totalKgCO2e;
      byCategory[m.category].quantityKg += m.quantity ?? 0;
      byCategory[m.category].itemCount  += 1;
    }

    for (const cat of Object.keys(byCategory)) {
      byCategory[cat].kgCO2e = parseFloat(byCategory[cat].kgCO2e.toFixed(2));
      byCategory[cat].pct    = totalKgCO2e > 0
        ? parseFloat((byCategory[cat].kgCO2e / totalKgCO2e * 100).toFixed(1))
        : 0;
    }

    return {
      totalKgCO2e:      parseFloat(totalKgCO2e.toFixed(2)),
      totalTCO2e:       parseFloat((totalKgCO2e / 1000).toFixed(3)),
      byCategory,
      itemsExtracted:   materials.length,
      itemsWithEmissions: valid.length,
      coveragePercent:  parseFloat((valid.length / materials.length * 100).toFixed(1)),
    };
  }

  /* ──────────────────────────────────────────────────────────
   * 8. Render Functions
   * ────────────────────────────────────────────────────────── */

  function _render(result, projectName) {
    const { extraction, carbonTotals } = result;
    const { materials, summary }       = extraction;

    _renderSummaryBar(materials, carbonTotals);
    _renderTotals(carbonTotals, summary);
    _renderTable(materials);
  }

  function _renderSummaryBar(materials, totals) {
    const highConf = materials.filter((m) => m.confidence === 'high').length;
    const metrics  = [
      { value: materials.length,                   label: 'Materials Found' },
      { value: highConf,                            label: 'High Confidence' },
      { value: totals ? totals.totalTCO2e.toFixed(1) + ' t' : '—', label: 'tCO₂e Total' },
      { value: totals ? totals.coveragePercent + '%' : '—',         label: 'Coverage' },
    ];

    dom.summaryBar.innerHTML = metrics.map(({ value, label }) => `
      <div class="extract-summary-metric">
        <div class="extract-summary-metric__value">${value}</div>
        <div class="extract-summary-metric__label">${label}</div>
      </div>`).join('');
  }

  function _renderTotals(totals, summary) {
    if (!totals) { dom.totalsContent.innerHTML = '<p style="color:var(--text-secondary);font-size:13px;">No quantified materials found.</p>'; return; }

    const catRows = Object.entries(totals.byCategory)
      .sort((a, b) => b[1].kgCO2e - a[1].kgCO2e)
      .map(([cat, data]) => {
        const colour = CATEGORY_COLORS[cat] || CATEGORY_COLORS.other;
        return `
          <div class="extract-category-row">
            <div class="extract-category-row__header">
              <div class="extract-category-row__name">
                <span class="extract-category-dot" style="background:${colour}" aria-hidden="true"></span>
                <span class="extract-category-label">${cat}</span>
                <span class="extract-category-count">(${data.itemCount} item${data.itemCount !== 1 ? 's' : ''})</span>
              </div>
              <div class="extract-category-row__values">
                <span class="extract-category-tco2e">${(data.kgCO2e / 1000).toFixed(2)} tCO₂e</span>
                <span class="extract-category-pct">${data.pct}%</span>
              </div>
            </div>
            <div class="extract-bar-track" role="meter" aria-valuenow="${data.pct}" aria-valuemin="0" aria-valuemax="100">
              <div class="extract-bar-fill" style="background:${colour};width:${data.pct}%"></div>
            </div>
          </div>`;
      }).join('');

    const noteHtml = summary?.parseNotes
      ? `<p class="extract-parse-note">ℹ️ ${_escapeHtml(summary.parseNotes)}</p>`
      : '';

    dom.totalsContent.innerHTML = `
      <div class="extract-totals-headline">
        <div class="extract-totals-stat">
          <div class="extract-totals-stat__value">${totals.totalTCO2e.toFixed(2)}</div>
          <div class="extract-totals-stat__label">tCO₂e total embodied</div>
        </div>
        <div class="extract-totals-divider" aria-hidden="true"></div>
        <div class="extract-totals-stat">
          <div class="extract-totals-stat__value">${totals.totalKgCO2e.toLocaleString()}</div>
          <div class="extract-totals-stat__label">kgCO₂e</div>
        </div>
        <div class="extract-totals-source">
          <div class="extract-totals-source__label">Factor source</div>
          <div class="extract-totals-source__value">ICE Database v3</div>
          <div class="extract-totals-source__sub">PCAF Data Quality Score 2</div>
        </div>
      </div>
      ${catRows}
      ${noteHtml}`;
  }

  function _renderTable(materials) {
    const tbody = dom.tableBody;
    if (!tbody) return;

    tbody.innerHTML = materials.map((m) => {
      const colour     = CATEGORY_COLORS[m.category] || CATEGORY_COLORS.other;
      const nameShort  = m.name.length > 34 ? m.name.slice(0, 34) + '…' : m.name;
      const confClass  = `extract-confidence--${m.confidence || 'low'}`;
      const emisClass  = m.totalKgCO2e > 200_000
        ? 'extract-emission--alert'
        : m.totalKgCO2e > 80_000
          ? 'extract-emission--warning'
          : '';

      return `
        <tr>
          <td>
            <span class="extract-material-name" title="${_escapeHtml(m.name)}">${_escapeHtml(nameShort)}</span>
          </td>
          <td>
            <span class="extract-category-chip" style="background:${colour}18;color:${colour}">${_escapeHtml(m.category)}</span>
          </td>
          <td class="text-right">${m.originalQuantity != null ? m.originalQuantity.toLocaleString() : '—'} ${_escapeHtml(m.originalUnit || '')}</td>
          <td class="text-right">${m.quantity != null ? m.quantity.toLocaleString() : '—'}</td>
          <td class="text-right">${m.emissionFactor}</td>
          <td class="text-right ${emisClass}">${m.totalKgCO2e != null ? m.totalKgCO2e.toLocaleString() : '—'}</td>
          <td><span class="extract-confidence ${confClass}">${m.confidence || '?'}</span></td>
        </tr>`;
    }).join('');
  }

  /* ──────────────────────────────────────────────────────────
   * 9. Utility Helpers
   * ────────────────────────────────────────────────────────── */

  function _showState(state) {
    const placeholder = dom.statePlaceholder;
    const loading     = dom.stateLoading;
    const results     = dom.resultsEl;
    if (placeholder) placeholder.hidden = state !== 'placeholder';
    if (loading)     loading.hidden     = state !== 'loading';
    if (results)     results.hidden     = state !== 'results';
  }

  function _setSubmitLoading(isLoading) {
    const btn = dom.submitBtn;
    if (!btn) return;
    btn.disabled     = isLoading;
    btn.textContent  = isLoading ? 'Extracting…' : 'Extract with AI';
  }

  function _showError(message) {
    const el = dom.errorEl;
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
  }

  function _hideError() {
    const el = dom.errorEl;
    if (el) el.hidden = true;
  }

  function _getSelectedFormat() {
    for (const radio of dom.formatRadios) {
      if (radio.checked) return radio.value;
    }
    return 'text';
  }

  /** Minimal XSS protection for dynamic HTML insertion */
  function _escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── Public surface ─────────────────────────────────────── */
  return { init };

})();
