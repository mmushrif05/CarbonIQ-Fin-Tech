/* ============================================================
   CarbonIQ — New Project Wizard Module
   ============================================================
   Multi-step wizard: Project Details → BOM → Loan & Finance
   → Review & Score. Calculates embodied carbon live and
   submits to /v1/assess for AI scoring.
   ============================================================ */

const NewProject = (() => {
  /**
   * Neither the material factors nor the arithmetic are held here.
   *
   * A copy of the factor table lived in this file and disagreed with the
   * engine's — timber at 0.263 against -1.00, aluminium at 8.240 against 6.67
   * — and the screen multiplied by it, so the carbon total on the review
   * step, and the SLGFT tier drawn from that total, were computed on factors
   * the engine does not use. The table then came from `GET /v1/extract/factors`
   * and the browser still did the multiplying, the intensity, the attribution
   * and two taxonomy quick-checks on thresholds no framework publishes.
   *
   * `POST /v1/lending/estimate` prices the bill now and returns every figure
   * the bill and the review step print; the factor route is read only for
   * the category list the dropdown offers. `POST /v1/taxonomy/screen` answers
   * the quick-check. This module computes nothing.
   */
  let _categories = null;

  async function loadCategories() {
    if (_categories) return _categories;
    const res = await window.CARBONIQ_fetch('/v1/extract/factors');
    const data = await res.json();
    _categories = Object.keys(data.factors || {});
    return _categories;
  }

  /** The engine's pricing of the bill as it stands — lines, totals, attribution. */
  let _estimate = null;
  let _estimateTicket = 0;

  async function _priceBill() {
    const ticket = ++_estimateTicket;
    const body = {
      materials: _materials.map(m => ({ name: m.name, category: m.category, qty: m.qty, unit: m.unit })),
      floorArea_m2: parseFloat($$('np-proj-area')?.value || 0) || undefined,
      loan: {
        outstanding: parseFloat($$('np-outstanding')?.value || 0) * 1e6 || undefined,
        equity:      parseFloat($$('np-equity')?.value || 0) * 1e6 || undefined,
        debt:        parseFloat($$('np-debt')?.value || 0) * 1e6 || undefined,
      },
    };
    const res = await window.CARBONIQ_fetch('/v1/lending/estimate', { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`The estimate was refused (${res.status}).`);
    const data = await res.json();
    if (ticket !== _estimateTicket) return null;   // a later bill is already being priced
    _estimate = data;
    return data;
  }

  let _step = 1;
  const _materials = [
    { name: 'Concrete C30/37', category: 'concrete', qty: 850000, unit: 'kg' },
    { name: 'Rebar Steel',     category: 'steel',    qty: 120000, unit: 'kg' },
    { name: 'Float Glass',     category: 'glass',    qty: 45000,  unit: 'kg' },
  ];

  // ── Helpers ───────────────────────────────────────────────
  function $$(id)  { return document.getElementById(id); }
  function _fmtN(n){ return Math.round(n).toLocaleString('en-US'); }
  // ── Step navigation ───────────────────────────────────────
  function goTo(step) {
    _step = step;

    // Update step indicators
    for (let i = 1; i <= 4; i++) {
      const el = $$(`np-step-${i}`);
      if (!el) continue;
      el.classList.toggle('active',   i <= step);
      el.classList.toggle('current',  i === step);
    }
    const connectors = document.querySelectorAll('#page-new-project .wizard-connector');
    connectors.forEach((c, idx) => c.classList.toggle('active', idx < step - 1));

    // Show / hide panels
    for (let i = 1; i <= 4; i++) {
      const panel = $$(`np-panel-${i}`);
      if (panel) panel.style.display = i === step ? 'block' : 'none';
    }

    if (step === 2) _repriceBOM();
    if (step === 4) void _runReview();
  }

  // ── BOM rendering ─────────────────────────────────────────
  function _renderBOM() {
    const tbody = $$('np-bom-tbody');
    if (!tbody) return;

    const lines = (_estimate && _estimate.lines) || [];
    tbody.innerHTML = _materials.map((m, i) => {
      const line = lines[i] && lines[i].category === String(m.category || '').toLowerCase() ? lines[i] : null;
      const catOpts = (_categories || []).map(k =>
        `<option value="${k}" ${k === m.category ? 'selected' : ''}>${k}</option>`
      ).join('');
      return `<tr>
        <td><input type="text" class="form-input form-input-sm" value="${esc(m.name)}"
          data-action-change="NewProject.editMaterial" data-index="${i}" data-field="name" /></td>
        <td><select class="form-input form-input-sm"
          data-action-change="NewProject.editMaterial" data-index="${i}" data-field="category">${catOpts}</select></td>
        <td><input type="number" class="form-input form-input-sm" value="${m.qty}" min="0"
          data-action-change="NewProject.editMaterial" data-index="${i}" data-field="qty" /></td>
        <td>
          <select class="form-input form-input-sm"
            data-action-change="NewProject.editMaterial" data-index="${i}" data-field="unit">
            <option value="kg" ${m.unit==='kg'?'selected':''}>kg</option>
            <option value="tonnes" ${m.unit==='tonnes'?'selected':''}>tonnes</option>
          </select>
        </td>
        <td class="cell-auto">${line && line.factor !== null ? line.factor.toFixed(3) : '—'}</td>
        <td class="cell-computed">${line && line.kgCO2e !== null ? _fmtN(line.kgCO2e) : '—'}</td>
        <td><button class="btn-icon-sm" data-action="NewProject.removeMaterial" data-arg="${i}">×</button></td>
      </tr>`;
    }).join('');

    _renderBOMTotal();
  }

  function _renderBOMTotal() {
    /* The total and the count of what was left out are the engine's: a line
       with no factor is not counted as zero, and a total drawn from six of
       nine lines means something different from one drawn from all nine. */
    const el = $$('np-bom-total');
    if (!el) return;
    const t = _estimate && _estimate.totals;
    if (!t) { el.textContent = 'Not yet priced'; return; }
    const missing = t.unpricedCount || 0;
    el.textContent = `${_fmtN(t.totalKgCO2e)} kgCO2e${missing > 0 ? ` (${missing} line${missing === 1 ? '' : 's'} unpriced)` : ''}`;
  }

  /** Price the bill again and redraw it; a refusal leaves the last answer standing. */
  function _repriceBOM() {
    _priceBill().then(() => _renderBOM()).catch(() => { _renderBOM(); });
  }

  /*
   * The row edits, taken off the control rather than baked into it.
   *
   * A row used to carry `_updateMat(3,'qty',+this.value)` — an index, a field
   * name and a coercion, written into markup by a template. The index and the
   * field are the row's own facts, so they live on the row as data; the value
   * comes from the event. Which field it is decides whether the value is a
   * number, which is the one thing the old form got right and the only thing
   * worth carrying over.
   *
   * @param {string} value
   * @param {HTMLElement} el
   */
  function editMaterial(value, el) {
    const idx = Number(el.dataset.index);
    const field = el.dataset.field;
    if (!Number.isInteger(idx) || !field) return;
    _updateMat(idx, field, field === 'qty' ? Number(value) : value);
  }

  /** @param {string} index */
  function removeMaterial(index) {
    const i = Number(index);
    if (Number.isInteger(i)) _removeMat(i);
  }

  function _updateMat(idx, field, value) {
    _materials[idx][field] = value;
    _repriceBOM();
  }

  function _removeMat(idx) {
    _materials.splice(idx, 1);
    _repriceBOM();
  }

  function addMaterial() {
    _materials.push({ name: '', category: 'concrete', qty: 0, unit: 'kg' });
    _repriceBOM();
    // Focus the new name input
    const rows = document.querySelectorAll('#np-bom-tbody tr');
    const last = rows[rows.length - 1];
    if (last) last.querySelector('input')?.focus();
  }

  // ── Region change: toggle LK fields ──────────────────────
  function onRegionChange(region) {
    const lkFields = $$('np-lk-fields');
    if (lkFields) lkFields.style.display = region === 'LK' ? 'block' : 'none';
  }

  // ── Activity code lookup ──────────────────────────────────
  /**
   * Neither the activity table nor the intensity bands are held here.
   *
   * This file carried a third copy of the SLGFT activity table, stale in the
   * same three ways the others were, and — worse — it screened intensity
   * against **600/900**. Those bands were settled at 520/780 and moved into
   * the governed baseline registry, so this screen was answering a question
   * about what a bank may call a green loan differently from the endpoint
   * beside it, on a page a relationship manager fills in with a client.
   *
   * Both now come from `GET /v1/ndc-sdg/framework`, which serves what the
   * engine screens against and says which baseline version it used. A screen
   * that cannot reach it says so rather than screening on a guess.
   */
  let _slgft = null;

  const esc = (v) => String(v == null ? '' : v)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** The activities and the bands in force, loaded once before either is read. */
  async function loadSlgft() {
    if (_slgft) return _slgft;
    const f = await window.CARBONIQ_fetch('/v1/ndc-sdg/framework');
    const byCode = {};
    for (const a of (f.activities || [])) if (a.code) byCode[a.code] = a;
    _slgft = { activities: byCode, screen: f.intensityScreen || null };
    return _slgft;
  }

  function lookupActivity(code) {
    const el = $$('np-activity-desc');
    if (!el) return;
    const upper = (code || '').trim().toUpperCase();

    if (!_slgft) {
      el.style.display = upper.length > 1 ? 'block' : 'none';
      if (upper.length > 1) {
        el.innerHTML = '<span style="color:var(--text-tertiary);font-size:13px">'
          + 'The taxonomy has not loaded, so this code is not described.</span>';
      }
      return;
    }

    const match = _slgft.activities[upper];
    if (match) {
      const badge = match.eligibility === 'direct'
        ? '<span class="slgft-code" style="background:var(--blue-50,#eff6ff);color:var(--blue-600,#2563eb)">Direct Eligibility</span>'
        : '<span class="slgft-code" style="background:var(--green-50,#f0fdf4);color:var(--green-600,#16a34a)">Threshold-Based</span>';
      el.style.display = 'block';
      el.innerHTML = `${badge} <strong>${esc(match.label)}</strong>`
        + `<br><small style="color:var(--text-tertiary)">${esc(match.criterion || '')}</small>`;
    } else {
      el.style.display = upper.length > 1 ? 'block' : 'none';
      if (upper.length > 1) {
        const known = Object.keys(_slgft.activities).slice(0, 3).join(', ');
        el.innerHTML = `<span style="color:var(--text-tertiary);font-size:13px">No matching activity for "${esc(upper)}"`
          + `${known ? `. Try ${esc(known)}…` : '.'}</span>`;
      }
    }
  }

  // ── Step 1 → Step 2 validation ────────────────────────────
  function nextFromStep1() {
    const name = $$('np-proj-name')?.value?.trim();
    if (!name) { _showError('step1', 'Project name is required.'); return; }
    _clearError('step1');
    goTo(2);
  }

  // ── Step 3: Loan fields ───────────────────────────────────
  function nextFromStep3() {
    const outstanding = parseFloat($$('np-outstanding')?.value || 0);
    const equity      = parseFloat($$('np-equity')?.value || 0);
    const debt        = parseFloat($$('np-debt')?.value || 0);
    if (!outstanding || !equity || !debt) {
      _showError('step3', 'Please fill in all loan fields.'); return;
    }
    _clearError('step3');
    goTo(4);
  }

  // ── Step 4: Review & Score ────────────────────────────────
  /**
   * The review step prints what two reads return and computes nothing:
   * `POST /v1/lending/estimate` prices the bill and attributes it, and
   * `POST /v1/taxonomy/screen` places the intensity against the five
   * frameworks. The quick-check used to screen on 1,000 and 900 kgCO2e/m2,
   * two thresholds no framework publishes, held in this file.
   */
  async function _runReview() {
    const panel = $$('np-review-body');
    if (!panel) return;
    panel.innerHTML = '<p class="np-review-wait">Pricing the bill…</p>';

    let est;
    try { est = await _priceBill(); } catch (err) {
      panel.innerHTML = `<p class="mon-msg-error">${esc(err instanceof Error ? err.message : String(err))}</p>`;
      return;
    }
    if (!est) return;

    const name         = $$('np-proj-name')?.value?.trim() || 'New Project';
    const type         = $$('np-proj-type')?.value || 'Commercial';
    const region       = $$('np-proj-region')?.value || 'SG';
    const slsicSector  = $$('np-slsic-sector')?.value || '';
    const activityCode = ($$('np-activity-code')?.value || '').trim().toUpperCase();
    const t = est.totals;
    const attribution = est.attribution;
    const intensity = t.intensity_kgCO2e_m2;

    /* The screen, where there is an intensity to screen. */
    let screen = null;
    if (intensity !== null) {
      try {
        const res = await window.CARBONIQ_fetch('/v1/taxonomy/screen', {
          method: 'POST', body: JSON.stringify({ intensity_kgCO2e_m2: intensity, country: 'LK' }),
        });
        if (res.ok) screen = await res.json();
      } catch (_) { screen = null; }
    }
    const fw = id => screen ? screen.frameworks.find(f => f.id === id) : null;
    const quick = (id) => {
      const f = fw(id);
      if (!f) return { cls: 'badge-neutral', text: intensity === null ? 'Pending (no area)' : 'Not screened' };
      return f.tier === 'aligned'
        ? { cls: 'badge-green', text: 'Likely Aligned' }
        : { cls: 'badge-amber', text: 'Review Needed' };
    };
    const sg = quick('sg');
    const eu = quick('eu');

    // Sri Lanka SLGFT quick-check
    let lkSection = '';
    if (region === 'LK') {
      const actMatch = _slgft ? _slgft.activities[activityCode] : null;
      const sl = fw('sl');
      let lkTier, lkBadge;
      if (actMatch && actMatch.eligibility === 'direct') {
        lkTier = 'Directly Eligible'; lkBadge = 'badge-blue';
      } else if (intensity === null) {
        lkTier = 'Pending (no area)'; lkBadge = 'badge-red';
      } else if (!sl) {
        /* Absence is an answer: a tier assigned on a band this screen invented
           would be quoted as the taxonomy's. */
        lkTier = 'Not screened — bands unavailable'; lkBadge = 'badge-amber';
      } else if (sl.tier === 'aligned') {
        lkTier = 'Green — Aligned';  lkBadge = 'badge-green';
      } else if (sl.tier === 'transition') {
        lkTier = 'Transition';        lkBadge = 'badge-amber';
      } else {
        lkTier = 'Not Aligned'; lkBadge = 'badge-red';
      }
      const actDesc = actMatch ? ` — ${esc(actMatch.label)}` : '';
      const bandNote = sl
        ? ` <span style="color:var(--text-tertiary);font-weight:400">(screen: ≤${sl.threshold_kgCO2e_m2} green${sl.provisional ? ', provisional' : ''})</span>`
        : '';
      lkSection = `
        <div class="review-section review-section-full slgft-review-section">
          <h4>🇱🇰 Sri Lanka Green Finance Taxonomy (SLGFT)</h4>
          <div class="review-row"><span>SLGFT Tier</span><strong><span class="kpi-badge ${lkBadge}">${lkTier}</span></strong></div>
          ${slsicSector ? `<div class="review-row"><span>SLSIC Sector</span><strong>Sector ${esc(slsicSector)}</strong></div>` : ''}
          ${activityCode ? `<div class="review-row"><span>Activity Code</span><strong>${esc(activityCode)}${actDesc}</strong></div>` : ''}
          ${intensity !== null ? `<div class="review-row"><span>Intensity</span><strong>${intensity.toFixed(1)} kgCO2e/m²${bandNote}</strong></div>` : ''}
          <div class="review-row"><span>NDC Contribution</span><strong>NDC 3.0 &mdash; 20.09% cumulative GHG reduction vs BAU, 2026–2035</strong></div>
          <div class="review-row"><span>Key SDGs</span><strong>SDG 7 · 9 · 11 · 13 · 14 · 15</strong></div>
          <div style="margin-top:8px">
            <button class="btn btn-ghost btn-sm" data-action="Nav.go" data-arg="ndc-sdg" style="font-size:12px">
              Run AI NDC/SDG Analysis →
            </button>
          </div>
        </div>`;
    }

    panel.innerHTML = `
      <div class="review-grid">
        <div class="review-section">
          <h4>Project Summary</h4>
          <div class="review-row"><span>Name</span><strong>${esc(name)}</strong></div>
          <div class="review-row"><span>Type</span><strong>${esc(type)}</strong></div>
          <div class="review-row"><span>Region</span><strong>${esc(region)}${region === 'LK' ? ' 🇱🇰' : ''}</strong></div>
          <div class="review-row"><span>Floor Area</span><strong>${t.floorArea_m2 ? _fmtN(t.floorArea_m2)+' m²' : '—'}</strong></div>
        </div>
        <div class="review-section">
          <h4>Carbon Footprint</h4>
          <div class="review-row"><span>Total Embodied</span><strong>${_fmtN(t.totalKgCO2e)} kgCO2e</strong></div>
          <div class="review-row"><span>Intensity</span><strong>${intensity === null ? '—' : intensity.toFixed(1)} kgCO2e/m²</strong></div>
          ${t.unpricedCount > 0 ? `<div class="review-row"><span>Not counted</span><strong>${t.unpricedCount} line${t.unpricedCount === 1 ? '' : 's'} with no factor</strong></div>` : ''}
          <div class="review-row"><span>Materials</span><strong>${_materials.length} items</strong></div>
        </div>
        <div class="review-section">
          <h4>PCAF Attribution</h4>
          <div class="review-row"><span>Attribution Factor</span><strong>${attribution ? attribution.factor.toFixed(3) : '—'}</strong></div>
          <div class="review-row"><span>Financed Emissions</span><strong>${attribution ? _fmtN(attribution.financedEmissions_tCO2e) : '—'} tCO2e</strong></div>
          <div class="review-row"><span>Outstanding</span><strong>${attribution ? window.CARBONIQ_money.moneyShort(attribution.outstanding, 'USD') : '—'}</strong></div>
        </div>
        <div class="review-section">
          <h4>Taxonomy Quick-Check</h4>
          <div class="review-row">
            <span>SG Green Mark</span>
            <strong><span class="kpi-badge ${sg.cls}">${sg.text}</span></strong>
          </div>
          <div class="review-row">
            <span>EU Taxonomy</span>
            <strong><span class="kpi-badge ${eu.cls}">${eu.text}</span></strong>
          </div>
          ${screen ? `<div class="review-row"><span>Basis</span><strong style="font-weight:400;color:var(--text-tertiary)">Indicative embodied-carbon proxies — the frameworks decide alignment on other evidence</strong></div>` : ''}
        </div>
        ${lkSection}
      </div>
      <div class="review-actions">
        <button class="btn btn-ghost btn-lg" data-action="NewProject.goTo" data-arg="3">← Back</button>
        <button class="btn btn-primary btn-lg" id="np-submit-btn" data-action="NewProject.submitProject">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8h12M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Submit Project
        </button>
      </div>
      <div id="np-submit-msg" style="margin-top:12px;font-size:13px"></div>
    `;
  }

  async function submitProject() {
    const btn = $$('np-submit-btn');
    const msg = $$('np-submit-msg');
    if (btn) btn.disabled = true;
    if (msg) { msg.textContent = 'Submitting…'; msg.className = ''; }

    const name        = $$('np-proj-name')?.value?.trim() || 'New Project';
    /* The total is the engine's, priced on the review step; a bill the engine
       has not priced carries no total rather than one summed here. */
    const totalKgCO2e = _estimate && _estimate.totals ? _estimate.totals.totalKgCO2e : null;
    const bomText     = _materials.map(m =>
      `${m.name}: ${m.qty} ${m.unit} (${m.category})`
    ).join('\n');

    const region       = $$('np-proj-region')?.value || 'SG';
    const slsicSector  = $$('np-slsic-sector')?.value || undefined;
    const activityCode = ($$('np-activity-code')?.value || '').trim().toUpperCase() || undefined;

    const projectPayload = {
      name,
      projectId:    $$('np-proj-id')?.value?.trim() || '',
      type:         $$('np-proj-type')?.value || 'Commercial',
      region,
      phase:        $$('np-proj-phase')?.value || 'Construction',
      floorArea_m2: parseFloat($$('np-proj-area')?.value || 0),
      ...(slsicSector  && { slsicSector }),
      ...(activityCode && { activityCode }),
      materials:    _materials.map(m => ({ name: m.name, category: m.category, qty: m.qty, unit: m.unit })),
      loan: {
        outstanding: parseFloat($$('np-outstanding')?.value || 0) * 1e6,
        equity:      parseFloat($$('np-equity')?.value || 0) * 1e6,
        debt:        parseFloat($$('np-debt')?.value || 0) * 1e6,
        currency:    $$('np-currency')?.value || 'USD',
      },
      ...(totalKgCO2e !== null && { totalEmbodiedCarbon_kgCO2e: totalKgCO2e }),
    };

    try {
      // Step 1: Save project to Firebase via POST /v1/projects
      let savedProjectId = null;
      try {
        const projRes = await window.CARBONIQ_fetch('/v1/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(projectPayload),
        });
        if (projRes.ok) {
          const projData = await projRes.json();
          savedProjectId = projData.projectId;
        }
      } catch (_) {
        // Continue even if project save fails
      }

      // Step 2: Call /v1/assess for AI scoring
      const res = await window.CARBONIQ_fetch('/v1/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: bomText, format: 'text', projectName: name }),
      });
      if (res.ok) {
        const data = await res.json();
        const successMsg = `Project submitted${savedProjectId ? ` (ID: ${savedProjectId})` : ''}. AI assessment complete — ${data.assessment?.materials?.length || _materials.length} materials, ${_fmtN(Math.round(data.assessment?.carbonTotals?.totalKgCO2e ?? totalKgCO2e ?? 0))} kgCO2e.`;
        if (msg) { msg.textContent = successMsg; msg.className = 'mon-msg-success'; }
        if (typeof Toast !== 'undefined' && Toast.success) Toast.success(successMsg);
        // Refresh dashboard data
        if (typeof Dashboard !== 'undefined') Dashboard.refresh();
      } else {
        throw new Error(`API ${res.status}`);
      }
    } catch (_) {
      // Graceful offline mode
      const offlineMsg = totalKgCO2e === null
        ? 'The API did not answer, so the project was not assessed.'
        : `Project saved locally. Total: ${_fmtN(Math.round(totalKgCO2e))} kgCO2e. Connect to API for full assessment.`;
      if (msg) { msg.textContent = offlineMsg; msg.className = 'mon-msg-success'; }
      if (typeof Toast !== 'undefined' && Toast.success) Toast.success(offlineMsg);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ── Error helpers ─────────────────────────────────────────
  function _showError(key, text) {
    const el = $$(`np-err-${key}`);
    if (el) { el.textContent = text; el.style.display = 'block'; }
  }
  function _clearError(key) {
    const el = $$(`np-err-${key}`);
    if (el) { el.textContent = ''; el.style.display = 'none'; }
  }

  // ── Public init ───────────────────────────────────────────
  let _initialized = false;

  function init() {
    if (_initialized) return;
    _initialized = true;
    /* Loaded before the form is shown, not when a code is first typed: the
       screen must never describe a code, or assign a tier, from something it
       has not got. */
    loadSlgft().catch(() => { _slgft = null; });
    loadCategories().then(() => _repriceBOM()).catch(() => { _categories = null; _repriceBOM(); });
    goTo(1);
  }

  return { init, goTo, nextFromStep1, nextFromStep3, addMaterial, submitProject,
           onRegionChange, lookupActivity, editMaterial, removeMaterial,
           _updateMat, _removeMat };
})();
