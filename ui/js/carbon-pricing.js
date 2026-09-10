/* Not yet under `// @ts-check`, and on `docs/TYPECHECK-WORKLIST.md`.
   It carries real type errors — this code was written inside an HTML file,
   where no checker ever saw it. A file joins the check when its errors are
   fixed, never by adding the pragma, so fixing them is its own change rather
   than something smuggled into the one that moved the file. */
/* ============================================================
   CarbonIQ — Carbon pricing
   ui/js/carbon-pricing.js
   ============================================================
   Lifted out of `ui/pages/carbon-pricing.html`, where it did not run.

   A page fragment is inserted with `innerHTML`, and a `<script>` inserted
   that way is never executed — the browser parses it into the DOM and
   leaves it inert. So this module was never defined, and every control on
   the page threw a ReferenceError the moment it was clicked. The page
   loader hid it: `init: () => typeof carbonpricingPage !== 'undefined' && …`
   silently did nothing rather than failing where somebody would see it.

   Loaded as a real script by index.html, which is also what lets
   `script-src` drop `'unsafe-inline'`.
   ============================================================ */

'use strict';

const CarbonPricingPage = (() => {
  const API_BASE = window.CARBONIQ_API_BASE || '';

  // ── Score preview ──────────────────────────────────────────
  function _updateScorePreview() {
    const score = parseInt(document.getElementById('cp-score').value, 10) || 0;
    document.getElementById('cpScoreValue').textContent = score;

    const pillEl  = document.getElementById('cpClassPill');
    const hintEl  = document.getElementById('cpScoreHint');

    /* Neither the tier boundaries nor the pricing figures are held here. They
       were, in prose — "≥ 70", "−20 bps", "+12 bps improvement" — beside an
       engine that owns all three, so changing a tier would have left three
       sentences a credit officer reads saying something false. `_tiers` is
       what `GET /v1/carbon-pricing/rates` served. */
    pillEl.className = 'cp-class-pill';
    if (!_tiers) {
      pillEl.textContent = '—';
      hintEl.textContent = 'Pricing tiers have not loaded, so no tier is shown.';
      return;
    }

    const ordered = [..._tiers].sort((a, b) => (b.minScore || 0) - (a.minScore || 0));
    const tier = ordered.find(t => score >= (t.minScore || 0)) || ordered[ordered.length - 1];
    const better = ordered.filter(t => (t.minScore || 0) > score).pop();

    pillEl.textContent = tier.label;
    pillEl.classList.add(tier.adjustment_bps < 0
      ? (better ? 'status-amber' : 'status-green') : 'status-red');

    if (!better) {
      hintEl.textContent = `Best pricing tier — ${tier.adjustment_bps} bps`;
    } else {
      const gain = (tier.adjustment_bps || 0) - (better.adjustment_bps || 0);
      hintEl.textContent = `Raise to ${better.minScore} for ${better.label}`
        + (gain > 0 ? ` — ${gain} bps better` : '');
    }
  }

  // ── Calculate ──────────────────────────────────────────────
  async function calculate() {
    const payload = {
      emissions_tCO2e:  parseFloat(document.getElementById('cp-emissions').value)     || 0,
      loanAmount:       parseFloat(document.getElementById('cp-loan').value)           || 0,
      projectValue:     parseFloat(document.getElementById('cp-project-value').value)  || 0,
      region:           document.getElementById('cp-region').value,
      cfsScore:         parseFloat(document.getElementById('cp-score').value)          || 50,
      loanTerm_years:   parseInt(document.getElementById('cp-term').value, 10)         || 5,
    };

    const area = parseFloat(document.getElementById('cp-area').value);
    if (area > 0) payload.buildingArea_m2 = area;

    _showLoading();

    try {
      const res = await window.CARBONIQ_fetch('/v1/carbon-pricing/calculate', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || `Server error ${res.status}`);
      }

      const data = await res.json();
      _renderResults(data);

    } catch (err) {
      _showError(err.message);
    }
  }

  // ── Render ─────────────────────────────────────────────────
  function _renderResults(d) {
    document.getElementById('cpIdle').style.display    = 'none';
    document.getElementById('cpLoading').style.display = 'none';
    document.getElementById('cpResults').style.display = 'block';

    const { inputs, taxExposure, loanPricing, strandedRisk, sensitivity, summary } = d;

    // Attribution bar
    document.getElementById('cpAttrBar').innerHTML = `
      <span class="cp-attr-item"><strong>${_fmt(inputs.financedEmissions_tCO2e)} tCO2e</strong> financed emissions</span>
      <span class="cp-attr-sep">·</span>
      <span class="cp-attr-item">Attribution factor <strong>${inputs.attributionFactor}</strong></span>
      <span class="cp-attr-sep">·</span>
      <span class="cp-attr-item">$<strong>${_fmt(inputs.loanAmount)}</strong> / $<strong>${_fmt(inputs.projectValue)}</strong> project</span>`;

    // Summary
    document.getElementById('cpSummaryBox').innerHTML =
      summary.map(s => `<div class="cp-summary-item">• ${s}</div>`).join('');

    // ── Tax Exposure ──
    document.getElementById('taxRegionLabel').textContent = inputs.region + ' · Annual (current rate)';
    document.getElementById('taxCurrentUSD').textContent =
      taxExposure.annualExposure_USD > 0 ? `$${_fmt(taxExposure.annualExposure_USD)}` : '—';
    document.getElementById('taxCurrentLocal').textContent =
      taxExposure.annualExposure_USD > 0
        ? `${taxExposure.currency} ${_fmt(taxExposure.annualExposure_local)} / yr`
        : `No current carbon tax in ${inputs.region}`;
    document.getElementById('taxPeakNote').textContent =
      `Peak by ${taxExposure.peakExposure.year}: $${_fmt(taxExposure.peakExposure.USD)} (${taxExposure.currency} ${_fmt(taxExposure.peakExposure.local)})`;

    // Trajectory mini-chart
    const maxRate = Math.max(...taxExposure.trajectory.map(t => t.usdAmount));
    document.getElementById('taxTrajectory').innerHTML = taxExposure.trajectory.map(t => `
      <div class="cp-traj-row">
        <span class="cp-traj-year">${t.year}</span>
        <div class="cp-traj-bar-wrap">
          <div class="cp-traj-bar" style="width:${maxRate > 0 ? Math.round((t.usdAmount / maxRate) * 100) : 0}%"></div>
        </div>
        <span class="cp-traj-val">$${_fmt(t.usdAmount)}</span>
      </div>`).join('');

    // ── Loan Pricing ──
    const bps = loanPricing.adjustment_bps;
    document.getElementById('pricingClassLabel').textContent = loanPricing.classification;
    document.getElementById('pricingBps').textContent = (bps <= 0 ? '' : '+') + bps;
    document.getElementById('pricingBps').className =
      'cp-metric-value ' + (bps < 0 ? 'cp-val-green' : bps > 0 ? 'cp-val-red' : 'cp-val-neutral');
    document.getElementById('pricingSaving').textContent =
      loanPricing.financialImpact.annualInterestSaving_USD > 0
        ? `$${_fmt(loanPricing.financialImpact.annualInterestSaving_USD)}/yr saving — $${_fmt(loanPricing.financialImpact.npvSaving_USD)} NPV over ${loanPricing.financialImpact.loanTerm_years}yr`
        : 'No interest saving at current score';
    document.getElementById('pricingUpgrade').textContent = loanPricing.upgradeOpportunity;

    // ── Stranded Asset Risk ──
    const riskLevel = strandedRisk.riskLevel;
    const iconEl    = document.getElementById('strandedIcon');
    iconEl.className = `cp-metric-icon cp-icon-${riskLevel === 'high' ? 'red' : riskLevel === 'medium' ? 'amber' : 'green'}`;
    document.getElementById('strandedLevel').innerHTML =
      `<span class="cp-risk-pill cp-risk-${riskLevel}">${riskLevel.toUpperCase()}</span>`;
    document.getElementById('strandedExposure').textContent =
      `$${_fmt(strandedRisk.financialImpairment.lenderExposure_USD)}`;
    document.getElementById('strandedRefi').textContent = strandedRisk.refinancingRisk;

    // Mitigation actions (inside stranded card)
    const mit = strandedRisk.mitigationActions || [];
    if (mit.length) {
      const mitigationCard = document.getElementById('cpMitigationCard');
      const mitigationList = document.getElementById('cpMitigationList');
      mitigationList.innerHTML = mit.map(a => `<li>${a}</li>`).join('');
      mitigationCard.style.display = 'block';
    }

    // ── Sensitivity Table ──
    const tbody = document.querySelector('#sensitivityTable tbody');
    const currentUSD = taxExposure.annualExposure_USD;
    tbody.innerHTML = sensitivity.table.map(row => {
      const delta = row.annualTax_USD - currentUSD;
      const sign  = delta >= 0 ? '+' : '';
      const cls   = delta > 0 ? 'cp-delta-up' : delta < 0 ? 'cp-delta-down' : '';
      const isCurrent = row.carbonPrice_USD === taxExposure.currentRate_local;
      return `<tr class="${isCurrent ? 'cp-row-current' : ''}">
        <td>$${row.carbonPrice_USD}/tCO2e ${isCurrent ? '<span class="cp-now-tag">now</span>' : ''}</td>
        <td>$${_fmt(row.annualTax_USD)}</td>
        <td class="${cls}">${sign}$${_fmt(Math.abs(delta))}</td>
      </tr>`;
    }).join('');
  }

  // ── State helpers ──────────────────────────────────────────
  function _showLoading() {
    document.getElementById('cpIdle').style.display    = 'none';
    document.getElementById('cpResults').style.display = 'none';
    document.getElementById('cpLoading').style.display = 'flex';
  }

  function _showError(msg) {
    document.getElementById('cpLoading').style.display = 'none';
    document.getElementById('cpIdle').style.display    = 'none';
    document.getElementById('cpResults').style.display = 'none';
    document.getElementById('cpResultsPanel').insertAdjacentHTML('afterbegin',
      `<div class="rpt-error" style="margin-bottom:12px">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="#ef4444" stroke-width="1.4"/><path d="M7 4v3M7 9.5v.5" stroke="#ef4444" stroke-width="1.4" stroke-linecap="round"/></svg>
        ${msg}
      </div>`);
  }

  function reset() {
    document.getElementById('cpIdle').style.display    = 'block';
    document.getElementById('cpLoading').style.display = 'none';
    document.getElementById('cpResults').style.display = 'none';
    document.querySelectorAll('.rpt-error').forEach(e => e.remove());
  }

  function _fmt(n) {
    return Number(n || 0).toLocaleString('en-US');
  }

  /** The pricing tiers in force, and the score each begins at. */
  let _tiers = null;

  async function loadTiers() {
    const res = await window.CARBONIQ_fetch('/v1/carbon-pricing/rates');
    _tiers = res.loanPricingTiers || null;
  }

  function init() {
    // Wire live score preview
    const scoreInput = document.getElementById('cp-score');
    if (scoreInput) {
      scoreInput.addEventListener('input', _updateScorePreview);
    }
    /* The tiers are fetched before the first preview is drawn, not after it:
       a preview drawn on a tier table that has not arrived is a preview drawn
       on nothing. */
    loadTiers()
      .catch(() => { _tiers = null; })
      .then(() => _updateScorePreview());
  }

  return { calculate, reset, init };
})();
