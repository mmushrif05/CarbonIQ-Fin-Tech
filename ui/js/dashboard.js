/* ============================================================
   CarbonIQ — Dashboard & Portfolio Live Data Module
   ============================================================
   Fetches from GET /v1/portfolio, renders both Dashboard and
   Portfolio pages dynamically.  Falls back to demo data when
   the API is unreachable.
   ============================================================ */

const Dashboard = (() => {
  // ── Demo / fallback data ──────────────────────────────────
  const DEMO = {
    totalProjects: 87,
    totalFinancedEmissions_tCO2e: 48230,
    taxonomyDistribution: { green: 34, transition: 31, brown: 22 },
    topContributors: [
      { projectId: 'SG-2024-001', name: 'Marina Bay Tower',       financedEmissions_tCO2e: 4210, classification: 'green' },
      { projectId: 'SG-2024-015', name: 'Changi Business Hub',    financedEmissions_tCO2e: 3870, classification: 'transition' },
      { projectId: 'MY-2024-003', name: 'KL Eco Residences',      financedEmissions_tCO2e: 3640, classification: 'green' },
      { projectId: 'HK-2024-008', name: 'Kowloon Gateway',        financedEmissions_tCO2e: 3120, classification: 'brown' },
      { projectId: 'SG-2024-042', name: 'Tuas Industrial Complex', financedEmissions_tCO2e: 2980, classification: 'transition' },
    ],
    aggregatedAt: new Date().toISOString(),
    meta: { requestedProjects: 87, resolvedProjects: 87, failedProjects: 0 },
    // Extended demo fields for richer display
    _demo: true,
    weightedDQ: 2.4,
    coveragePct: 78,
    totalOutstanding: 1240000000,
    assetClasses: [
      { label: 'Commercial',  value: 18200 },
      { label: 'Residential', value: 14400 },
      { label: 'Industrial',  value: 9800 },
      { label: 'Mixed-Use',   value: 5830 },
    ],
    assetTypes: [
      { label: 'Office',       value: 35 },
      { label: 'Residential',  value: 28 },
      { label: 'Retail',       value: 18 },
      { label: 'Industrial',   value: 12 },
      { label: 'Hospitality',  value: 7 },
    ],
    dqDistribution: { 1: 22, 2: 31, 3: 24, 4: 15, 5: 8 },
    regions: [
      { label: 'Singapore',  projects: 42 },
      { label: 'Malaysia',   projects: 22 },
      { label: 'Hong Kong',  projects: 15 },
      { label: 'Thailand',   projects: 8 },
    ],
  };

  let _cache = null;

  // ── Fetch portfolio data ──────────────────────────────────
  async function _fetchData() {
    try {
      const res = await window.CARBONIQ_fetch('/v1/portfolio');
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      // Enrich with computed fields if missing
      if (!data.weightedDQ) data.weightedDQ = 2.4;
      if (!data.coveragePct) {
        const total = (data.meta?.requestedProjects || 0);
        const resolved = (data.meta?.resolvedProjects || 0);
        data.coveragePct = total > 0 ? Math.round((resolved / total) * 100) : 0;
      }
      if (!data.totalOutstanding) data.totalOutstanding = 0;
      if (!data.assetClasses) data.assetClasses = DEMO.assetClasses;
      if (!data.assetTypes) data.assetTypes = DEMO.assetTypes;
      if (!data.dqDistribution) data.dqDistribution = DEMO.dqDistribution;
      if (!data.regions) data.regions = DEMO.regions;
      _cache = data;
      return data;
    } catch (_) {
      // Fallback to demo data
      _cache = { ...DEMO };
      return _cache;
    }
  }

  // ── Number formatters ─────────────────────────────────────
  function _fmt(n) {
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
    return `$${n}`;
  }
  function _fmtN(n) { return n.toLocaleString('en-US'); }

  // ── Dashboard rendering ───────────────────────────────────
  function _renderDashboard(d) {
    const $ = (id) => document.getElementById(id);

    // Hide loading
    const loader = $('dash-loading');
    if (loader) loader.style.display = 'none';

    // KPI: Emissions
    const emVal = $('dash-emissions-value');
    if (emVal) emVal.innerHTML = `${_fmtN(d.totalFinancedEmissions_tCO2e)} <span class="kpi-unit">tCO2e</span>`;
    const emBadge = $('dash-emissions-badge');
    if (emBadge) {
      emBadge.textContent = `${d.totalProjects} projects`;
      emBadge.className = 'kpi-badge badge-neutral';
    }

    // KPI: Data Quality
    const dqVal = $('dash-dq-value');
    if (dqVal) dqVal.innerHTML = `${d.weightedDQ.toFixed(1)} <span class="kpi-unit">/ 5</span>`;
    const dqBadge = $('dash-dq-badge');
    if (dqBadge) {
      const label = d.weightedDQ <= 2.0 ? 'Excellent' : d.weightedDQ <= 3.0 ? 'Good' : 'Fair';
      dqBadge.textContent = label;
      dqBadge.className = 'kpi-badge ' + (d.weightedDQ <= 2.0 ? 'badge-green' : d.weightedDQ <= 3.0 ? 'badge-blue' : 'badge-amber');
    }
    const dqMeter = $('dash-dq-meter');
    if (dqMeter) dqMeter.style.width = `${((5 - d.weightedDQ) / 4) * 100}%`;

    // KPI: Coverage
    const covVal = $('dash-coverage-value');
    if (covVal) covVal.innerHTML = `${d.coveragePct}<span class="kpi-unit">%</span>`;
    const covBadge = $('dash-coverage-badge');
    if (covBadge) {
      covBadge.textContent = `${d.meta?.resolvedProjects || d.totalProjects} / ${d.meta?.requestedProjects || d.totalProjects}`;
      covBadge.className = 'kpi-badge badge-blue';
    }
    const donut = $('dash-donut-fill');
    if (donut) donut.setAttribute('stroke-dasharray', `${d.coveragePct} ${100 - d.coveragePct}`);

    // KPI: Taxonomy
    const tax = d.taxonomyDistribution || {};
    const total = (tax.green || 0) + (tax.transition || 0) + (tax.brown || 0);
    const greenPct = total > 0 ? Math.round((tax.green / total) * 100) : 0;
    const taxVal = $('dash-taxonomy-value');
    if (taxVal) taxVal.innerHTML = `${greenPct}% <span class="kpi-unit">green</span>`;
    const taxBadge = $('dash-taxonomy-badge');
    if (taxBadge) {
      taxBadge.textContent = `${tax.green || 0} of ${total}`;
      taxBadge.className = 'kpi-badge badge-green';
    }

    // Chart: Asset class bars
    const barWrap = $('dash-asset-bars');
    if (barWrap && d.assetClasses) {
      const maxVal = Math.max(...d.assetClasses.map(a => a.value));
      const colors = ['fill-blue', 'fill-green', 'fill-amber', 'fill-purple'];
      barWrap.innerHTML = d.assetClasses.map((a, i) => `
        <div class="bar-group">
          <div class="bar ${colors[i % colors.length]}" style="height:${Math.round((a.value / maxVal) * 100)}%"></div>
          <span class="bar-label">${a.label}</span>
          <span class="bar-value">${_fmtN(a.value)}</span>
        </div>
      `).join('');
    }

    // Chart: Asset type h-bars
    const hbars = $('dash-hbars');
    if (hbars && d.assetTypes) {
      const maxPct = Math.max(...d.assetTypes.map(a => a.value));
      const fills = ['fill-blue', 'fill-green', 'fill-amber', 'fill-purple', 'fill-red'];
      hbars.innerHTML = d.assetTypes.map((a, i) => `
        <div class="h-bar-row">
          <span class="h-bar-label">${a.label}</span>
          <div class="h-bar-track"><div class="h-bar-fill ${fills[i % fills.length]}" style="width:${Math.round((a.value / maxPct) * 100)}%"></div></div>
          <span class="h-bar-value">${a.value}%</span>
        </div>
      `).join('');
    }

    // Table: Top projects
    const tbody = $('dash-projects-tbody');
    if (tbody) {
      if (!d.topContributors || d.topContributors.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-tertiary);padding:32px">No projects found</td></tr>';
      } else {
        tbody.innerHTML = d.topContributors.map(p => {
          const cls = p.classification || 'brown';
          const badgeCls = cls === 'green' ? 'badge-green' : cls === 'transition' ? 'badge-amber' : 'badge-red';
          return `<tr>
            <td><strong>${p.name || p.projectId}</strong><br><span style="font-size:11px;color:var(--text-tertiary)">${p.projectId}</span></td>
            <td>${cls.charAt(0).toUpperCase() + cls.slice(1)}</td>
            <td>${_fmtN(p.financedEmissions_tCO2e)} tCO2e</td>
            <td><span class="kpi-badge ${badgeCls}">${cls}</span></td>
          </tr>`;
        }).join('');
      }
    }
  }

  // ── Portfolio rendering ───────────────────────────────────
  function _renderPortfolio(d) {
    const $ = (id) => document.getElementById(id);

    const loader = $('pf-loading');
    if (loader) loader.style.display = 'none';

    // KPIs
    const outstanding = $('pf-outstanding');
    if (outstanding) outstanding.textContent = d.totalOutstanding ? _fmt(d.totalOutstanding) : '—';

    const emissions = $('pf-emissions');
    if (emissions) emissions.innerHTML = `${_fmtN(d.totalFinancedEmissions_tCO2e)} <span class="kpi-unit">tCO2e</span>`;

    const intensity = $('pf-intensity');
    if (intensity) {
      const val = d.totalOutstanding > 0
        ? (d.totalFinancedEmissions_tCO2e / (d.totalOutstanding / 1e6)).toFixed(1)
        : '—';
      intensity.innerHTML = `${val} <span class="kpi-unit">tCO2e/$M</span>`;
    }

    // DQ Distribution
    const dqWrap = $('pf-dq-dist');
    if (dqWrap && d.dqDistribution) {
      dqWrap.innerHTML = [1,2,3,4,5].map(n => {
        const pct = d.dqDistribution[n] || 0;
        return `<div class="dq-dist-row">
          <span class="dq-badge dq-${n}">${n}</span>
          <div class="dq-dist-bar-track"><div class="dq-dist-bar dq-fill-${n}" style="width:${pct}%"></div></div>
          <span class="dq-dist-pct">${pct}%</span>
        </div>`;
      }).join('');
    }

    // Region bars
    const regionWrap = $('pf-region-bars');
    if (regionWrap && d.regions) {
      const maxP = Math.max(...d.regions.map(r => r.projects));
      const fills = ['fill-blue', 'fill-green', 'fill-purple', 'fill-amber'];
      regionWrap.innerHTML = d.regions.map((r, i) => `
        <div class="h-bar-row">
          <span class="h-bar-label">${r.label}</span>
          <div class="h-bar-track"><div class="h-bar-fill ${fills[i % fills.length]}" style="width:${Math.round((r.projects / maxP) * 100)}%"></div></div>
          <span class="h-bar-value">${r.projects} projects</span>
        </div>
      `).join('');
    }
  }

  // ── Public API ────────────────────────────────────────────
  let _initialized = false;

  async function init() {
    if (_initialized) return;
    _initialized = true;
    const data = await _fetchData();
    _renderDashboard(data);
    _renderPortfolio(data);
  }

  async function refresh() {
    _cache = null;
    // Show loaders
    const dl = document.getElementById('dash-loading');
    const pl = document.getElementById('pf-loading');
    if (dl) dl.style.display = 'flex';
    if (pl) pl.style.display = 'flex';
    const data = await _fetchData();
    _renderDashboard(data);
    _renderPortfolio(data);
  }

  function exportCSV() {
    const d = _cache || DEMO;
    if (!d.topContributors || d.topContributors.length === 0) return;
    const rows = [
      ['Project ID', 'Name', 'Financed Emissions (tCO2e)', 'Classification'],
      ...d.topContributors.map(p => [
        p.projectId,
        p.name || '',
        p.financedEmissions_tCO2e,
        p.classification,
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `carboniq-portfolio-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return { init, refresh, exportCSV };
})();
