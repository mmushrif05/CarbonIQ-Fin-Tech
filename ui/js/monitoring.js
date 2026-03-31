/* ============================================================
   CarbonIQ — Monitoring Page Module
   ============================================================
   Fetches project PCAF data, renders annual attribution history,
   KPI comparison, and allows submitting annual update forms.
   ============================================================ */

const Monitoring = (() => {
  // Demo projects list (used when API unavailable)
  const DEMO_PROJECTS = [
    { id: 'SG-2024-001', name: 'Marina Bay Tower',          region: 'SG' },
    { id: 'SG-2024-017', name: 'Orchard Green Residences',  region: 'SG' },
    { id: 'SG-2025-003', name: 'Jurong Data Centre',        region: 'SG' },
    { id: 'MY-2024-003', name: 'KL Eco Residences',         region: 'MY' },
    { id: 'HK-2024-008', name: 'Kowloon Gateway',           region: 'HK' },
  ];

  // Demo history keyed by projectId
  const DEMO_HISTORY = {
    default: [
      { year: 2024, outstanding: 62e6, equity: 80e6, debt: 120e6, attribution: 0.31, emissions: 10500, financed: 3255, dq: 4 },
      { year: 2025, outstanding: 56e6, equity: 80e6, debt: 120e6, attribution: 0.28, emissions: 10180, financed: 2850, dq: 3 },
      { year: 2026, outstanding: 50e6, equity: 80e6, debt: 120e6, attribution: 0.25, emissions: 10000, financed: 2500, dq: 2, current: true },
    ],
  };

  let _projects = null;
  let _currentId = null;
  let _history = null;

  // ── Helpers ───────────────────────────────────────────────
  function $$(id) { return document.getElementById(id); }
  function _fmtM(n) { return n >= 1e9 ? `$${(n/1e9).toFixed(2)}B` : `$${(n/1e6).toFixed(1)}M`; }
  function _fmtN(n) { return Number(n).toLocaleString('en-US'); }

  // ── Fetch project list ────────────────────────────────────
  async function _loadProjects() {
    if (_projects) return _projects;
    try {
      // Try to get projects from portfolio API
      const res = await window.CARBONIQ_fetch('/v1/portfolio');
      if (res.ok) {
        const data = await res.json();
        if (data.topContributors && data.topContributors.length > 0) {
          _projects = data.topContributors.map(p => ({
            id: p.projectId,
            name: p.name || p.projectId,
            region: p.projectId.slice(0, 2),
          }));
          return _projects;
        }
      }
    } catch (_) {}
    _projects = DEMO_PROJECTS;
    return _projects;
  }

  // ── Fetch project history ─────────────────────────────────
  async function _loadHistory(projectId) {
    // First try GET /v1/projects/:projectId/monitoring for persisted entries
    try {
      const res = await window.CARBONIQ_fetch(`/v1/projects/${projectId}/monitoring`);
      if (res.ok) {
        const data = await res.json();
        if (data.entries && data.entries.length > 0) {
          return data.entries;
        }
      }
    } catch (_) {}
    // Fall back to PCAF history
    try {
      const res = await window.CARBONIQ_fetch(`/v1/projects/${projectId}/pcaf`);
      if (res.ok) {
        const data = await res.json();
        // If API returns pcaf history array, use it
        if (data.annualHistory && data.annualHistory.length > 0) {
          return data.annualHistory;
        }
      }
    } catch (_) {}
    return DEMO_HISTORY[projectId] || DEMO_HISTORY.default;
  }

  // ── Build project selector ────────────────────────────────
  function _buildSelector(projects) {
    const sel = $$('mon-project-select');
    if (!sel) return;
    sel.innerHTML = projects.map(p =>
      `<option value="${p.id}">${p.name} — ${p.id}</option>`
    ).join('');
    sel.value = projects[0]?.id || '';
  }

  // ── Render timeline chart ─────────────────────────────────
  function _renderTimeline(history) {
    const wrap = $$('mon-timeline');
    if (!wrap) return;
    const maxAttr = Math.max(...history.map(h => h.attribution));
    wrap.innerHTML = history.map(h => `
      <div class="tl-row${h.current ? ' highlight' : ''}">
        <div class="tl-year">${h.year}</div>
        <div class="tl-bar-area">
          <div class="tl-bar${h.current ? ' tl-current' : ''}" style="width:${Math.round((h.attribution/maxAttr)*100)}%">
            <span>${h.attribution.toFixed(2)}</span>
          </div>
        </div>
        <div class="tl-detail">${_fmtM(h.outstanding)} / ${_fmtM(h.equity + h.debt)}</div>
      </div>
    `).join('');
  }

  // ── Render KPI cards ──────────────────────────────────────
  function _renderKPIs(history) {
    if (history.length < 2) return;
    const cur  = history[history.length - 1];
    const prev = history[history.length - 2];

    // Emissions vs last year
    const emChg = ((cur.financed - prev.financed) / prev.financed * 100).toFixed(1);
    const emSign = emChg < 0 ? '' : '+';
    const emEl = $$('mon-kpi-em');
    if (emEl) {
      emEl.innerHTML = `
        <div class="kpi-value ${emChg < 0 ? 'kpi-value-green' : 'kpi-value-red'}">${emSign}${emChg}%</div>
        <div class="kpi-secondary">${_fmtN(cur.financed)} vs ${_fmtN(prev.financed)} tCO2e</div>
      `;
    }

    // DQ trend
    const dqEl = $$('mon-kpi-dq');
    if (dqEl) {
      const improving = cur.dq < prev.dq;
      const arrow = improving
        ? `<svg width="20" height="14" viewBox="0 0 20 14"><path d="M2 7h16M14 2l4 5-4 5" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
        : `<svg width="20" height="14" viewBox="0 0 20 14"><path d="M2 7h16M14 2l4 5-4 5" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      dqEl.innerHTML = `
        <div class="dq-trend">
          <span class="dq-badge dq-${prev.dq}">${prev.dq}</span>
          ${arrow}
          <span class="dq-badge dq-${cur.dq}">${cur.dq}</span>
        </div>
        <div class="kpi-secondary">${improving ? 'Improving' : 'Stable'} over ${history.length} years</div>
      `;
    }

    // Fluctuation analysis (PCAF v3)
    const attrChg  = Math.round((cur.attribution - prev.attribution) * prev.emissions);
    const emissChg = Math.round((cur.emissions - prev.emissions) * cur.attribution);
    const netChg   = attrChg + emissChg;
    const flEl = $$('mon-kpi-fluct');
    if (flEl) {
      const sign = (n) => n < 0 ? '' : '+';
      const cls  = (n) => n < 0 ? 'fluct-neg' : 'fluct-pos';
      flEl.innerHTML = `
        <div class="fluctuation-breakdown">
          <div class="fluct-row">
            <span>Attribution change</span>
            <span class="fluct-val ${cls(attrChg)}">${sign(attrChg)}${_fmtN(attrChg)} tCO2e</span>
          </div>
          <div class="fluct-row">
            <span>Emissions change</span>
            <span class="fluct-val ${cls(emissChg)}">${sign(emissChg)}${_fmtN(emissChg)} tCO2e</span>
          </div>
          <div class="fluct-row fluct-total">
            <span>Net change</span>
            <span class="fluct-val ${cls(netChg)}">${sign(netChg)}${_fmtN(netChg)} tCO2e</span>
          </div>
        </div>
      `;
    }
  }

  // ── Render history table ──────────────────────────────────
  function _renderTable(history) {
    const tbody = $$('mon-tbody');
    if (!tbody) return;
    tbody.innerHTML = [...history].reverse().map(h => `
      <tr>
        <td><strong>${h.year}</strong>${h.current ? ' <span class="cell-tag">Current</span>' : ''}</td>
        <td>${_fmtM(h.outstanding)}</td>
        <td>${_fmtM(h.equity)}</td>
        <td>${_fmtM(h.debt)}</td>
        <td>${h.attribution.toFixed(2)}</td>
        <td>${_fmtN(h.emissions)} tCO2e</td>
        <td>${_fmtN(h.financed)} tCO2e</td>
        <td><span class="dq-badge dq-${h.dq}">${h.dq}</span></td>
      </tr>
    `).join('');
  }

  // ── Load a project ────────────────────────────────────────
  async function loadProject(projectId) {
    _currentId = projectId;
    _history = await _loadHistory(projectId);
    _renderTimeline(_history);
    _renderKPIs(_history);
    _renderTable(_history);
    const loader = $$('mon-loading');
    if (loader) loader.style.display = 'none';
  }

  // ── Annual Update Modal ───────────────────────────────────
  function showUpdateModal() {
    const modal = $$('mon-modal');
    if (modal) modal.style.display = 'flex';
  }

  function closeModal() {
    const modal = $$('mon-modal');
    if (modal) modal.style.display = 'none';
    const msg = $$('mon-modal-msg');
    if (msg) msg.textContent = '';
  }

  async function submitUpdate() {
    const outstanding = parseFloat($$('mon-upd-outstanding')?.value || 0) * 1e6;
    const equity      = parseFloat($$('mon-upd-equity')?.value || 0) * 1e6;
    const debt        = parseFloat($$('mon-upd-debt')?.value || 0) * 1e6;
    const emissions   = parseFloat($$('mon-upd-emissions')?.value || 0);
    const dq          = parseInt($$('mon-upd-dq')?.value || 2);
    const year        = new Date().getFullYear();

    if (!outstanding || !equity || !debt || !emissions) {
      const msg = $$('mon-modal-msg');
      if (msg) { msg.textContent = 'Please fill in all fields.'; msg.className = 'mon-msg-error'; }
      return;
    }

    const attribution = outstanding / (equity + debt);
    const financed    = Math.round(emissions * attribution);

    // Add to local history (API submission is fire-and-forget)
    const newRow = { year, outstanding, equity, debt, attribution, emissions, financed, dq, current: true };
    if (_history) {
      _history = _history.map(h => ({ ...h, current: false }));
      _history.push(newRow);
    }
    _renderTimeline(_history);
    _renderKPIs(_history);
    _renderTable(_history);

    const msg = $$('mon-modal-msg');
    if (msg) {
      msg.textContent = `Annual update submitted. Attribution factor: ${attribution.toFixed(3)}, Financed emissions: ${_fmtN(financed)} tCO2e`;
      msg.className = 'mon-msg-success';
    }
    setTimeout(closeModal, 2500);
  }

  // ── Public init ───────────────────────────────────────────
  let _initialized = false;

  async function init() {
    if (_initialized) return;
    _initialized = true;

    const loader = $$('mon-loading');
    if (loader) loader.style.display = 'flex';

    const projects = await _loadProjects();
    _buildSelector(projects);

    const sel = $$('mon-project-select');
    if (sel) {
      sel.addEventListener('change', (e) => loadProject(e.target.value));
      await loadProject(sel.value || projects[0]?.id || 'SG-2024-001');
    }
  }

  return { init, loadProject, showUpdateModal, closeModal, submitUpdate };
})();
