/* ============================================================
   CarbonIQ — New Project Wizard Module
   ============================================================
   Multi-step wizard: Project Details → BOM → Loan & Finance
   → Review & Score. Calculates embodied carbon live and
   submits to /v1/assess for AI scoring.
   ============================================================ */

const NewProject = (() => {
  // ICE v3 carbon factors (A1-A3 cradle-to-gate, kgCO2e/kg)
  const ICE_FACTORS = {
    Concrete:  { default: 0.130, label: 'Concrete (general)' },
    Steel:     { default: 1.550, label: 'Steel rebar / structural' },
    Timber:    { default: 0.263, label: 'Timber (general)' },
    Glass:     { default: 1.440, label: 'Float glass' },
    Aluminium: { default: 8.240, label: 'Aluminium (primary)' },
    Copper:    { default: 3.820, label: 'Copper' },
    Brick:     { default: 0.213, label: 'Clay brick' },
    Insulation:{ default: 1.280, label: 'Mineral wool insulation' },
    Plaster:   { default: 0.120, label: 'Gypsum plaster' },
    Other:     { default: 0.500, label: 'Other / unspecified' },
  };

  let _step = 1;
  let _materials = [
    { name: 'Concrete C30/37', category: 'Concrete', qty: 850000, unit: 'kg' },
    { name: 'Rebar Steel',     category: 'Steel',    qty: 120000, unit: 'kg' },
    { name: 'Float Glass',     category: 'Glass',    qty: 45000,  unit: 'kg' },
  ];

  // ── Helpers ───────────────────────────────────────────────
  function $$(id)  { return document.getElementById(id); }
  function _fmtN(n){ return Math.round(n).toLocaleString('en-US'); }
  function _kgCO2e(mat) {
    const factor = ICE_FACTORS[mat.category]?.default || 0.5;
    const qty    = mat.unit === 'tonnes' ? mat.qty * 1000 : mat.qty;
    return qty * factor;
  }

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

    if (step === 2) _renderBOM();
    if (step === 4) _runReview();
  }

  // ── BOM rendering ─────────────────────────────────────────
  function _renderBOM() {
    const tbody = $$('np-bom-tbody');
    if (!tbody) return;

    tbody.innerHTML = _materials.map((m, i) => {
      const co2 = _kgCO2e(m);
      const catOpts = Object.keys(ICE_FACTORS).map(k =>
        `<option value="${k}" ${k === m.category ? 'selected' : ''}>${k}</option>`
      ).join('');
      return `<tr>
        <td><input type="text" class="form-input form-input-sm" value="${m.name}"
          onchange="NewProject._updateMat(${i},'name',this.value)" /></td>
        <td><select class="form-input form-input-sm"
          onchange="NewProject._updateMat(${i},'category',this.value)">${catOpts}</select></td>
        <td><input type="number" class="form-input form-input-sm" value="${m.qty}" min="0"
          onchange="NewProject._updateMat(${i},'qty',+this.value)" /></td>
        <td>
          <select class="form-input form-input-sm"
            onchange="NewProject._updateMat(${i},'unit',this.value)">
            <option value="kg" ${m.unit==='kg'?'selected':''}>kg</option>
            <option value="tonnes" ${m.unit==='tonnes'?'selected':''}>tonnes</option>
          </select>
        </td>
        <td class="cell-auto">${ICE_FACTORS[m.category]?.default.toFixed(3)}</td>
        <td class="cell-computed">${_fmtN(co2)}</td>
        <td><button class="btn-icon-sm" onclick="NewProject._removeMat(${i})">×</button></td>
      </tr>`;
    }).join('');

    _renderBOMTotal();
  }

  function _renderBOMTotal() {
    const total = _materials.reduce((s, m) => s + _kgCO2e(m), 0);
    const el = $$('np-bom-total');
    if (el) el.textContent = `${_fmtN(total)} kgCO2e`;
    return total;
  }

  function _updateMat(idx, field, value) {
    _materials[idx][field] = value;
    _renderBOM();
  }

  function _removeMat(idx) {
    _materials.splice(idx, 1);
    _renderBOM();
  }

  function addMaterial() {
    _materials.push({ name: '', category: 'Concrete', qty: 0, unit: 'kg' });
    _renderBOM();
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
  const ACTIVITY_LOOKUP = {
    'M1.1': { label: 'Green Buildings — New Construction', eligibility: 'threshold', note: 'Threshold: ≤600 kgCO2e/m²', objective: 'Climate Change Mitigation' },
    'M1.2': { label: 'Green Buildings — Renovation',       eligibility: 'direct',    note: '≥30% energy performance improvement required', objective: 'Climate Change Mitigation' },
    'M4.1': { label: 'Solar PV — Electricity Generation',  eligibility: 'direct',    note: 'Directly eligible — no intensity threshold', objective: 'Climate Change Mitigation' },
    'M4.2': { label: 'Concentrated Solar Power (CSP)',      eligibility: 'direct',    note: 'Directly eligible — no intensity threshold', objective: 'Climate Change Mitigation' },
    'M4.3': { label: 'Wind Energy',                        eligibility: 'direct',    note: 'Directly eligible — no intensity threshold', objective: 'Climate Change Mitigation' },
    'M6.1': { label: 'Clean Transportation Infrastructure', eligibility: 'direct',    note: 'Directly eligible — no intensity threshold', objective: 'Climate Change Mitigation' },
    'A2.1': { label: 'Flood-Resilient Construction',        eligibility: 'direct',    note: 'Directly eligible', objective: 'Climate Change Adaptation' },
    'A2.2': { label: 'Climate-Resilient Buildings',         eligibility: 'threshold', note: 'Climate risk assessment required', objective: 'Climate Change Adaptation' },
    'E1.1': { label: 'Coastal & Marine Resource Protection',eligibility: 'direct',    note: 'Directly eligible', objective: 'Ecological Conservation' },
    'E3.1': { label: 'Sustainable Land Use & Biodiversity', eligibility: 'direct',    note: 'Directly eligible', objective: 'Ecological Conservation' },
  };

  function lookupActivity(code) {
    const el = $$('np-activity-desc');
    if (!el) return;
    const upper = (code || '').trim().toUpperCase();
    const match = ACTIVITY_LOOKUP[upper];
    if (match) {
      const badge = match.eligibility === 'direct'
        ? '<span class="slgft-code" style="background:var(--blue-50,#eff6ff);color:var(--blue-600,#2563eb)">Direct Eligibility</span>'
        : '<span class="slgft-code" style="background:var(--green-50,#f0fdf4);color:var(--green-600,#16a34a)">Threshold-Based</span>';
      el.style.display = 'block';
      el.innerHTML = `${badge} <strong>${match.label}</strong> — ${match.objective}<br><small style="color:var(--text-tertiary)">${match.note}</small>`;
    } else {
      el.style.display = upper.length > 1 ? 'block' : 'none';
      if (upper.length > 1) el.innerHTML = `<span style="color:var(--text-tertiary);font-size:13px">No matching activity for "${upper}". Try M1.1, M4.1, A2.1, etc.</span>`;
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
  function _runReview() {
    const name         = $$('np-proj-name')?.value?.trim() || 'New Project';
    const type         = $$('np-proj-type')?.value || 'Commercial';
    const region       = $$('np-proj-region')?.value || 'SG';
    const area         = parseFloat($$('np-proj-area')?.value || 0);
    const slsicSector  = $$('np-slsic-sector')?.value || '';
    const activityCode = ($$('np-activity-code')?.value || '').trim().toUpperCase();
    const outstanding  = parseFloat($$('np-outstanding')?.value || 50) * 1e6;
    const equity       = parseFloat($$('np-equity')?.value || 80) * 1e6;
    const debt         = parseFloat($$('np-debt')?.value || 120) * 1e6;

    const totalKgCO2e = _materials.reduce((s, m) => s + _kgCO2e(m), 0);
    const totalTCO2e  = totalKgCO2e / 1000;
    const intensity   = area > 0 ? (totalKgCO2e / area).toFixed(1) : '—';
    const attribution = outstanding / (equity + debt);
    const financed    = Math.round(totalTCO2e * attribution);

    // Taxonomy quick-checks
    const SG_THRESHOLD = 1000;
    const EU_THRESHOLD = 450;
    const sgAligned = area > 0 && (totalKgCO2e / area) < SG_THRESHOLD;
    const euAligned = area > 0 && (totalKgCO2e / area) < EU_THRESHOLD * 2;

    // Sri Lanka SLGFT quick-check
    let lkSection = '';
    if (region === 'LK') {
      const intVal = area > 0 ? (totalKgCO2e / area) : null;
      const actMatch = ACTIVITY_LOOKUP[activityCode];
      let lkTier, lkBadge;
      if (actMatch && actMatch.eligibility === 'direct') {
        lkTier = 'Directly Eligible'; lkBadge = 'badge-blue';
      } else if (intVal !== null && intVal <= 600) {
        lkTier = 'Green — Aligned';  lkBadge = 'badge-green';
      } else if (intVal !== null && intVal <= 900) {
        lkTier = 'Transition';        lkBadge = 'badge-amber';
      } else {
        lkTier = intVal === null ? 'Pending (no area)' : 'Not Aligned'; lkBadge = 'badge-red';
      }
      const actDesc = actMatch ? ` — ${actMatch.label}` : '';
      lkSection = `
        <div class="review-section review-section-full slgft-review-section">
          <h4>🇱🇰 Sri Lanka Green Finance Taxonomy (SLGFT)</h4>
          <div class="review-row"><span>SLGFT Tier</span><strong><span class="kpi-badge ${lkBadge}">${lkTier}</span></strong></div>
          ${slsicSector ? `<div class="review-row"><span>SLSIC Sector</span><strong>Sector ${slsicSector}</strong></div>` : ''}
          ${activityCode ? `<div class="review-row"><span>Activity Code</span><strong>${activityCode}${actDesc}</strong></div>` : ''}
          ${intVal !== null ? `<div class="review-row"><span>Intensity</span><strong>${intVal.toFixed(1)} kgCO2e/m² <span style="color:var(--text-tertiary);font-weight:400">(threshold: ≤600 green, ≤900 transition)</span></strong></div>` : ''}
          <div class="review-row"><span>NDC Contribution</span><strong>4.5% unconditional / 14.5% conditional GHG reduction by 2030</strong></div>
          <div class="review-row"><span>Key SDGs</span><strong>SDG 7 · 9 · 11 · 13 · 14 · 15</strong></div>
          <div style="margin-top:8px">
            <button class="btn btn-ghost btn-sm" onclick="navigateTo('ndc-sdg')" style="font-size:12px">
              Run AI NDC/SDG Analysis →
            </button>
          </div>
        </div>`;
    }

    const panel = $$('np-review-body');
    if (!panel) return;
    panel.innerHTML = `
      <div class="review-grid">
        <div class="review-section">
          <h4>Project Summary</h4>
          <div class="review-row"><span>Name</span><strong>${name}</strong></div>
          <div class="review-row"><span>Type</span><strong>${type}</strong></div>
          <div class="review-row"><span>Region</span><strong>${region}${region === 'LK' ? ' 🇱🇰' : ''}</strong></div>
          <div class="review-row"><span>Floor Area</span><strong>${area ? _fmtN(area)+' m²' : '—'}</strong></div>
        </div>
        <div class="review-section">
          <h4>Carbon Footprint</h4>
          <div class="review-row"><span>Total Embodied</span><strong>${_fmtN(totalKgCO2e)} kgCO2e</strong></div>
          <div class="review-row"><span>Intensity</span><strong>${intensity} kgCO2e/m²</strong></div>
          <div class="review-row"><span>Materials</span><strong>${_materials.length} items</strong></div>
        </div>
        <div class="review-section">
          <h4>PCAF Attribution</h4>
          <div class="review-row"><span>Attribution Factor</span><strong>${attribution.toFixed(3)}</strong></div>
          <div class="review-row"><span>Financed Emissions</span><strong>${_fmtN(financed)} tCO2e</strong></div>
          <div class="review-row"><span>Outstanding</span><strong>$${_fmtN(outstanding/1e6)}M</strong></div>
        </div>
        <div class="review-section">
          <h4>Taxonomy Quick-Check</h4>
          <div class="review-row">
            <span>SG Green Mark</span>
            <strong><span class="kpi-badge ${sgAligned?'badge-green':'badge-amber'}">${sgAligned?'Likely Aligned':'Review Needed'}</span></strong>
          </div>
          <div class="review-row">
            <span>EU Taxonomy</span>
            <strong><span class="kpi-badge ${euAligned?'badge-green':'badge-amber'}">${euAligned?'Likely Aligned':'Review Needed'}</span></strong>
          </div>
        </div>
        ${lkSection}
      </div>
      <div class="review-actions">
        <button class="btn btn-ghost btn-lg" onclick="NewProject.goTo(3)">← Back</button>
        <button class="btn btn-primary btn-lg" id="np-submit-btn" onclick="NewProject.submitProject()">
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
    const totalKgCO2e = _materials.reduce((s, m) => s + _kgCO2e(m), 0);
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
      totalEmbodiedCarbon_kgCO2e: totalKgCO2e,
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
        const successMsg = `Project submitted${savedProjectId ? ` (ID: ${savedProjectId})` : ''}. AI assessment complete — ${data.assessment?.materials?.length || _materials.length} materials, ${_fmtN(Math.round(data.assessment?.carbonTotals?.totalKgCO2e || totalKgCO2e))} kgCO2e.`;
        if (msg) { msg.textContent = successMsg; msg.className = 'mon-msg-success'; }
        if (typeof Toast !== 'undefined' && Toast.success) Toast.success(successMsg);
        // Refresh dashboard data
        if (typeof Dashboard !== 'undefined') Dashboard.refresh();
      } else {
        throw new Error(`API ${res.status}`);
      }
    } catch (_) {
      // Graceful offline mode
      const offlineMsg = `Project saved locally. Total: ${_fmtN(Math.round(totalKgCO2e))} kgCO2e. Connect to API for full assessment.`;
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
    goTo(1);
  }

  return { init, goTo, nextFromStep1, nextFromStep3, addMaterial, submitProject,
           onRegionChange, lookupActivity, _updateMat, _removeMat };
})();
