/* ============================================================
   CarbonIQ — Taxonomy Alignment Module
   ============================================================
   Checks a project's embodied carbon intensity against 5
   regional green taxonomy frameworks including Sri Lanka SLGFT.
   Accepts manual input OR pulls live data from the API.
   ============================================================ */

const Taxonomy = (() => {
  // ── 4 international frameworks (intensity-based) ──────────
  const FRAMEWORKS = [
    {
      id: 'asean',
      label: 'ASEAN Taxonomy v3',
      flag: '🌏',
      tiers: [
        { label: 'Green (Tier 1)',      max: 500,      cls: 'taxonomy-aligned',    icon: 'check' },
        { label: 'Transition (Tier 2)', max: 800,      cls: 'taxonomy-transition', icon: 'warn'  },
        { label: 'Not Aligned',         max: Infinity, cls: 'taxonomy-risk',       icon: 'cross' },
      ],
      note: 'ASEAN Taxonomy v3 — construction embodied carbon thresholds (kgCO2e/m²)',
    },
    {
      id: 'sg',
      label: 'SG Green Mark 2021',
      flag: '🇸🇬',
      tiers: [
        { label: 'Certified Green',  max: 480,      cls: 'taxonomy-aligned',    icon: 'check' },
        { label: 'Near Threshold',   max: 700,      cls: 'taxonomy-transition', icon: 'warn'  },
        { label: 'Not Aligned',      max: Infinity, cls: 'taxonomy-risk',       icon: 'cross' },
      ],
      note: 'BCA Green Mark 2021 — SG Green Plan 2030 embodied carbon benchmark',
    },
    {
      id: 'hk',
      label: 'HK Green Finance 2024',
      flag: '🇭🇰',
      tiers: [
        { label: 'Dark Green',  max: 450,      cls: 'taxonomy-aligned',    icon: 'check' },
        { label: 'Light Green', max: 650,      cls: 'taxonomy-transition', icon: 'warn'  },
        { label: 'Not Aligned', max: Infinity, cls: 'taxonomy-risk',       icon: 'cross' },
      ],
      note: 'HKMA Green Classification Framework 2024 construction thresholds',
    },
    {
      id: 'eu',
      label: 'EU Taxonomy 2024',
      flag: '🇪🇺',
      tiers: [
        { label: 'Aligned',         max: 500,      cls: 'taxonomy-aligned',    icon: 'check' },
        { label: 'Near Threshold',  max: 750,      cls: 'taxonomy-transition', icon: 'warn'  },
        { label: 'Not Aligned',     max: Infinity, cls: 'taxonomy-risk',       icon: 'cross' },
      ],
      note: 'EU Taxonomy Climate Delegated Act — embodied carbon proxy for construction',
    },
  ];

  // ── Sri Lanka SLGFT data (mirrors config/constants.js TAXONOMY_LK) ──
  const SLGFT = {
    sectors: [
      { code: 'A', label: 'Agriculture, Forestry & Fishing',                   slsic: 'A 01–03' },
      { code: 'B', label: 'Mining & Quarrying',                                 slsic: 'B 05–09' },
      { code: 'C', label: 'Manufacturing',                                      slsic: 'C 10–33' },
      { code: 'D', label: 'Electricity, Gas, Steam & Air Conditioning Supply',  slsic: 'D 35'    },
      { code: 'E', label: 'Water Supply; Sewerage, Waste Management',           slsic: 'E 36–39' },
      { code: 'F', label: 'Construction',                                       slsic: 'F 41–43' },
      { code: 'G', label: 'Wholesale & Retail Trade',                           slsic: 'G 45–47' },
      { code: 'H', label: 'Transportation & Storage',                           slsic: 'H 49–53' },
      { code: 'I', label: 'Accommodation & Food Service',                       slsic: 'I 55–56' },
      { code: 'J', label: 'Information & Communication',                        slsic: 'J 58–63' },
      { code: 'K', label: 'Financial & Insurance Activities',                   slsic: 'K 64–66' },
      { code: 'L', label: 'Real Estate Activities',                             slsic: 'L 68'    },
      { code: 'M', label: 'Professional, Scientific & Technical Activities',    slsic: 'M 69–75' },
    ],
    objectives: {
      M: 'Climate Change Mitigation',
      A: 'Climate Change Adaptation',
      P: 'Pollution Prevention & Control',
      E: 'Ecological Conservation & Resource Efficiency',
    },
    activities: [
      { code: 'M1.1', label: 'Green Buildings — New Construction',     obj: 'M', eligibility: 'threshold', threshold: 600 },
      { code: 'M1.2', label: 'Green Buildings — Renovation',           obj: 'M', eligibility: 'direct',    note: '≥30% energy performance improvement' },
      { code: 'M4.1', label: 'Solar PV — Electricity Generation',      obj: 'M', eligibility: 'direct' },
      { code: 'M4.2', label: 'Concentrated Solar Power (CSP)',          obj: 'M', eligibility: 'direct' },
      { code: 'M4.3', label: 'Wind Energy',                             obj: 'M', eligibility: 'direct' },
      { code: 'M6.1', label: 'Clean Transportation Infrastructure',     obj: 'M', eligibility: 'direct' },
      { code: 'A2.1', label: 'Flood-Resilient Construction',            obj: 'A', eligibility: 'direct' },
      { code: 'A2.2', label: 'Climate-Resilient Buildings',             obj: 'A', eligibility: 'threshold', threshold: 700 },
      { code: 'E1.1', label: 'Coastal & Marine Resource Protection',    obj: 'E', eligibility: 'direct' },
      { code: 'E3.1', label: 'Sustainable Land Use & Biodiversity',     obj: 'E', eligibility: 'direct' },
    ],
    thresholds: { green: 600, transition: 900 },
    ndcTargets: {
      unconditional: '4.5% GHG reduction by 2030 vs BAU',
      conditional:   '14.5% GHG reduction with international support',
      sdgs: [7, 9, 11, 13, 14, 15],
    },
    guidingPrinciples: [
      'Substantial contribution',
      'Do No Significant Harm (DNSH)',
      "Respect Sri Lanka's green development priorities",
      'Science-based screening',
      'Compatible with international standards & practices',
      'Dynamic adjustment',
    ],
  };

  const ICON = {
    check: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="9" fill="#10b981"/><path d="M7 11l3 3 5-5" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    warn:  `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="9" fill="#f59e0b"/><path d="M11 7.5v4M11 13.5v.5" stroke="white" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    cross: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="9" fill="#ef4444"/><path d="M8 8l6 6M14 8l-6 6" stroke="white" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    direct: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="9" fill="#3b82f6"/><path d="M7 11l3 3 5-5" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  };

  const DEMO_PROJECTS = [
    { id: 'custom',      name: '— Enter intensity manually —', intensity: null },
    { id: 'SG-2024-001', name: 'Marina Bay Tower',             intensity: 380  },
    { id: 'SG-2024-017', name: 'Orchard Green Residences',     intensity: 290  },
    { id: 'MY-2024-003', name: 'KL Eco Residences',            intensity: 415  },
    { id: 'HK-2024-008', name: 'Kowloon Gateway',              intensity: 620  },
    { id: 'LK-2025-001', name: 'Colombo Green Tower (Demo)',   intensity: 540  },
    { id: 'SG-2025-003', name: 'Jurong Data Centre',           intensity: 810  },
  ];

  let _projects       = null;
  let _currentIntensity = 380;
  let _currentActivity  = '';

  function $$(id) { return document.getElementById(id); }

  // ── Classify intensity against an international framework ──
  function _classify(fw, intensity) {
    for (const tier of fw.tiers) {
      if (intensity <= tier.max) return tier;
    }
    return fw.tiers[fw.tiers.length - 1];
  }

  // ── Classify against Sri Lanka SLGFT ─────────────────────
  function _classifyLK(intensity, activityCode) {
    const activity = SLGFT.activities.find(a => a.code === activityCode);
    if (activity && activity.eligibility === 'direct') {
      return { tier: 'direct', label: 'Directly Eligible', icon: 'direct', cls: 'taxonomy-aligned', activity };
    }
    if (intensity <= SLGFT.thresholds.green) {
      return { tier: 'green',      label: 'Green — Aligned',        icon: 'check', cls: 'taxonomy-aligned',    activity };
    }
    if (intensity <= SLGFT.thresholds.transition) {
      return { tier: 'transition', label: 'Transition — Conditional', icon: 'warn', cls: 'taxonomy-transition', activity };
    }
    return { tier: 'not_aligned', label: 'Not Aligned', icon: 'cross', cls: 'taxonomy-risk', activity };
  }

  // ── Render 4 international cards ─────────────────────────
  function _renderCards(intensity) {
    const grid = $$('tax-grid');
    if (!grid) return;
    const maxThreshold = 1000;

    grid.innerHTML = FRAMEWORKS.map(fw => {
      const tier       = _classify(fw, intensity);
      const firstMax   = fw.tiers.find(t => t.max !== Infinity)?.max ?? 500;
      const barPct     = Math.min(Math.round((intensity / maxThreshold) * 100), 100);
      const limitPct   = Math.min(Math.round((firstMax  / maxThreshold) * 100), 100);

      return `
        <div class="taxonomy-card ${tier.cls}">
          <div class="taxonomy-region">${fw.flag} ${fw.label}</div>
          <div class="taxonomy-status">${ICON[tier.icon]} ${tier.label}</div>
          <div class="taxonomy-detail">
            <span class="taxonomy-threshold">Threshold: ${firstMax} kgCO2e/m²</span>
            <span class="taxonomy-actual">Project: ${intensity} kgCO2e/m²</span>
          </div>
          <div class="taxonomy-bar">
            <div class="taxonomy-bar-fill${tier.cls === 'taxonomy-transition' ? ' taxonomy-fill-amber' : tier.cls === 'taxonomy-risk' ? ' taxonomy-fill-red' : ''}" style="width:${barPct}%"></div>
            <div class="taxonomy-bar-marker" style="left:${barPct}%"></div>
            <div class="taxonomy-bar-limit"  style="left:${limitPct}%"></div>
          </div>
          <div class="taxonomy-note">${fw.note}</div>
        </div>`;
    }).join('');

    _renderLKCard(intensity, _currentActivity);
    _updateSummaryBadge(intensity);
  }

  // ── Render Sri Lanka card ─────────────────────────────────
  function _renderLKCard(intensity, activityCode) {
    const card = $$('tax-lk-card');
    if (!card) return;

    const result   = _classifyLK(intensity, activityCode);
    const activity = result.activity;
    const maxThreshold = 1200;
    const barPct   = Math.min(Math.round((intensity / maxThreshold) * 100), 100);
    const limitPct = Math.min(Math.round((SLGFT.thresholds.green / maxThreshold) * 100), 100);
    const objLabel = activity ? (SLGFT.objectives[activity.obj] || '') : '';

    // NDC/SDG pills
    const sdgPills = SLGFT.ndcTargets.sdgs.map(n =>
      `<span class="slgft-sdg-pill">SDG ${n}</span>`
    ).join('');

    // DNSH principles
    const dnshList = SLGFT.guidingPrinciples.map(p =>
      `<li>${p}</li>`
    ).join('');

    card.className = `taxonomy-card ${result.cls} slgft-card`;
    card.innerHTML = `
      <div class="taxonomy-region">🇱🇰 Sri Lanka Green Finance Taxonomy</div>
      <div class="slgft-subtitle">CBSL — SLSIC Classification</div>
      <div class="taxonomy-status">${ICON[result.icon]} ${result.label}</div>

      ${activity ? `
        <div class="slgft-activity-badge">
          <span class="slgft-code">${activity.code}</span>
          <span class="slgft-activity-name">${activity.label}</span>
          ${objLabel ? `<span class="slgft-obj">${objLabel}</span>` : ''}
        </div>` : ''}

      <div class="taxonomy-detail">
        <span class="taxonomy-threshold">Green threshold: ${SLGFT.thresholds.green} kgCO2e/m²</span>
        <span class="taxonomy-actual">Project: ${intensity} kgCO2e/m²</span>
      </div>
      <div class="taxonomy-bar">
        <div class="taxonomy-bar-fill${result.cls === 'taxonomy-transition' ? ' taxonomy-fill-amber' : result.cls === 'taxonomy-risk' ? ' taxonomy-fill-red' : ''}" style="width:${barPct}%"></div>
        <div class="taxonomy-bar-marker" style="left:${barPct}%"></div>
        <div class="taxonomy-bar-limit"  style="left:${limitPct}%"></div>
      </div>

      <div class="slgft-ndc">
        <div class="slgft-section-label">NDC Contribution</div>
        <div class="slgft-ndc-text">${SLGFT.ndcTargets.unconditional}</div>
        <div class="slgft-sdg-row">${sdgPills}</div>
      </div>

      <details class="slgft-dnsh">
        <summary class="slgft-section-label">DNSH Guiding Principles</summary>
        <ul class="slgft-dnsh-list">${dnshList}</ul>
      </details>

      <div class="taxonomy-note">Sri Lanka Green Finance Taxonomy v2024 — CBSL. Activity codes: M=Mitigation, A=Adaptation, P=Pollution, E=Ecological.</div>
    `;
  }

  // ── Update summary badge ──────────────────────────────────
  function _updateSummaryBadge(intensity) {
    const alignedIntl = FRAMEWORKS.filter(fw => _classify(fw, intensity).icon === 'check').length;
    const lkResult    = _classifyLK(intensity, _currentActivity);
    const lkAligned   = lkResult.icon === 'check' || lkResult.icon === 'direct' ? 1 : 0;
    const total       = alignedIntl + lkAligned;

    const badge = $$('tax-summary-badge');
    if (badge) {
      badge.textContent = `${total} / 5 frameworks aligned`;
      badge.className   = 'kpi-badge ' + (total === 5 ? 'badge-green' : total >= 3 ? 'badge-blue' : total >= 1 ? 'badge-amber' : 'badge-red');
    }
  }

  // ── Activity code lookup ──────────────────────────────────
  function lookupActivity(code) {
    _currentActivity = (code || '').trim().toUpperCase();
    _renderLKCard(_currentIntensity, _currentActivity);
    _updateSummaryBadge(_currentIntensity);

    // Show description below input
    const desc = $$('tax-activity-desc');
    if (!desc) return;
    const act = SLGFT.activities.find(a => a.code === _currentActivity);
    if (act) {
      const obj = SLGFT.objectives[act.obj] || '';
      desc.innerHTML = `<strong>${act.code}</strong> — ${act.label} &nbsp;<span class="kpi-badge badge-blue">${obj}</span>${act.eligibility === 'direct' ? ' <span class="kpi-badge badge-green">Direct Eligibility</span>' : ''}${act.note ? ` <span style="color:var(--text-secondary)">${act.note}</span>` : ''}`;
      desc.style.display = 'block';
    } else if (_currentActivity) {
      desc.textContent = 'Activity code not found — showing intensity-based assessment.';
      desc.style.display = 'block';
    } else {
      desc.style.display = 'none';
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
            ...data.topContributors.map(p => ({ id: p.projectId, name: p.name || p.projectId, intensity: null })),
          ];
          return _projects;
        }
      }
    } catch (_) {}
    _projects = DEMO_PROJECTS;
    return _projects;
  }

  // ── Select a project from dropdown ───────────────────────
  async function selectProject(projectId) {
    const manualWrap = $$('tax-manual-wrap');
    if (projectId === 'custom') {
      if (manualWrap) manualWrap.style.display = 'block';
      return;
    }
    if (manualWrap) manualWrap.style.display = 'none';

    try {
      const res = await window.CARBONIQ_fetch(`/v1/projects/${projectId}/taxonomy`);
      if (res.ok) {
        const data = await res.json();
        const intensity = data.emissionsIntensity_kgCO2e_m2 || data.projectMetrics?.intensity_kgCO2e_m2 || null;
        if (intensity) {
          _currentIntensity = Math.round(intensity);
          const inp = $$('tax-intensity-input');
          if (inp) inp.value = _currentIntensity;
          _renderCards(_currentIntensity);
          return;
        }
      }
    } catch (_) {}

    const demo = DEMO_PROJECTS.find(p => p.id === projectId);
    if (demo?.intensity) {
      _currentIntensity = demo.intensity;
      const inp = $$('tax-intensity-input');
      if (inp) inp.value = _currentIntensity;
      _renderCards(_currentIntensity);
    }
  }

  // ── Manual intensity input ────────────────────────────────
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

    // Populate SLSIC sector selector
    const sectorSel = $$('tax-slsic-select');
    if (sectorSel) {
      sectorSel.innerHTML =
        `<option value="">— All Sectors —</option>` +
        SLGFT.sectors.map(s => `<option value="${s.code}">${s.code} — ${s.label} (${s.slsic})</option>`).join('');
    }

    // Populate project selector
    const projects = await _loadProjects();
    const sel = $$('tax-project-select');
    if (sel) {
      sel.innerHTML = projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
      sel.addEventListener('change', (e) => selectProject(e.target.value));
    }

    const inp = $$('tax-intensity-input');
    if (inp) inp.value = _currentIntensity;

    _renderCards(_currentIntensity);
  }

  return { init, selectProject, updateIntensity, lookupActivity };
})();
