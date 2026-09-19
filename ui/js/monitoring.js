/* ============================================================
   CarbonIQ — Monitoring Page Module
   ============================================================
   Fetches project PCAF data, renders annual attribution history,
   KPI comparison, and allows submitting annual update forms.
   ============================================================ */

const Monitoring = (() => {
  /*
   * No arithmetic and no sample lives here. The series, each year's
   * attribution and financed figure, the timeline bar lengths and the
   * year-on-year comparison — the emissions movement, the data-quality trend
   * and the PCAF fluctuation analysis — are what
   * `GET /v1/projects/:id/monitoring` returns; where a project has no
   * recorded entry it answers the illustrative series and says so
   * (`source: sample`). The project list comes from the portfolio, or from
   * the sample book the API serves when the portfolio is empty.
   */

  let _projects = null;
  let _currentId = null;
  let _history = null;

  // ── Helpers ───────────────────────────────────────────────
  function $$(id) { return document.getElementById(id); }
  function _fmtM(n) { return window.CARBONIQ_money.moneyShort(n, 'USD'); }
  function _fmtN(n) { return Number(n).toLocaleString('en-US'); }

  // ── Fetch project list ────────────────────────────────────
  async function _loadProjects() {
    if (_projects) return _projects;
    const fromContributors = (data) => (data.topContributors || []).map(p => ({
      id: p.projectId,
      name: p.name || p.projectId,
      region: p.region || p.projectId.slice(0, 2),
    }));
    try {
      const res = await window.CARBONIQ_fetch('/v1/portfolio');
      if (res.ok) {
        const data = await res.json();
        if (data.topContributors && data.topContributors.length > 0) {
          _projects = fromContributors(data);
          return _projects;
        }
      }
    } catch (_) {}
    try {
      const res = await window.CARBONIQ_fetch('/v1/portfolio/sample');
      if (res.ok) {
        _projects = fromContributors(await res.json());
        if (_projects.length) return _projects;
      }
    } catch (_) {}
    _projects = [];
    return _projects;
  }

  // ── Fetch project history ─────────────────────────────────
  async function _loadHistory(projectId) {
    const res = await window.CARBONIQ_fetch(`/v1/projects/${encodeURIComponent(projectId)}/monitoring`);
    if (!res.ok) throw new Error(`The monitoring history could not be read (${res.status}).`);
    return res.json();
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
    wrap.innerHTML = history.map(h => `
      <div class="tl-row${h.current ? ' highlight' : ''}">
        <div class="tl-year">${h.year}</div>
        <div class="tl-bar-area">
          <div class="tl-bar${h.current ? ' tl-current' : ''}" style="width:${h.timelineBarPct}%">
            <span>${h.attribution.toFixed(2)}</span>
          </div>
        </div>
        <div class="tl-detail">${_fmtM(h.outstanding)} / ${_fmtM(h.totalValue)}</div>
      </div>
    `).join('');
  }

  // ── Render KPI cards ──────────────────────────────────────
  function _renderKPIs(comparison) {
    const emEl = $$('mon-kpi-em');
    const dqEl = $$('mon-kpi-dq');
    const flEl = $$('mon-kpi-fluct');
    if (!comparison) {
      const one = '<div class="kpi-secondary">One year recorded — a comparison needs two.</div>';
      if (emEl) emEl.innerHTML = one;
      if (dqEl) dqEl.innerHTML = one;
      if (flEl) flEl.innerHTML = one;
      return;
    }
    const c = comparison;

    // Emissions vs last year
    if (emEl) {
      const chg = c.financed.changePct;
      const sign = chg === null || chg < 0 ? '' : '+';
      emEl.innerHTML = `
        <div class="kpi-value ${chg !== null && chg < 0 ? 'kpi-value-green' : 'kpi-value-red'}">${chg === null ? '—' : `${sign}${chg}%`}</div>
        <div class="kpi-secondary">${_fmtN(c.financed.current)} vs ${_fmtN(c.financed.previous)} tCO2e</div>
      `;
    }

    // DQ trend
    if (dqEl) {
      const improving = c.dataQuality.trend === 'improving';
      const arrow = improving
        ? `<svg width="20" height="14" viewBox="0 0 20 14"><path d="M2 7h16M14 2l4 5-4 5" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
        : `<svg width="20" height="14" viewBox="0 0 20 14"><path d="M2 7h16M14 2l4 5-4 5" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      const label = { improving: 'Improving', weakening: 'Weakening', stable: 'Stable' }[c.dataQuality.trend] || 'Not scored';
      dqEl.innerHTML = `
        <div class="dq-trend">
          <span class="dq-badge dq-${c.dataQuality.previous}">${c.dataQuality.previous ?? '—'}</span>
          ${arrow}
          <span class="dq-badge dq-${c.dataQuality.current}">${c.dataQuality.current ?? '—'}</span>
        </div>
        <div class="kpi-secondary">${label} over ${c.dataQuality.years} years</div>
      `;
    }

    // Fluctuation analysis (PCAF Part A)
    if (flEl) {
      const f = c.fluctuation;
      const sign = (n) => n < 0 ? '' : '+';
      const cls  = (n) => n < 0 ? 'fluct-neg' : 'fluct-pos';
      flEl.innerHTML = `
        <div class="fluctuation-breakdown">
          <div class="fluct-row">
            <span>Attribution change</span>
            <span class="fluct-val ${cls(f.attributionEffect_tCO2e)}">${sign(f.attributionEffect_tCO2e)}${_fmtN(f.attributionEffect_tCO2e)} tCO2e</span>
          </div>
          <div class="fluct-row">
            <span>Emissions change</span>
            <span class="fluct-val ${cls(f.emissionsEffect_tCO2e)}">${sign(f.emissionsEffect_tCO2e)}${_fmtN(f.emissionsEffect_tCO2e)} tCO2e</span>
          </div>
          <div class="fluct-row fluct-total">
            <span>Net change</span>
            <span class="fluct-val ${cls(f.net_tCO2e)}">${sign(f.net_tCO2e)}${_fmtN(f.net_tCO2e)} tCO2e</span>
          </div>
        </div>
      `;
    }
  }

  /** Which series this is — recorded, or the illustrative one — said on the page. */
  function _renderSource(data) {
    const el = $$('mon-source');
    if (!el) return;
    el.hidden = data.source !== 'sample';
    el.textContent = data.source === 'sample' ? 'Illustrative dataset — not client records.' : '';
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
        <td><span class="dq-badge dq-${h.dq}">${h.dq ?? '—'}</span></td>
      </tr>
    `).join('');
  }

  // ── Load a project ────────────────────────────────────────
  async function loadProject(projectId) {
    _currentId = projectId;
    const loader = $$('mon-loading');
    try {
      const data = await _loadHistory(projectId);
      _history = data.entries;
      _renderSource(data);
      _renderTimeline(data.entries);
      _renderKPIs(data.comparison);
      _renderTable(data.entries);
    } catch (err) {
      const tbody = $$('mon-tbody');
      if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="mon-msg-error">${String(err instanceof Error ? err.message : err).replace(/[<>&]/g, '')}</td></tr>`;
    }
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

    // The entry is priced where it is recorded; the screen re-reads the series.
    const msg = $$('mon-modal-msg');
    try {
      const res = await window.CARBONIQ_fetch(`/v1/projects/${encodeURIComponent(_currentId)}/monitoring`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, outstanding, equity, debt, emissions, dq }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = data.message || `The update was refused (${res.status}).`;
        if (msg) { msg.textContent = errMsg; msg.className = 'mon-msg-error'; }
        return;
      }
      const successMsg = `Annual update recorded. Attribution factor: ${Number(data.attribution).toFixed(3)}, Financed emissions: ${_fmtN(data.financed)} tCO2e`;
      if (msg) { msg.textContent = successMsg; msg.className = 'mon-msg-success'; }
      if (typeof Toast !== 'undefined' && Toast.success) Toast.success(successMsg);
      await loadProject(_currentId);
    } catch (err) {
      const offlineMsg = err instanceof Error ? err.message : String(err);
      if (msg) { msg.textContent = offlineMsg; msg.className = 'mon-msg-error'; }
      return;
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
      if (sel.value || projects[0]?.id) await loadProject(sel.value || projects[0].id);
      else { const loader2 = $$('mon-loading'); if (loader2) loader2.style.display = 'none'; }
    }
  }

  return { init, loadProject, showUpdateModal, closeModal, submitUpdate };
})();
