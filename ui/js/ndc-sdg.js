/* ============================================================
   CarbonIQ — NDC & SDG Alignment Module
   Powered by Claude AI | Sri Lanka Green Finance Taxonomy
   ============================================================ */

const NdcSdgPage = (() => {
  // SLGFT activity lookup (mirrors services/ndc-sdg.js & ui/js/taxonomy.js)
  const ACTIVITIES = {
    'M1.1': { label: 'Green Buildings — New Construction',   eligibility: 'threshold', objective: 'M', note: 'Threshold: ≤600 kgCO2e/m²' },
    'M1.2': { label: 'Green Buildings — Renovation',          eligibility: 'direct',    objective: 'M', note: '≥30% energy performance improvement' },
    'M4.1': { label: 'Solar PV — Electricity Generation',    eligibility: 'direct',    objective: 'M', note: 'Directly eligible' },
    'M4.2': { label: 'Concentrated Solar Power (CSP)',         eligibility: 'direct',    objective: 'M', note: 'Directly eligible' },
    'M4.3': { label: 'Wind Energy',                           eligibility: 'direct',    objective: 'M', note: 'Directly eligible' },
    'M6.1': { label: 'Clean Transportation Infrastructure',   eligibility: 'direct',    objective: 'M', note: 'Directly eligible' },
    'A2.1': { label: 'Flood-Resilient Construction',          eligibility: 'direct',    objective: 'A', note: 'Directly eligible' },
    'A2.2': { label: 'Climate-Resilient Buildings',           eligibility: 'threshold', objective: 'A', note: 'Climate risk assessment required' },
    'E1.1': { label: 'Coastal & Marine Resource Protection',  eligibility: 'direct',    objective: 'E', note: 'Directly eligible' },
    'E3.1': { label: 'Sustainable Land Use & Biodiversity',   eligibility: 'direct',    objective: 'E', note: 'Directly eligible' },
  };

  const SDG_META = {
    7:  { label: 'Affordable & Clean Energy',        emoji: '⚡', color: '#FCC30B' },
    9:  { label: 'Industry, Innovation & Infrastructure', emoji: '🏗️', color: '#FD6925' },
    11: { label: 'Sustainable Cities & Communities',  emoji: '🏙️', color: '#FD9D24' },
    13: { label: 'Climate Action',                    emoji: '🌡️', color: '#3F7E44' },
    14: { label: 'Life Below Water',                  emoji: '🌊', color: '#0A97D9' },
    15: { label: 'Life on Land',                      emoji: '🌳', color: '#56C02B' },
  };

  function $$(id) { return document.getElementById(id); }

  // ── Init ─────────────────────────────────────────────────────
  let _initialized = false;
  function init() {
    if (_initialized) return;
    _initialized = true;
  }

  // ── Activity code live lookup ─────────────────────────────────
  function onActivityInput(code) {
    const el = $$('ndc-activity-desc');
    if (!el) return;
    const upper = (code || '').trim().toUpperCase();
    const match = ACTIVITIES[upper];
    if (match) {
      const badge = match.eligibility === 'direct'
        ? '<span style="background:var(--blue-50,#eff6ff);color:var(--blue-600,#2563eb);padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600">Direct Eligibility</span>'
        : '<span style="background:var(--green-50,#f0fdf4);color:var(--green-600,#16a34a);padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600">Threshold-Based</span>';
      el.style.display = 'block';
      el.innerHTML = `${badge} <strong>${match.label}</strong><br><small style="color:var(--text-tertiary)">${match.note}</small>`;
    } else {
      el.style.display = upper.length > 2 ? 'block' : 'none';
      if (upper.length > 2) el.innerHTML = `<span style="color:var(--text-tertiary);font-size:13px">No match for "${upper}". Try M1.1, M4.1, A2.1, E1.1…</span>`;
    }
    calcIntensity();
  }

  // ── Live intensity calculation ────────────────────────────────
  function calcIntensity() {
    const emissions = parseFloat($$('ndc-emissions')?.value || 0);
    const area      = parseFloat($$('ndc-area')?.value || 0);
    const bar = $$('ndc-intensity-bar');
    const val = $$('ndc-intensity-value');
    const badge = $$('ndc-intensity-badge');
    if (!bar) return;

    if (emissions > 0 && area > 0) {
      const intensity = Math.round((emissions * 1000) / area);
      bar.style.display = 'flex';
      val.textContent = intensity + ' kgCO2e/m²';
      if (intensity <= 600) {
        badge.className = 'kpi-badge badge-green'; badge.textContent = 'Green (≤600)';
      } else if (intensity <= 900) {
        badge.className = 'kpi-badge badge-amber'; badge.textContent = 'Transition (≤900)';
      } else {
        badge.className = 'kpi-badge badge-red'; badge.textContent = 'Not Aligned (>900)';
      }
    } else {
      bar.style.display = 'none';
    }
  }

  // ── Run AI Assessment ─────────────────────────────────────────
  async function runAssessment() {
    const name = $$('ndc-proj-name')?.value?.trim();
    if (!name) {
      if (typeof Toast !== 'undefined') Toast.error('Project name is required.');
      return;
    }

    const btn = $$('ndc-assess-btn');
    const status = $$('ndc-status-msg');
    if (btn) btn.disabled = true;
    if (status) { status.textContent = 'Running AI analysis…'; status.style.color = 'var(--text-secondary)'; }

    const payload = {
      name,
      buildingType:    $$('ndc-building-type')?.value || undefined,
      slsicSector:     $$('ndc-slsic')?.value || undefined,
      activityCode:    ($$('ndc-activity-code')?.value || '').trim().toUpperCase() || undefined,
      emissions_tCO2e: parseFloat($$('ndc-emissions')?.value) || undefined,
      buildingArea_m2: parseFloat($$('ndc-area')?.value) || undefined,
      reductionPct:    parseFloat($$('ndc-reduction')?.value) || undefined,
      hasEPD:          $$('ndc-has-epd')?.checked || false,
      hasLCA:          $$('ndc-has-lca')?.checked || false,
      region:          'LK',
    };

    // Remove undefined keys
    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

    try {
      const res = await window.CARBONIQ_fetch('/v1/ndc-sdg/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}`);
      }

      const data = await res.json();
      _lastAnalysis = data;
      _renderResults(data);
      if (status) { status.textContent = '✓ Analysis complete'; status.style.color = 'var(--green-600,#16a34a)'; }
      if (typeof Toast !== 'undefined') Toast.success('NDC/SDG assessment complete.');
    } catch (err) {
      if (status) { status.textContent = '✗ ' + err.message; status.style.color = 'var(--red)'; }
      if (typeof Toast !== 'undefined') Toast.error('Assessment failed: ' + err.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ── Render results ────────────────────────────────────────────
  function _renderResults(data) {
    const panel = $$('ndc-results');
    if (!panel) return;
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const a = data.analysis || {};
    const ndc = a.ndcAlignment || {};
    const dnsh = a.dnshAssessment || {};
    const sdgs = a.sdgAlignment || [];

    // NDC tier badge
    const tierBadge = $$('ndc-tier-badge');
    if (tierBadge) {
      const tierClass = { strong: 'badge-green', moderate: 'badge-blue', partial: 'badge-amber', not_aligned: 'badge-red' }[ndc.tier] || 'badge-neutral';
      tierBadge.className = `kpi-badge ${tierClass}`;
      tierBadge.textContent = ndc.label || ndc.tier || '—';
    }

    // Contribution bar
    const pct = Math.min(100, Math.max(0, ndc.ndcContribution_pct || 0));
    const fill = $$('ndc-contribution-fill');
    const label = $$('ndc-contribution-label');
    if (fill) fill.style.width = pct + '%';
    if (label) label.textContent = `${pct}% estimated NDC contribution`;

    // Explanation
    const expEl = $$('ndc-explanation');
    if (expEl) expEl.textContent = ndc.explanation || '';

    // Key drivers
    const driversEl = $$('ndc-key-drivers');
    if (driversEl && ndc.keyDrivers?.length) {
      driversEl.innerHTML = '<div class="ndc-drivers-title">Key Drivers</div>' +
        ndc.keyDrivers.map(d => `<div class="ndc-driver-item">▸ ${d}</div>`).join('');
    }

    // Bankability narrative
    const narEl = $$('ndc-narrative');
    if (narEl) narEl.textContent = a.bankabilityNarrative || '—';

    // Confidence
    const confEl = $$('ndc-confidence');
    if (confEl && a.confidenceScore != null) {
      const confClass = a.confidenceScore >= 75 ? 'badge-green' : a.confidenceScore >= 50 ? 'badge-amber' : 'badge-red';
      confEl.innerHTML = `<span style="font-size:12px;color:var(--text-tertiary)">AI Confidence: </span><span class="kpi-badge ${confClass}">${a.confidenceScore}%</span>`;
    }

    // SDG grid
    const sdgGrid = $$('ndc-sdg-grid');
    if (sdgGrid) {
      sdgGrid.innerHTML = sdgs.map(s => {
        const meta = SDG_META[s.sdg] || { emoji: '🌐', color: '#6B7280', label: `SDG ${s.sdg}` };
        const relClass = { high: 'ndc-sdg-high', medium: 'ndc-sdg-medium', low: 'ndc-sdg-low' }[s.relevance] || '';
        return `
          <div class="ndc-sdg-item ${relClass}" style="border-left:3px solid ${meta.color}">
            <div class="ndc-sdg-num">${meta.emoji} SDG ${s.sdg}</div>
            <div class="ndc-sdg-label">${s.label || meta.label}</div>
            <div class="ndc-sdg-relevance">${s.relevance?.toUpperCase() || ''}</div>
            <div class="ndc-sdg-rationale">${s.rationale || ''}</div>
          </div>`;
      }).join('');
    }

    // DNSH
    const dnshBadge = $$('ndc-dnsh-badge');
    if (dnshBadge) {
      const dnshClass = { pass: 'badge-green', conditional: 'badge-amber', fail: 'badge-red' }[dnsh.overallStatus] || 'badge-neutral';
      dnshBadge.className = `kpi-badge ${dnshClass}`;
      dnshBadge.textContent = dnsh.overallStatus?.toUpperCase() || '—';
    }

    const dnshChecks = $$('ndc-dnsh-checks');
    if (dnshChecks && dnsh.checks?.length) {
      dnshChecks.innerHTML = dnsh.checks.map(c => {
        const icon = c.status === 'pass' ? '✅' : c.status === 'conditional' ? '⚠️' : '❌';
        return `<div class="ndc-dnsh-row">${icon} <strong>[${c.objective}] ${c.label}</strong><br><span style="color:var(--text-secondary);font-size:13px">${c.note}</span></div>`;
      }).join('');
    }

    // Recommendations
    const recsList = $$('ndc-recommendations');
    if (recsList && a.recommendations?.length) {
      recsList.innerHTML = a.recommendations.map(r => `<li>${r}</li>`).join('');
    }
  }

  // ── SLGFT Framework panel ─────────────────────────────────────
  async function loadFramework() {
    const panel = $$('ndc-framework-panel');
    const body  = $$('ndc-framework-body');
    if (!panel || !body) return;
    panel.style.display = 'block';
    body.textContent = 'Loading framework data…';
    panel.scrollIntoView({ behavior: 'smooth' });

    try {
      const res = await window.CARBONIQ_fetch('/v1/ndc-sdg/framework');
      if (!res.ok) throw new Error(`API ${res.status}`);
      const f = await res.json();
      body.innerHTML = `
        <div class="ndc-framework-grid">
          <div>
            <strong>Framework:</strong> ${f.framework || '—'}<br>
            <strong>Version:</strong> ${f.version || '—'}<br>
            <strong>Regulator:</strong> ${f.regulator || '—'}
          </div>
          <div>
            <strong>NDC Targets:</strong><br>
            Unconditional: ${f.ndcTargets?.unconditional || '—'}<br>
            Conditional: ${f.ndcTargets?.conditional || '—'}<br>
            Net Zero: ${f.ndcTargets?.netZeroTarget || '—'}<br>
            Key SDGs: ${(f.ndcTargets?.keySDGs || []).map(s => `<span class="slgft-sdg-pill">SDG ${s}</span>`).join(' ')}
          </div>
        </div>
        <div style="margin-top:16px">
          <strong>Embodied Carbon Thresholds:</strong>
          <span class="kpi-badge badge-green" style="margin-left:8px">Green: ≤${f.thresholds?.green} kgCO2e/m²</span>
          <span class="kpi-badge badge-amber" style="margin-left:4px">Transition: ≤${f.thresholds?.transition} kgCO2e/m²</span>
        </div>
        <div style="margin-top:16px">
          <strong>Construction Activities (${(f.activities||[]).length}):</strong>
          <table class="data-table" style="margin-top:8px">
            <thead><tr><th>Code</th><th>Label</th><th>Eligibility</th><th>Objective</th></tr></thead>
            <tbody>
              ${(f.activities||[]).map(a => `<tr>
                <td><strong>${a.code}</strong></td>
                <td>${a.label}</td>
                <td>${a.eligibility === 'direct' ? '<span class="kpi-badge badge-blue" style="font-size:11px">Direct</span>' : '<span class="kpi-badge badge-green" style="font-size:11px">Threshold</span>'}</td>
                <td>${a.objective}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    } catch (err) {
      body.textContent = 'Failed to load framework: ' + err.message;
    }
  }

  function hideFramework() {
    const panel = $$('ndc-framework-panel');
    if (panel) panel.style.display = 'none';
  }

  // ── Certificate generation ────────────────────────────────
  // Store last AI analysis result so certificate can reference it
  let _lastAnalysis = null;

  async function generateCertificate() {
    const bankName = $$('ndc-cert-bank')?.value?.trim();
    if (!bankName) {
      if (typeof Toast !== 'undefined') Toast.error('Please enter the issuing bank name.');
      return;
    }

    const btn    = $$('ndc-cert-btn');
    const status = $$('ndc-cert-status');
    if (btn) btn.disabled = true;
    if (status) { status.textContent = 'Generating certificate…'; status.style.color = 'var(--text-secondary)'; }

    const payload = {
      projectName:     $$('ndc-proj-name')?.value?.trim() || 'SLGFT Project',
      projectId:       $$('ndc-proj-id')?.value?.trim() || undefined,
      bankName,
      slsicSector:     $$('ndc-slsic')?.value || undefined,
      activityCode:    ($$('ndc-activity-code')?.value || '').trim().toUpperCase() || undefined,
      emissions_tCO2e: parseFloat($$('ndc-emissions')?.value) || undefined,
      buildingArea_m2: parseFloat($$('ndc-area')?.value) || undefined,
      loanAmount_M:    parseFloat($$('ndc-cert-loan')?.value) || undefined,
      currency:        'LKR',
    };

    // Enrich from AI analysis if available
    if (_lastAnalysis) {
      const ndc = _lastAnalysis.analysis?.ndcAlignment;
      const dnsh = _lastAnalysis.analysis?.dnshAssessment;
      const sdgList = _lastAnalysis.analysis?.sdgAlignment;
      if (ndc?.tier)            payload.ndcTier = ndc.tier;
      if (ndc?.ndcContribution_pct != null) payload.ndcContrib_pct = ndc.ndcContribution_pct;
      if (dnsh?.overallStatus)  payload.dnshStatus = dnsh.overallStatus;
      if (sdgList?.length)      payload.sdgs = sdgList.map(s => s.sdg);
    }

    // Remove undefined keys
    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

    try {
      const res = await window.CARBONIQ_fetch('/v1/ndc-sdg/certificate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `API ${res.status}`);
      }

      const data = await res.json();
      const cert = data.certificate;
      _renderCertificate(cert);
      if (status) { status.textContent = '✓ Certificate generated'; status.style.color = 'var(--green-600,#16a34a)'; }
      if (typeof Toast !== 'undefined') Toast.success(`SLGFT certificate generated (${cert.certId})`);
    } catch (err) {
      if (status) { status.textContent = '✗ ' + err.message; status.style.color = 'var(--red)'; }
      if (typeof Toast !== 'undefined') Toast.error('Certificate failed: ' + err.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function _renderCertificate(cert) {
    const el = $$('ndc-cert-result');
    if (!el) return;

    const tierClass = {
      green: 'badge-green', transition: 'badge-amber',
      directly_eligible: 'badge-blue', conditional: 'badge-red',
    }[cert.classification?.tier] || 'badge-neutral';

    const sdgPills = (cert.sdgAlignment?.sdgs || []).map(n =>
      `<span class="slgft-sdg-pill">SDG ${n}</span>`
    ).join(' ');

    el.style.display = 'block';
    el.innerHTML = `
      <div class="ndc-cert-display">
        <div class="ndc-cert-header">
          <div>
            <div class="ndc-cert-title">SLGFT Green Loan Certificate</div>
            <div class="ndc-cert-id">${cert.certId}</div>
          </div>
          <span class="kpi-badge ${tierClass}">${cert.classification?.tierLabel || cert.classification?.tier}</span>
        </div>
        <div class="ndc-cert-grid">
          <div><span class="ndc-cert-label">Project</span><strong>${cert.project?.name}</strong></div>
          <div><span class="ndc-cert-label">Bank</span><strong>${cert.loanDetails?.bankName}</strong></div>
          <div><span class="ndc-cert-label">Activity Code</span><strong>${cert.project?.activityCode || '—'}</strong></div>
          <div><span class="ndc-cert-label">Intensity</span><strong>${cert.project?.intensity_kgCO2e_m2 !== null ? cert.project.intensity_kgCO2e_m2 + ' kgCO2e/m²' : '—'}</strong></div>
          <div><span class="ndc-cert-label">Loan Type</span><strong>${cert.loanDetails?.loanClassification}</strong></div>
          <div><span class="ndc-cert-label">Pricing Adjustment</span><strong>${cert.loanDetails?.pricingLabel}</strong></div>
          <div><span class="ndc-cert-label">NDC Tier</span><strong>${cert.ndcAlignment?.tier || '—'}</strong></div>
          <div><span class="ndc-cert-label">NDC Contribution</span><strong>${cert.ndcAlignment?.contribution_pct != null ? cert.ndcAlignment.contribution_pct + '%' : '—'}</strong></div>
          <div><span class="ndc-cert-label">DNSH Status</span><strong>${cert.dnsh?.status?.toUpperCase() || '—'}</strong></div>
          <div><span class="ndc-cert-label">Valid Until</span><strong>${cert.expiresAt ? cert.expiresAt.slice(0, 10) : '—'}</strong></div>
        </div>
        ${sdgPills ? `<div style="margin:10px 0"><span class="ndc-cert-label">SDG Alignment</span><div class="slgft-sdg-row" style="margin-top:5px">${sdgPills}</div></div>` : ''}
        <div class="ndc-cert-description">${cert.classification?.description || ''}</div>
        <div class="ndc-cert-hash">
          <span style="font-weight:600;color:var(--text-secondary)">SHA-256 Audit Hash:</span>
          <code style="font-size:10px;color:var(--text-tertiary);word-break:break-all">${cert.hash}</code>
        </div>
        <div style="margin-top:12px;display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="NdcSdgPage.copyCertHash('${cert.hash}')">Copy Hash</button>
          <button class="btn btn-ghost btn-sm" onclick="NdcSdgPage.downloadCert(${JSON.stringify(JSON.stringify(cert))})">Download JSON</button>
        </div>
      </div>`;
  }

  function copyCertHash(hash) {
    navigator.clipboard?.writeText(hash);
    if (typeof Toast !== 'undefined') Toast.info('Hash copied to clipboard.');
  }

  function downloadCert(certStr) {
    const cert = JSON.parse(certStr);
    const blob = new Blob([JSON.stringify(cert, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${cert.certId}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  return {
    init, onActivityInput, calcIntensity, runAssessment,
    loadFramework, hideFramework,
    generateCertificate, copyCertHash, downloadCert,
  };
})();
