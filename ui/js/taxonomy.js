// @ts-check
/* ============================================================
   CarbonIQ — Taxonomy Alignment Module
   ============================================================
   Places a project's embodied carbon intensity against the five
   frameworks the API screens — manual input, a live project's
   own figure, or one the sample book states.
   ============================================================ */

const Taxonomy = (() => {
  /*
   * No tier table lives here. The five frameworks, their bands and what
   * each band is come from `GET /v1/taxonomy/frameworks`, and an intensity is
   * placed against them by `POST /v1/taxonomy/screen`, which returns the tier,
   * the threshold and the bar geometry for every framework and the count
   * aligned. The table used to be a constant in this file, published to every
   * browser, and the wizard beside it had grown a second, different one.
   */
  const TIER_CLS = {
    aligned:    { cls: 'taxonomy-aligned',    statusCls: 'badge-green', icon: 'check' },
    transition: { cls: 'taxonomy-transition', statusCls: 'badge-amber', icon: 'warn' },
    risk:       { cls: 'taxonomy-risk',       statusCls: 'badge-red',   icon: 'cross' },
  };
  const FLAGS = { asean: '🌏', sg: '🇸🇬', hk: '🇭🇰', eu: '🇪🇺', sl: '🇱🇰' };

  const ICON = {
    check: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="9" fill="#10b981"/><path d="M7 11l3 3 5-5" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    warn:  `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="9" fill="#f59e0b"/><path d="M11 7.5v4M11 13.5v.5" stroke="white" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    cross: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="9" fill="#ef4444"/><path d="M8 8l6 6M14 8l-6 6" stroke="white" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  };

  let _projects = null;
  let _currentIntensity = 380;
  let _screenTicket = 0;

  function $$(id) { return document.getElementById(id); }

  const esc = (v) => String(v == null ? '' : v)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ── Render the five framework cards from the engine's answer ──
  async function _renderCards(intensity) {
    const grid = $$('tax-grid');
    if (!grid) return;
    const ticket = ++_screenTicket;
    let answer;
    try {
      const res = await window.CARBONIQ_fetch('/v1/taxonomy/screen', {
        method: 'POST', body: JSON.stringify({ intensity_kgCO2e_m2: intensity }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `The screen was refused (${res.status}).`);
      answer = data;
    } catch (err) {
      if (ticket !== _screenTicket) return;
      grid.innerHTML = `<p class="mon-msg-error">${esc(err instanceof Error ? err.message : String(err))}</p>`;
      return;
    }
    if (ticket !== _screenTicket) return;

    grid.innerHTML = answer.frameworks.map(fw => {
      const look = TIER_CLS[fw.tier] || TIER_CLS.risk;
      return `
        <div class="taxonomy-card ${look.cls}">
          <div class="taxonomy-region">${FLAGS[fw.id] || ''} ${esc(fw.label)}</div>
          <div class="taxonomy-status">
            ${ICON[look.icon]}
            ${esc(fw.tierLabel)}
          </div>
          <div class="taxonomy-detail">
            <span class="taxonomy-threshold">Threshold: ${fw.threshold_kgCO2e_m2} kgCO2e/m²${fw.basis === 'indicative' ? ' (indicative)' : fw.provisional ? ' (provisional)' : ''}</span>
            <span class="taxonomy-actual">Project: ${answer.intensity_kgCO2e_m2} kgCO2e/m²</span>
          </div>
          <div class="taxonomy-bar">
            <div class="taxonomy-bar-fill${look.cls === 'taxonomy-transition' ? ' taxonomy-fill-amber' : look.cls === 'taxonomy-risk' ? ' taxonomy-fill-red' : ''}"
              style="width:${fw.barPct}%"></div>
            <div class="taxonomy-bar-marker" style="left:${fw.barPct}%"></div>
            <div class="taxonomy-bar-limit" style="left:${fw.limitPct}%"></div>
          </div>
          <div class="taxonomy-note">${esc(fw.note)}</div>
        </div>`;
    }).join('');

    // Update summary badge
    const { aligned, total, label } = answer.summary;
    const badge = $$('tax-summary-badge');
    if (badge) {
      badge.textContent = label;
      badge.className = 'kpi-badge ' + (aligned === total ? 'badge-green' : aligned >= 2 ? 'badge-amber' : 'badge-red');
    }
  }

  // ── Load projects for selector ────────────────────────────
  /**
   * The portfolio's top contributors, or the sample book's where the
   * portfolio is empty — the sample carries an intensity per project so a
   * visitor can pick one; a live project's intensity is read from its own
   * taxonomy route.
   */
  async function _loadProjects() {
    if (_projects) return _projects;
    const manual = { id: 'custom', name: '— Enter intensity manually —', intensity: null };
    try {
      const res = await window.CARBONIQ_fetch('/v1/portfolio');
      if (res.ok) {
        const data = await res.json();
        if (data.topContributors?.length) {
          _projects = [manual, ...data.topContributors.map(p => ({ id: p.projectId, name: p.name || p.projectId, intensity: null }))];
          return _projects;
        }
      }
    } catch (_) {}
    try {
      const res = await window.CARBONIQ_fetch('/v1/portfolio/sample');
      if (res.ok) {
        const data = await res.json();
        _projects = [manual, ...(data.topContributors || []).map(p => ({
          id: p.projectId, name: p.name || p.projectId,
          intensity: typeof p.intensity_kgCO2e_m2 === 'number' ? p.intensity_kgCO2e_m2 : null,
        }))];
        return _projects;
      }
    } catch (_) {}
    _projects = [manual];
    return _projects;
  }

  // ── Fetch project taxonomy data ───────────────────────────
  async function selectProject(projectId) {
    const manualWrap = $$('tax-manual-wrap');
    if (projectId === 'custom') {
      if (manualWrap) manualWrap.style.display = 'block';
      return;
    }
    if (manualWrap) manualWrap.style.display = 'none';

    const setAndDraw = (intensity) => {
      _currentIntensity = Math.round(intensity);
      const inp = /** @type {HTMLInputElement|null} */ ($$('tax-intensity-input'));
      if (inp) inp.value = String(_currentIntensity);
      void _renderCards(_currentIntensity);
    };

    // A live project: its own taxonomy route
    try {
      const res = await window.CARBONIQ_fetch(`/v1/projects/${encodeURIComponent(projectId)}/taxonomy`);
      if (res.ok) {
        const data = await res.json();
        const intensity = data.emissionsIntensity_kgCO2e_m2
          || data.projectMetrics?.intensity_kgCO2e_m2
          || null;
        if (intensity) { setAndDraw(intensity); return; }
      }
    } catch (_) {}

    // A sample project: the intensity the sample book states for it
    const sample = (_projects || []).find(p => p.id === projectId);
    if (sample && typeof sample.intensity === 'number') setAndDraw(sample.intensity);
  }

  // ── Manual intensity change ───────────────────────────────
  function updateIntensity(value) {
    const n = parseFloat(value);
    if (!isNaN(n) && n > 0) {
      _currentIntensity = Math.round(n);
      void _renderCards(_currentIntensity);
    }
  }

  // ── Public init ───────────────────────────────────────────
  let _initialized = false;

  async function init() {
    if (_initialized) return;
    _initialized = true;

    const projects = await _loadProjects();
    const sel = $$('tax-project-select');
    if (sel) {
      sel.innerHTML = projects.map(p =>
        `<option value="${p.id}">${p.name}</option>`
      ).join('');
      sel.addEventListener('change', (e) =>
        selectProject(/** @type {HTMLSelectElement} */ (e.target).value));
    }

    // Set initial intensity input
    const inp = /** @type {HTMLInputElement|null} */ ($$('tax-intensity-input'));
    if (inp) inp.value = String(_currentIntensity);

    void _renderCards(_currentIntensity);
  }

  return { init, selectProject, updateIntensity };
})();
