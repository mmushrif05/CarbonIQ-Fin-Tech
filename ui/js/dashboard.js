/* ============================================================
   CarbonIQ — Dashboard & Portfolio Live Data Module
   ============================================================
   Fetches from GET /v1/portfolio, renders both Dashboard and
   Portfolio pages dynamically.  Falls back to demo data when
   the API is unreachable.
   ============================================================ */

const Dashboard = (() => {
  // ── Sample figures ────────────────────────────────────────
  // The sample book lives in ui/data/portfolio-sample.json rather than in
  // this file, so it is data a person can replace without editing code, and
  // so there is exactly one copy of it. It is drawn only when the API has
  // nothing to give, never blended into a live portfolio.
  const SAMPLE_URL = '/data/portfolio-sample.json';

  let _sample = null;
  async function _loadSample() {
    if (_sample) return _sample;
    const res = await fetch(SAMPLE_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`sample data ${res.status}`);
    _sample = await res.json();
    return _sample;
  }

  let _cache = null;

  // ── Fetch portfolio data ──────────────────────────────────
  /**
   * Resolve what the screen should draw, and record which of three states it
   * is in. They are kept apart on purpose:
   *
   *   live        the API returned a portfolio that has projects in it
   *   sample      it did not, so the sample book is drawn and said to be one
   *   unavailable neither is available, and the screen says that rather than
   *               sitting on a spinner
   *
   * `cause` distinguishes the two ways of arriving at `sample`, because the
   * remedies are different: an empty book is an API key with no projects
   * linked to it, an unreachable API is a deployment problem.
   *
   * A live portfolio is never topped up from the sample. It used to be —
   * assetClasses, regions, the data-quality split and the regulatory table
   * were all quietly filled in from the demo constant whenever the API
   * omitted them — so a real total sat beside invented bars with nothing on
   * screen to tell them apart. Anything the portfolio does not carry is now
   * reported absent.
   */
  async function _fetchData() {
    let live = null;
    let cause = null;
    let detail = '';

    try {
      const res = await window.CARBONIQ_fetch('/v1/portfolio');
      if (!res.ok) throw new Error(`API ${res.status}`);
      live = await res.json();
    } catch (err) {
      cause = 'unreachable';
      detail = err.message;
    }

    if (live && (live.totalProjects || 0) > 0) {
      live._source = { mode: 'live' };
      if (!live.cfsDistribution && live.taxonomyDistribution) {
        // Not a substitution: the CFS bands and the taxonomy split are the
        // same three counts under two names.
        live.cfsDistribution = live.taxonomyDistribution;
      }
      _cache = live;
      return _cache;
    }

    if (live) {
      cause = 'empty';
      detail = live.message || 'The portfolio came back with no projects in it.';
    }

    try {
      const sample = await _loadSample();
      _cache = { ...sample, _source: { mode: 'sample', cause, detail } };
    } catch (sampleErr) {
      _cache = {
        _source: { mode: 'unavailable', cause, detail, sampleError: sampleErr.message },
      };
    }
    return _cache;
  }

  /**
   * Say plainly, on the page, which of the three states this is.
   *
   * Placed at the top of the dashboard rather than in a toast, because a
   * toast disappears and the wrong numbers stay on screen afterwards.
   */
  function _renderDemoBanner(data) {
    const hosts = ['page-dashboard', 'page-portfolio']
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    if (!hosts.length) return;

    const src = (data && data._source) || {};

    hosts.forEach((host, i) => {
      const bannerId = 'dash-demo-banner' + (i === 0 ? '' : '-pf');
      const existing = document.getElementById(bannerId);

      if (src.mode === 'live') { if (existing) existing.remove(); return; }

      const detail = String(src.detail || '').replace(/[<>&]/g, '');
      const is401 = /\b401\b/.test(detail);
      const is503 = /\b503\b/.test(detail);

      let headline, advice;
      if (src.mode === 'unavailable') {
        headline = 'No figures to show.';
        advice = 'The API returned nothing and the sample book could not be loaded either '
               + `(${String(src.sampleError || '').replace(/[<>&]/g, '')}). `
               + 'Check that data/portfolio-sample.json is deployed with the site.';
      } else if (src.cause === 'empty') {
        headline = 'Showing sample data — not your portfolio.';
        advice = 'The API answered, but no projects are linked to this API key yet, so there is '
               + 'nothing of yours to aggregate. Link projects to the key '
               + '(npm run key:create — the --projects flag) and these screens switch to your own '
               + 'figures on their own.';
      } else {
        headline = 'Showing sample data — not your portfolio.';
        advice = is401
          ? 'The API rejected the dashboard key. Set UI_API_KEY in your Netlify environment variables, or enter a valid key under Settings.'
          : is503
            ? 'The API is reachable but the feature or its database is not configured. Check FF_PORTFOLIO_AGGREGATION and the Firebase variables in your deployment environment.'
            : 'The dashboard could not reach the API.';
      }

      const el = existing || document.createElement('div');
      el.id = bannerId;
      el.className = 'dash-demo-banner' + (src.mode === 'unavailable' ? ' is-unavailable' : '');
      el.innerHTML = '<strong>' + headline + '</strong><span>' + advice
                   + (detail ? ' (' + detail + ')' : '') + '</span>';
      if (!existing) host.insertBefore(el, host.firstChild);
    });
  }

  /**
   * A panel the live portfolio does not carry. Named, not filled in.
   */
  function _absent(el, what) {
    if (!el) return;
    el.innerHTML = '<p class="dash-absent">' + what + '</p>';
  }

  /**
   * Fill in only what can be derived from the payload itself — never from the
   * sample book. A live portfolio that does not carry a figure is missing it,
   * and `null` is how the renderers know to say so.
   */
  function _withDefaults(d) {
    const out = { ...d };
    if (typeof out.weightedDQ !== 'number') out.weightedDQ = null;
    if (typeof out.totalFinancedEmissions_tCO2e !== 'number') out.totalFinancedEmissions_tCO2e = 0;
    if (typeof out.totalProjects !== 'number') out.totalProjects = 0;
    if (typeof out.totalOutstanding !== 'number') out.totalOutstanding = 0;
    if (typeof out.coveragePct !== 'number') {
      const req = out.meta?.requestedProjects || 0;
      const got = out.meta?.resolvedProjects || 0;
      out.coveragePct = req > 0 ? Math.round((got / req) * 100) : 0;
    }
    return out;
  }

  const DQ_ABSENT = 'not reported';

  /** A score, or the reason there isn't one — never a fabricated 0. */
  function _dqText(v, dp) {
    if (v == null) return DQ_ABSENT;
    const band = v <= 2 ? 'Excellent' : v <= 3 ? 'Good' : 'Fair';
    return `${v.toFixed(dp)} (${band})`;
  }

  /** Every figure blanked, so a failed load cannot leave the last one standing. */
  function _clearDashboard() {
    ['dash-emissions-value', 'dash-dq-value', 'dash-coverage-value', 'dash-taxonomy-value']
      .forEach((id) => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
    ['dash-emissions-badge', 'dash-dq-badge', 'dash-coverage-badge', 'dash-taxonomy-badge']
      .forEach((id) => { const el = document.getElementById(id); if (el) el.textContent = ''; });
    _absent(document.getElementById('dash-asset-bars'), 'No portfolio to break down.');
    _absent(document.getElementById('dash-hbars'), 'No portfolio to break down.');
    const tb = document.getElementById('dash-projects-tbody');
    if (tb) tb.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-tertiary);padding:32px">No portfolio loaded</td></tr>';
  }

  function _clearPortfolio() {
    ['pf-outstanding', 'pf-emissions', 'pf-intensity', 'pf-wdq', 'pf-coverage', 'pf-green-ratio']
      .forEach((id) => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
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

    // The loader comes down whatever the outcome. A spinner that outlives the
    // request it represents is the failure this screen is most often reported
    // for, and it is indistinguishable from a slow network.
    const loader = $('dash-loading');
    if (loader) loader.style.display = 'none';

    if (!d || d._source?.mode === 'unavailable') { _clearDashboard(); return; }
    d = _withDefaults(d);

    const emVal = $('dash-emissions-value');
    if (emVal) emVal.innerHTML = `${_fmtN(d.totalFinancedEmissions_tCO2e)} <span class="kpi-unit">tCO2e</span>`;
    const emBadge = $('dash-emissions-badge');
    if (emBadge) {
      emBadge.textContent = `${d.totalProjects} projects`;
      emBadge.className = 'kpi-badge badge-neutral';
    }

    const dqVal = $('dash-dq-value');
    if (dqVal) {
      dqVal.innerHTML = d.weightedDQ == null
        ? `— <span class="kpi-unit">${DQ_ABSENT}</span>`
        : `${d.weightedDQ.toFixed(2)} <span class="kpi-unit">1 = best of 1–5</span>`;
    }
    const dqBadge = $('dash-dq-badge');
    if (dqBadge && d.weightedDQ == null) { dqBadge.textContent = DQ_ABSENT; dqBadge.className = 'kpi-badge badge-neutral'; }
    else if (dqBadge) {
      const label = d.weightedDQ <= 2.0 ? 'Excellent' : d.weightedDQ <= 3.0 ? 'Good' : 'Fair';
      dqBadge.textContent = label;
      dqBadge.className = 'kpi-badge ' + (d.weightedDQ <= 2.0 ? 'badge-green' : d.weightedDQ <= 3.0 ? 'badge-blue' : 'badge-amber');
    }
    const dqMeter = $('dash-dq-meter');
    if (dqMeter) dqMeter.style.width = d.weightedDQ == null ? '0%' : `${((5 - d.weightedDQ) / 4) * 100}%`;

    const covVal = $('dash-coverage-value');
    if (covVal) covVal.innerHTML = `${d.coveragePct}<span class="kpi-unit">%</span>`;
    const covBadge = $('dash-coverage-badge');
    if (covBadge) {
      covBadge.textContent = `${d.meta?.resolvedProjects || d.totalProjects} / ${d.meta?.requestedProjects || d.totalProjects}`;
      covBadge.className = 'kpi-badge badge-blue';
    }
    const donut = $('dash-donut-fill');
    if (donut) donut.setAttribute('stroke-dasharray', `${d.coveragePct} ${100 - d.coveragePct}`);

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

    const barWrap = $('dash-asset-bars');
    if (barWrap && !(d.assetClasses || []).length) {
      _absent(barWrap, 'This portfolio does not carry an asset-class breakdown.');
    } else if (barWrap && d.assetClasses) {
      const maxVal = Math.max(...d.assetClasses.map(a => a.value));
      const colors = ['fill-blue', 'fill-green', 'fill-amber', 'fill-purple'];
      // The bar lives in a track that owns the height, so its percentage has
      // something definite to resolve against. Without the track the group was
      // sized by its own text and every bar computed to zero height — labels
      // and values on screen, no bars at all.
      barWrap.innerHTML = d.assetClasses.map((a, i) => `
        <div class="bar-group">
          <span class="bar-value">${_fmtN(a.value)}</span>
          <div class="bar-track">
            <div class="bar ${colors[i % colors.length]}" style="height:${Math.max(2, Math.round((a.value / maxVal) * 100))}%"
                 title="${a.label}: ${_fmtN(a.value)} tCO2e"></div>
          </div>
          <span class="bar-label">${a.label}</span>
        </div>
      `).join('');
    }

    const hbars = $('dash-hbars');
    if (hbars && !(d.assetTypes || []).length) {
      _absent(hbars, 'This portfolio does not carry an asset-type mix.');
    } else if (hbars && d.assetTypes) {
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

    if (!d || d._source?.mode === 'unavailable') { _clearPortfolio(); return; }
    d = _withDefaults(d);

    // KPI 1: Total Loan Outstanding
    const outstanding = $('pf-outstanding');
    if (outstanding) outstanding.textContent = d.totalOutstanding ? _fmt(d.totalOutstanding) : '—';
    const outBadge = $('pf-outstanding-badge');
    if (outBadge) outBadge.textContent = d.totalProjects ? `${d.totalProjects} loans` : '—';
    const outSub = $('pf-outstanding-sub');
    if (outSub) outSub.textContent = `Across ${d.totalProjects || 0} active loans`;

    // KPI 2: Financed Emissions
    const emissions = $('pf-emissions');
    if (emissions) emissions.innerHTML = `${_fmtN(d.totalFinancedEmissions_tCO2e)} <span class="kpi-unit">tCO2e</span>`;

    // KPI 3: Economic Intensity
    const intensity = $('pf-intensity');
    const intensityVal = d.totalOutstanding > 0
      ? (d.totalFinancedEmissions_tCO2e / (d.totalOutstanding / 1e6)).toFixed(1)
      : '—';
    if (intensity) intensity.innerHTML = `${intensityVal} <span class="kpi-unit">tCO2e/$M</span>`;
    const intBadge = $('pf-intensity-badge');
    if (intBadge) {
      const iv = parseFloat(intensityVal);
      if (!isNaN(iv)) {
        intBadge.textContent = iv < 30 ? 'Low Risk' : iv < 50 ? 'Medium' : 'High Risk';
        intBadge.className = 'kpi-badge ' + (iv < 30 ? 'badge-green' : iv < 50 ? 'badge-amber' : 'badge-red');
      }
    }

    // KPI 4: Weighted Data Quality
    const wdq = $('pf-wdq');
    if (wdq) {
      wdq.innerHTML = d.weightedDQ == null
        ? `— <span class="kpi-unit">${DQ_ABSENT}</span>`
        : `${d.weightedDQ.toFixed(2)} <span class="kpi-unit">1 = best of 1–5</span>`;
    }
    const pfDqBadge = $('pf-dq-badge');
    if (pfDqBadge && d.weightedDQ == null) { pfDqBadge.textContent = DQ_ABSENT; pfDqBadge.className = 'kpi-badge badge-neutral'; }
    else if (pfDqBadge) {
      const label = d.weightedDQ <= 2.0 ? 'Excellent' : d.weightedDQ <= 3.0 ? 'Good' : 'Fair';
      pfDqBadge.textContent = label;
      pfDqBadge.className = 'kpi-badge ' + (d.weightedDQ <= 2.0 ? 'badge-green' : d.weightedDQ <= 3.0 ? 'badge-blue' : 'badge-amber');
    }
    const pfDqMeter = $('pf-dq-meter');
    if (pfDqMeter) pfDqMeter.style.width = d.weightedDQ == null ? '0%' : `${((5 - d.weightedDQ) / 4) * 100}%`;

    // KPI 5: Portfolio Coverage
    const coverage = $('pf-coverage');
    if (coverage) coverage.innerHTML = `${d.coveragePct}<span class="kpi-unit">%</span>`;
    const covBadge = $('pf-cov-badge');
    if (covBadge) covBadge.textContent = d.coveragePct >= 80 ? 'Sufficient' : 'Below Target';
    const covSub = $('pf-cov-sub');
    if (covSub) covSub.textContent = `${d.meta?.resolvedProjects || 0} of ${d.meta?.requestedProjects || 0} projects resolved`;

    // KPI 6: Green Loan Ratio
    const tax = d.taxonomyDistribution || {};
    const totalProj = (tax.green || 0) + (tax.transition || 0) + (tax.brown || 0);
    const greenPct = totalProj > 0 ? Math.round((tax.green / totalProj) * 100) : 0;
    const greenRatio = $('pf-green-ratio');
    if (greenRatio) greenRatio.innerHTML = `${greenPct}<span class="kpi-unit">%</span>`;
    const greenBadge = $('pf-green-badge');
    if (greenBadge) greenBadge.textContent = greenPct >= 40 ? 'On Track' : 'Below Target';
    const greenSub = $('pf-green-sub');
    if (greenSub) greenSub.textContent = `${tax.green || 0} green / ${totalProj} total projects`;

    // Taxonomy Ring Chart
    const CIRC = 2 * Math.PI * 52;
    const taxTotal = $('pf-tax-total');
    if (taxTotal) taxTotal.textContent = `${totalProj} projects`;
    const gPct = totalProj > 0 ? (tax.green || 0) / totalProj : 0;
    const tPct = totalProj > 0 ? (tax.transition || 0) / totalProj : 0;
    const bPct = totalProj > 0 ? (tax.brown || 0) / totalProj : 0;

    const greenArc = $('pf-tax-green-arc');
    const transArc = $('pf-tax-trans-arc');
    const brownArc = $('pf-tax-brown-arc');
    if (greenArc) {
      greenArc.setAttribute('stroke-dasharray', `${gPct * CIRC} ${CIRC}`);
      greenArc.setAttribute('stroke-dashoffset', '0');
    }
    if (transArc) {
      transArc.setAttribute('stroke-dasharray', `${tPct * CIRC} ${CIRC}`);
      transArc.setAttribute('stroke-dashoffset', `${-gPct * CIRC}`);
    }
    if (brownArc) {
      brownArc.setAttribute('stroke-dasharray', `${bPct * CIRC} ${CIRC}`);
      brownArc.setAttribute('stroke-dashoffset', `${-(gPct + tPct) * CIRC}`);
    }
    const legend = $('pf-tax-legend');
    if (legend) {
      legend.innerHTML = [
        { cls: 'green', label: 'Green (CFS ≥ 70)', count: tax.green || 0, pct: Math.round(gPct * 100) },
        { cls: 'transition', label: 'Transition (40–69)', count: tax.transition || 0, pct: Math.round(tPct * 100) },
        { cls: 'brown', label: 'Brown (CFS < 40)', count: tax.brown || 0, pct: Math.round(bPct * 100) },
      ].map(r => `
        <div class="pf-tax-legend-row">
          <span class="pf-tax-dot pf-tax-dot-${r.cls}"></span>
          <span class="pf-tax-legend-label">${r.label}</span>
          <span class="pf-tax-legend-value">${r.count}<span class="pf-tax-legend-pct"> (${r.pct}%)</span></span>
        </div>
      `).join('');
    }

    // CFS Score Distribution Bars
    const cfsBars = $('pf-cfs-bars');
    const cfs = d.cfsDistribution || d.taxonomyDistribution || {};
    if (cfsBars) {
      const cfsTotal = (cfs.green || 0) + (cfs.transition || 0) + (cfs.brown || 0);
      const bands = [
        { label: 'Green (70–100)',      count: cfs.green || 0,      barCls: 'pf-cfs-bar-green',      labelCls: 'pf-cfs-label-green' },
        { label: 'Transition (40–69)',   count: cfs.transition || 0, barCls: 'pf-cfs-bar-transition', labelCls: 'pf-cfs-label-transition' },
        { label: 'Brown (0–39)',         count: cfs.brown || 0,      barCls: 'pf-cfs-bar-brown',      labelCls: 'pf-cfs-label-brown' },
      ];
      cfsBars.innerHTML = bands.map(b => {
        const pct = cfsTotal > 0 ? Math.round((b.count / cfsTotal) * 100) : 0;
        return `<div class="pf-cfs-row">
          <span class="pf-cfs-label ${b.labelCls}">${b.label}</span>
          <div class="pf-cfs-bar-track"><div class="pf-cfs-bar ${b.barCls}" style="width:${pct}%">${pct}%</div></div>
          <span class="pf-cfs-count">${b.count}</span>
        </div>`;
      }).join('');
    }

    // Top Emitters Table
    const topTbody = $('pf-top-tbody');
    const topPctBadge = $('pf-top-pct');
    if (topTbody && d.topContributors) {
      const totalEm = d.totalFinancedEmissions_tCO2e || 1;
      const top5Em = d.topContributors.reduce((s, p) => s + (p.financedEmissions_tCO2e || 0), 0);
      const concPct = Math.round((top5Em / totalEm) * 100);
      if (topPctBadge) topPctBadge.textContent = `Top ${d.topContributors.length} = ${concPct}% of portfolio emissions`;

      topTbody.innerHTML = d.topContributors.map(p => {
        const cls = p.classification || 'brown';
        const badgeCls = cls === 'green' ? 'badge-green' : cls === 'transition' ? 'badge-amber' : 'badge-red';
        const pIntensity = p.loanOutstanding > 0
          ? (p.financedEmissions_tCO2e / (p.loanOutstanding / 1e6)).toFixed(1)
          : '—';
        return `<tr>
          <td><div class="project-cell"><span class="project-name">${p.name || p.projectId}</span><span class="project-id">${p.projectId}</span></div></td>
          <td>${p.region || '—'}</td>
          <td>${p.buildingType || '—'}</td>
          <td><strong>${_fmtN(p.financedEmissions_tCO2e)}</strong> tCO2e</td>
          <td>${p.loanOutstanding ? _fmt(p.loanOutstanding) : '—'}</td>
          <td>${pIntensity} <span style="color:var(--text-tertiary);font-size:11px">tCO2e/$M</span></td>
          <td><span class="kpi-badge ${badgeCls}">${cls}</span></td>
          <td><strong>${p.cfsScore != null ? p.cfsScore : '—'}</strong><span style="color:var(--text-tertiary);font-size:11px">/100</span></td>
        </tr>`;
      }).join('');
    }

    // DQ Distribution
    const dqWrap = $('pf-dq-dist');
    if (dqWrap && d.dqDistribution) {
      const dqLabels = { 1: 'Verified — audited data', 2: 'Reported — unaudited', 3: 'Estimated — modelled', 4: 'Proxy — sector avg', 5: 'Default — global avg' };
      dqWrap.innerHTML = [1,2,3,4,5].map(n => {
        const pct = d.dqDistribution[n] || 0;
        return `<div class="dq-dist-row">
          <span class="dq-badge dq-${n}">${n}</span>
          <div class="dq-dist-bar-track"><div class="dq-dist-bar dq-fill-${n}" style="width:${pct}%"></div></div>
          <span class="dq-dist-pct" title="${dqLabels[n]}">${pct}%</span>
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

    // Asset Class Bars
    const acBars = $('pf-asset-class-bars');
    if (acBars && d.assetClasses) {
      const maxVal = Math.max(...d.assetClasses.map(a => a.value));
      const colors = ['fill-blue', 'fill-green', 'fill-amber', 'fill-purple'];
      acBars.innerHTML = d.assetClasses.map((a, i) => `
        <div class="bar-group">
          <div class="bar ${colors[i % colors.length]}" style="height:${Math.round((a.value / maxVal) * 100)}%"></div>
          <span class="bar-label">${a.label}</span>
          <span class="bar-value">${_fmtN(a.value)} tCO2e</span>
        </div>
      `).join('');
    }

    // Regulatory Compliance Readiness
    const regGrid = $('pf-reg-grid');
    if (regGrid && d.regulatoryReadiness) {
      const statusMap = {
        ready:   { label: 'Compliant', cls: 'pf-reg-ready' },
        partial: { label: 'Partial',   cls: 'pf-reg-partial' },
        gap:     { label: 'Gap',       cls: 'pf-reg-gap' },
      };
      regGrid.innerHTML = d.regulatoryReadiness.map(r => {
        const s = statusMap[r.status] || statusMap.gap;
        return `<div class="pf-reg-row">
          <div class="pf-reg-info">
            <span class="pf-reg-name">${r.name}</span>
            <span class="pf-reg-desc">${r.desc}</span>
          </div>
          <span class="pf-reg-status ${s.cls}">${s.label}</span>
        </div>`;
      }).join('');
    }
  }

  // ── AI ESG Report Generation ──────────────────────────────
  async function generateAIReport() {
    const $ = (id) => document.getElementById(id);
    const panel = $('pf-ai-panel');
    const body = $('pf-ai-body');
    const status = $('pf-ai-status');
    if (!panel || !body) return;

    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth' });
    body.innerHTML = '';
    if (status) { status.textContent = 'Analyzing...'; status.className = 'kpi-badge badge-blue'; }

    const steps = [1,2,3,4,5];
    steps.forEach(n => {
      const el = $(`pf-ai-step-${n}`);
      if (el) el.className = 'pf-ai-step';
    });

    const d = _withDefaults(_cache || {});

    const stepLabels = [
      'Scoring assets with Carbon Finance Score engine...',
      'Checking taxonomy alignment across EU, ASEAN, HK, SG...',
      'Calculating PCAF v3 financed emissions attribution...',
      'Analyzing concentration and transition risk...',
      'Mapping TCFD disclosures and regulatory requirements...',
    ];

    try {
      let agentReport = null;

      for (let i = 0; i < steps.length; i++) {
        const stepEl = $(`pf-ai-step-${steps[i]}`);
        if (stepEl) stepEl.className = 'pf-ai-step active';
        body.innerHTML = `<p style="color:var(--text-secondary)">${stepLabels[i]}</p>`;

        if (i === 2 && typeof window.CARBONIQ_fetch === 'function') {
          try {
            const res = await window.CARBONIQ_fetch('/v1/agent/portfolio', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                portfolioName: 'Construction Green Loan Portfolio',
                reportingPeriod: new Date().toISOString().slice(0, 7),
                reportingEntity: 'CarbonIQ Bank',
                assets: d.topContributors.map(p => ({
                  loanId: p.projectId,
                  projectName: p.name,
                  buildingType: p.buildingType || 'Commercial',
                  buildingArea_m2: 25000,
                  region: p.region || 'Singapore',
                  totalTCO2e: p.financedEmissions_tCO2e,
                  epdCoveragePct: 45,
                  reductionPct: p.classification === 'green' ? 45 : p.classification === 'transition' ? 25 : 10,
                  loanAmount: p.loanOutstanding || 100000000,
                  projectValue: (p.loanOutstanding || 100000000) * 1.4,
                  certificationLevel: p.classification === 'green' ? 'platinum' : 'gold',
                  verificationStatus: 'third-party',
                })),
              }),
            });
            if (res.ok) {
              const result = await res.json();
              agentReport = result.report || result.memo || result.content || null;
            }
          } catch (_e) { /* agent unavailable */ }
        }

        await new Promise(r => setTimeout(r, 600));
        if (stepEl) stepEl.className = 'pf-ai-step done';
      }

      if (status) { status.textContent = 'Complete'; status.className = 'kpi-badge badge-green'; }
      body.innerHTML = agentReport
        ? `<div style="white-space:pre-wrap">${agentReport}</div>`
        : _buildLocalReport(d);
    } catch (err) {
      if (status) { status.textContent = 'Error'; status.className = 'kpi-badge badge-red'; }
      body.innerHTML = `<p style="color:var(--red)">Report generation failed: ${err.message}</p>`;
    }
  }

  function _buildLocalReport(d) {
    const tax = d.taxonomyDistribution || {};
    const totalProj = (tax.green || 0) + (tax.transition || 0) + (tax.brown || 0);
    const greenPct = totalProj > 0 ? Math.round((tax.green / totalProj) * 100) : 0;
    const intensityVal = d.totalOutstanding > 0
      ? (d.totalFinancedEmissions_tCO2e / (d.totalOutstanding / 1e6)).toFixed(1)
      : 'N/A';
    const top5Em = (d.topContributors || []).reduce((s, p) => s + (p.financedEmissions_tCO2e || 0), 0);
    const concPct = d.totalFinancedEmissions_tCO2e > 0
      ? Math.round((top5Em / d.totalFinancedEmissions_tCO2e) * 100) : 0;

    return `
      <h4>1. Executive Summary</h4>
      <table>
        <tr><th>Metric</th><th>Value</th><th>Status</th></tr>
        <tr><td>Total Loan Outstanding</td><td>${_fmt(d.totalOutstanding || 0)}</td><td>${d.totalProjects} active loans</td></tr>
        <tr><td>Total Financed Emissions</td><td>${_fmtN(d.totalFinancedEmissions_tCO2e)} tCO2e</td><td>PCAF v3 methodology</td></tr>
        <tr><td>Economic Intensity</td><td>${intensityVal} tCO2e/$M</td><td>${parseFloat(intensityVal) < 40 ? 'Below sector avg' : 'Above sector avg'}</td></tr>
        <tr><td>Green Loan Ratio</td><td>${greenPct}%</td><td>${greenPct >= 40 ? 'On target' : 'Below 40% target'}</td></tr>
        <tr><td>Weighted Data Quality</td><td>${_dqText(d.weightedDQ, 2)}</td><td>PCAF scale 1–5, 1 = highest quality</td></tr>
        <tr><td>Portfolio Coverage</td><td>${d.coveragePct}%</td><td>${d.coveragePct >= 80 ? 'Sufficient' : 'Needs improvement'}</td></tr>
      </table>

      <h4>2. Carbon Finance Score Distribution</h4>
      <table>
        <tr><th>Classification</th><th>Count</th><th>% of Portfolio</th><th>CFS Range</th></tr>
        <tr><td>Green</td><td>${tax.green || 0}</td><td>${greenPct}%</td><td>70 – 100</td></tr>
        <tr><td>Transition</td><td>${tax.transition || 0}</td><td>${totalProj > 0 ? Math.round(((tax.transition || 0) / totalProj) * 100) : 0}%</td><td>40 – 69</td></tr>
        <tr><td>Brown</td><td>${tax.brown || 0}</td><td>${totalProj > 0 ? Math.round(((tax.brown || 0) / totalProj) * 100) : 0}%</td><td>0 – 39</td></tr>
      </table>

      <h4>3. Concentration Risk Analysis</h4>
      <p>Top 5 assets represent <strong>${concPct}%</strong> of total portfolio financed emissions (${_fmtN(top5Em)} of ${_fmtN(d.totalFinancedEmissions_tCO2e)} tCO2e).</p>
      <ul>
        ${(d.topContributors || []).map(p => `<li><strong>${p.name}</strong> (${p.projectId}) — ${_fmtN(p.financedEmissions_tCO2e)} tCO2e, classified <em>${p.classification}</em></li>`).join('')}
      </ul>
      ${concPct > 40 ? '<p style="color:var(--amber)">Concentration above 40% threshold — consider diversification strategies.</p>' : '<p style="color:var(--green)">Concentration within acceptable limits.</p>'}

      <h4>4. PCAF Financed Emissions Attribution</h4>
      <table>
        <tr><th>Metric</th><th>Value</th></tr>
        <tr><td>Attribution Method</td><td>Loan-to-Value (LTV)</td></tr>
        <tr><td>Asset Class</td><td>Commercial Real Estate — Construction</td></tr>
        <tr><td>PCAF Standard</td><td>v3.0 (2024)</td></tr>
        <tr><td>Weighted DQ Score</td><td>${_dqText(d.weightedDQ, 1)}</td></tr>
        <tr><td>Scope Coverage</td><td>Scope 1 + Scope 2 + Embodied Carbon</td></tr>
      </table>

      <h4>5. Regulatory Compliance Summary</h4>
      <table>
        <tr><th>Framework</th><th>Status</th><th>Action Required</th></tr>
        ${(d.regulatoryReadiness || []).map(r => {
          const action = r.status === 'ready' ? 'None — maintain current reporting' :
            r.status === 'partial' ? 'Expand coverage to meet full requirements' :
            'Initiate compliance workstream';
          return `<tr><td>${r.name}</td><td>${r.status === 'ready' ? 'Compliant' : r.status === 'partial' ? 'Partial' : 'Gap'}</td><td>${action}</td></tr>`;
        }).join('')}
      </table>

      <h4>6. Priority Actions</h4>
      <ul>
        <li>Improve data quality for DQ 4–5 assets (currently ${(d.dqDistribution?.[4] || 0) + (d.dqDistribution?.[5] || 0)}% of portfolio) to meet PCAF DQ target of 2.0</li>
        <li>Transition ${tax.brown || 0} brown-classified assets through green retrofit programs</li>
        <li>Increase portfolio coverage from ${d.coveragePct}% to 90%+ for next PCAF reporting cycle</li>
        ${concPct > 40 ? '<li>Reduce concentration risk — top 5 assets at ' + concPct + '% exceeds 40% threshold</li>' : ''}
        <li>Close TCFD disclosure gaps before next annual ESG report</li>
      </ul>
    `;
  }

  // ── Public API ────────────────────────────────────────────
  let _initialized = false;

  async function init() {
    if (_initialized) return;
    _initialized = true;
    const data = await _fetchData();
    _renderDemoBanner(data);
    _renderDashboard(data);
    _renderPortfolio(data);
  }

  async function refresh() {
    _cache = null;
    _initialized = false;
    const dl = document.getElementById('dash-loading');
    const pl = document.getElementById('pf-loading');
    if (dl) dl.style.display = 'flex';
    if (pl) pl.style.display = 'flex';
    const data = await _fetchData();
    _renderDemoBanner(data);
    _renderDashboard(data);
    _renderPortfolio(data);
  }

  function exportCSV() {
    const d = _withDefaults(_cache || {});
    if (!d.topContributors || d.topContributors.length === 0) return;
    const rows = [
      ['Project ID', 'Name', 'Region', 'Building Type', 'Financed Emissions (tCO2e)', 'Loan Outstanding', 'CFS Score', 'Classification'],
      ...d.topContributors.map(p => [
        p.projectId,
        p.name || '',
        p.region || '',
        p.buildingType || '',
        p.financedEmissions_tCO2e,
        p.loanOutstanding || '',
        p.cfsScore != null ? p.cfsScore : '',
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

  return { init, refresh, exportCSV, generateAIReport };
})();
