/* ============================================================
   CarbonIQ — Taxonomy Alignment Module
   ============================================================
   Checks a project's embodied carbon intensity against 4
   regional green taxonomy frameworks. Accepts manual input
   OR pulls live data from /v1/projects/:id/taxonomy.
   ============================================================ */

const Taxonomy = (() => {
  // Real thresholds from config/constants.js
  const FRAMEWORKS = [
    {
      id: 'asean',
      label: 'ASEAN Taxonomy v3',
      flag: '🌏',
      tiers: [
        { label: 'Green (Tier 1)',      max: 500,  cls: 'taxonomy-aligned',    statusCls: 'badge-green',  icon: 'check' },
        { label: 'Transition (Tier 2)', max: 800,  cls: 'taxonomy-transition', statusCls: 'badge-amber',  icon: 'warn'  },
        { label: 'Not Aligned',         max: Infinity, cls: 'taxonomy-risk',   statusCls: 'badge-red',    icon: 'cross' },
      ],
      note: 'ASEAN Taxonomy v3 construction embodied carbon thresholds',
    },
    {
      id: 'sg',
      label: 'SG Green Mark 2021',
      flag: '🇸🇬',
      tiers: [
        { label: 'Certified Green',     max: 480,  cls: 'taxonomy-aligned',    statusCls: 'badge-green',  icon: 'check' },
        { label: 'Near Threshold',      max: 700,  cls: 'taxonomy-transition', statusCls: 'badge-amber',  icon: 'warn'  },
        { label: 'Not Aligned',         max: Infinity, cls: 'taxonomy-risk',   statusCls: 'badge-red',    icon: 'cross' },
      ],
      note: 'BCA Green Mark 2021 — SG Green Plan 2030 embodied carbon benchmark',
    },
    {
      id: 'hk',
      label: 'HK Green Finance 2024',
      flag: '🇭🇰',
      tiers: [
        { label: 'Dark Green',          max: 450,  cls: 'taxonomy-aligned',    statusCls: 'badge-green',  icon: 'check' },
        { label: 'Light Green',         max: 650,  cls: 'taxonomy-transition', statusCls: 'badge-amber',  icon: 'warn'  },
        { label: 'Not Aligned',         max: Infinity, cls: 'taxonomy-risk',   statusCls: 'badge-red',    icon: 'cross' },
      ],
      note: 'HKMA Green Classification Framework 2024 construction thresholds',
    },
    {
      id: 'eu',
      label: 'EU Taxonomy 2024',
      flag: '🇪🇺',
      tiers: [
        { label: 'Aligned',             max: 500,  cls: 'taxonomy-aligned',    statusCls: 'badge-green',  icon: 'check' },
        { label: 'Near Threshold',      max: 750,  cls: 'taxonomy-transition', statusCls: 'badge-amber',  icon: 'warn'  },
        { label: 'Not Aligned',         max: Infinity, cls: 'taxonomy-risk',   statusCls: 'badge-red',    icon: 'cross' },
      ],
      note: 'EU Taxonomy Climate Delegated Act — embodied carbon proxy for construction',
    },
    {
      id: 'sl',
      label: 'Sri Lanka SLGFT / CBSL',
      flag: '🇱🇰',
      tiers: [
        { label: 'Green (CBSL Compliant)',  max: 520,  cls: 'taxonomy-aligned',    statusCls: 'badge-green',  icon: 'check' },
        { label: 'Transition',              max: 780,  cls: 'taxonomy-transition', statusCls: 'badge-amber',  icon: 'warn'  },
        { label: 'Not Aligned',             max: Infinity, cls: 'taxonomy-risk',   statusCls: 'badge-red',    icon: 'cross' },
      ],
      note: 'CBSL Direction No. 05/2022 · SLFRS S2 · Sri Lanka Green Finance Taxonomy — construction embodied carbon thresholds',
    },
  ];

  const ICON = {
    check: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="9" fill="#10b981"/><path d="M7 11l3 3 5-5" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    warn:  `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="9" fill="#f59e0b"/><path d="M11 7.5v4M11 13.5v.5" stroke="white" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    cross: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="9" fill="#ef4444"/><path d="M8 8l6 6M14 8l-6 6" stroke="white" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  };

  // Demo projects for selector
  const DEMO_PROJECTS = [
    { id: 'custom',      name: '— Enter intensity manually —', intensity: null },
    { id: 'SG-2024-001', name: 'Marina Bay Tower',             intensity: 380  },
    { id: 'SG-2024-017', name: 'Orchard Green Residences',     intensity: 290  },
    { id: 'MY-2024-003', name: 'KL Eco Residences',            intensity: 415  },
    { id: 'HK-2024-008', name: 'Kowloon Gateway',              intensity: 620  },
    { id: 'SG-2025-003', name: 'Jurong Data Centre',           intensity: 810  },
    { id: 'SL-2025-001', name: 'Colombo Green Tower',          intensity: 460  },
  ];

  let _projects = null;
  let _currentIntensity = 380;

  function $$(id) { return document.getElementById(id); }

  // ── Classify intensity against a framework ─────────────────
  function _classify(fw, intensity) {
    for (const tier of fw.tiers) {
      if (intensity <= tier.max) return tier;
    }
    return fw.tiers[fw.tiers.length - 1];
  }

  // ── Render all 4 taxonomy cards ───────────────────────────
  function _renderCards(intensity) {
    const grid = $$('tax-grid');
    if (!grid) return;
    const maxThreshold = 1000; // bar scale cap

    grid.innerHTML = FRAMEWORKS.map(fw => {
      const tier = _classify(fw, intensity);
      const nextThreshold = fw.tiers.find(t => t.max !== Infinity)?.max ?? 500;
      const topThreshold  = fw.tiers[fw.tiers.length - 2]?.max ?? nextThreshold;
      const barPct = Math.min(Math.round((intensity / maxThreshold) * 100), 100);
      const limitPct = Math.min(Math.round((nextThreshold / maxThreshold) * 100), 100);

      return `
        <div class="taxonomy-card ${tier.cls}">
          <div class="taxonomy-region">${fw.flag} ${fw.label}</div>
          <div class="taxonomy-status">
            ${ICON[tier.icon]}
            ${tier.label}
          </div>
          <div class="taxonomy-detail">
            <span class="taxonomy-threshold">Threshold: ${nextThreshold} kgCO2e/m²</span>
            <span class="taxonomy-actual">Project: ${intensity} kgCO2e/m²</span>
          </div>
          <div class="taxonomy-bar">
            <div class="taxonomy-bar-fill${tier.cls === 'taxonomy-transition' ? ' taxonomy-fill-amber' : tier.cls === 'taxonomy-risk' ? ' taxonomy-fill-red' : ''}"
              style="width:${barPct}%"></div>
            <div class="taxonomy-bar-marker" style="left:${barPct}%"></div>
            <div class="taxonomy-bar-limit" style="left:${limitPct}%"></div>
          </div>
          <div class="taxonomy-note">${fw.note}</div>
        </div>`;
    }).join('');

    // Update summary badge
    const aligned = FRAMEWORKS.filter(fw => _classify(fw, intensity).icon === 'check').length;
    const total = FRAMEWORKS.length;
    const badge = $$('tax-summary-badge');
    if (badge) {
      badge.textContent = `${aligned} / ${total} frameworks aligned`;
      badge.className = 'kpi-badge ' + (aligned === total ? 'badge-green' : aligned >= 2 ? 'badge-amber' : 'badge-red');
    }
  }

  // ── Load projects for selector ────────────────────────────
  async function _loadProjects() {
    if (_projects) return _projects;
    try {
      const res = await window.CARBONIQ_fetch('/v1/portfolio');
      if (res.ok) {
        const data = await res.json();
        if (data.topContributors?.length) {
          _projects = [
            { id: 'custom', name: '— Enter intensity manually —', intensity: null },
            ...data.topContributors.map(p => ({
              id: p.projectId,
              name: p.name || p.projectId,
              intensity: null, // will fetch on demand
            })),
          ];
          return _projects;
        }
      }
    } catch (_) {}
    _projects = DEMO_PROJECTS;
    return _projects;
  }

  // ── Fetch project taxonomy data ───────────────────────────
  async function selectProject(projectId) {
    if (projectId === 'custom') {
      const manualWrap = $$('tax-manual-wrap');
      if (manualWrap) manualWrap.style.display = 'block';
      return;
    }
    const manualWrap = $$('tax-manual-wrap');
    if (manualWrap) manualWrap.style.display = 'none';

    // Try API first
    try {
      const res = await window.CARBONIQ_fetch(`/v1/projects/${projectId}/taxonomy`);
      if (res.ok) {
        const data = await res.json();
        const intensity = data.emissionsIntensity_kgCO2e_m2
          || data.projectMetrics?.intensity_kgCO2e_m2
          || null;
        if (intensity) {
          _currentIntensity = Math.round(intensity);
          const inp = $$('tax-intensity-input');
          if (inp) inp.value = _currentIntensity;
          _renderCards(_currentIntensity);
          return;
        }
      }
    } catch (_) {}

    // Fall back to demo value
    const demo = DEMO_PROJECTS.find(p => p.id === projectId);
    if (demo?.intensity) {
      _currentIntensity = demo.intensity;
      const inp = $$('tax-intensity-input');
      if (inp) inp.value = _currentIntensity;
      _renderCards(_currentIntensity);
    }
  }

  // ── Manual intensity change ───────────────────────────────
  function updateIntensity(value) {
    const n = parseFloat(value);
    if (!isNaN(n) && n > 0) {
      _currentIntensity = Math.round(n);
      _renderCards(_currentIntensity);
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
      sel.addEventListener('change', (e) => selectProject(e.target.value));
    }

    // Set initial intensity input
    const inp = $$('tax-intensity-input');
    if (inp) inp.value = _currentIntensity;

    _renderCards(_currentIntensity);
  }

  return { init, selectProject, updateIntensity };
})();
