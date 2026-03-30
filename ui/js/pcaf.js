/* ============================================================
   CarbonIQ — PCAF Calculator Module
   Handles all logic for the PCAF Calculator page (page-pcaf):
     · Real-time attribution factor calculation from form inputs
     · Scope 1/2/3 breakdown by project type & phase
     · Reset to defaults
     · Save & Copy results to clipboard
     · Export PDF via POST /v1/reports/generate
   ============================================================ */

const PCAFCalculator = (() => {

  // ── Constants ────────────────────────────────────────────────

  const DEFAULTS = {
    projectName:   'Marina Bay Tower',
    loanId:        'SG-2024-001',
    outstanding:   50000000,
    currency:      'USD',
    equity:        80000000,
    debt:          120000000,
    emissions:     10000,
    projectPhase:  'Operational',
    projectType:   'Commercial',
    dq:            '2',
  };

  const DQ_LABELS = {
    '1': 'Verified Reported',
    '2': 'Unverified Reported',
    '3': 'Physical Activity-Based',
    '4': 'Economic (Revenue Known)',
    '5': 'Economic (Revenue Unknown)',
  };

  // Scope split by project type + phase.
  // Construction phase is always dominated by Scope 3 (embodied carbon).
  const SCOPE_SPLITS = {
    Construction: { s1: 0.08, s2: 0.14, s3: 0.78 },
    Operational: {
      Commercial:     { s1: 0.08, s2: 0.42, s3: 0.50 },
      Residential:    { s1: 0.15, s2: 0.35, s3: 0.50 },
      Industrial:     { s1: 0.35, s2: 0.40, s3: 0.25 },
      Infrastructure: { s1: 0.20, s2: 0.30, s3: 0.50 },
      'Mixed-Use':    { s1: 0.10, s2: 0.40, s3: 0.50 },
    },
  };

  // ── Helpers ──────────────────────────────────────────────────

  function _fmt(n) {
    return Number(n || 0).toLocaleString('en-US');
  }

  function _fmtMoney(n, currency) {
    return `${currency} ${_fmt(n)}`;
  }

  function _round(n, decimals = 1) {
    const factor = Math.pow(10, decimals);
    return Math.round(n * factor) / factor;
  }

  function _val(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
  }

  function _num(id) {
    return parseFloat(_val(id)) || 0;
  }

  function _getScopeSplit(phase, type) {
    if (phase === 'Construction') return SCOPE_SPLITS.Construction;
    return SCOPE_SPLITS.Operational[type] || SCOPE_SPLITS.Operational.Commercial;
  }

  function _showError(msg) {
    const el = document.getElementById('pcaf-error');
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  }

  function _clearError() {
    _showError('');
  }

  // ── Core Calculation ─────────────────────────────────────────

  function calculate() {
    _clearError();

    const outstanding  = _num('pcaf-outstanding');
    const equity       = _num('pcaf-equity');
    const debt         = _num('pcaf-debt');
    const emissions    = _num('pcaf-emissions');
    const projectName  = _val('pcaf-project-name') || 'Unnamed Project';
    const loanId       = _val('pcaf-loan-id') || '—';
    const currency     = _val('pcaf-currency') || 'USD';
    const projectType  = _val('pcaf-project-type') || 'Commercial';
    const projectPhase = _val('pcaf-project-phase') || 'Operational';
    const dqScore      = document.querySelector('input[name="dq"]:checked')?.value || '2';

    // Validation
    if (outstanding <= 0) { _showError('Outstanding amount must be greater than 0.'); return; }
    if (equity < 0 || debt < 0) { _showError('Equity and debt cannot be negative.'); return; }
    if (emissions <= 0) { _showError('Project emissions must be greater than 0.'); return; }

    const totalValue = equity + debt;
    if (totalValue <= 0) { _showError('Total project value (Equity + Debt) must be greater than 0.'); return; }

    // PCAF attribution: Outstanding / (Equity + Debt), capped at 1
    const attribution      = Math.min(1, outstanding / totalValue);
    const financedEmissions = _round(attribution * emissions, 1);
    const economicIntensity = outstanding > 0
      ? _round(financedEmissions / (outstanding / 1e6), 1)
      : 0;

    // Scope breakdown applied to financed emissions
    const split = _getScopeSplit(projectPhase, projectType);
    const s1    = _round(financedEmissions * split.s1, 1);
    const s2    = _round(financedEmissions * split.s2, 1);
    const s3    = _round(financedEmissions * split.s3, 1);

    // Bar widths relative to the largest scope
    const maxScope  = Math.max(s1, s2, s3, 1);
    const s1Pct     = Math.round((s1 / maxScope) * 100);
    const s2Pct     = Math.round((s2 / maxScope) * 100);
    const s3Pct     = Math.round((s3 / maxScope) * 100);

    // Render
    _render({
      attribution:       _round(attribution, 3),
      outstanding,
      equity,
      debt,
      totalValue,
      financedEmissions,
      economicIntensity,
      dqScore,
      dqLabel:           DQ_LABELS[dqScore] || '—',
      emissions,
      currency,
      projectName,
      loanId,
      s1, s2, s3,
      s1Pct, s2Pct, s3Pct,
      projectType,
      projectPhase,
    });

    // Store for export / copy
    window._pcafCurrentResult = {
      attribution, outstanding, equity, debt, totalValue,
      financedEmissions, economicIntensity, dqScore,
      dqLabel: DQ_LABELS[dqScore] || '—',
      emissions, currency, projectName, loanId,
      s1, s2, s3, projectType, projectPhase,
    };

    // Animate panel
    const panel = document.getElementById('resultsPanel');
    if (panel) {
      panel.style.animation = 'none';
      panel.offsetHeight;             // force reflow
      panel.style.animation = 'fadeIn 0.35s ease';
    }

    // Update badge
    const badge = document.getElementById('pcaf-results-badge');
    if (badge) {
      badge.textContent  = 'Calculated';
      badge.style.background = 'var(--green-bg)';
      badge.style.color      = 'var(--green)';
    }
  }

  // ── Render Results Panel ─────────────────────────────────────

  function _render(r) {
    // Hero card
    _setText('pcaf-result-attribution',     r.attribution.toFixed(3));
    _setText('pcaf-result-formula-num',     _fmtMoney(r.outstanding, r.currency));
    _setText('pcaf-result-formula-denom',   `(${_fmtMoney(r.equity, r.currency)} + ${_fmtMoney(r.debt, r.currency)})`);

    // Metric cards
    _setText('pcaf-result-financed',        _fmt(r.financedEmissions));
    _setText('pcaf-result-financed-calc',   `${r.attribution.toFixed(3)} × ${_fmt(r.emissions)} tCO2e`);

    // DQ badge
    const dqBadge = document.getElementById('pcaf-result-dq-badge');
    if (dqBadge) {
      dqBadge.className   = `dq-badge dq-${r.dqScore} dq-lg`;
      dqBadge.textContent = r.dqScore;
    }
    _setText('pcaf-result-dq-label', r.dqLabel);

    // Intensity & project value
    _setText('pcaf-result-intensity',            _fmt(r.economicIntensity));
    _setText('pcaf-result-project-value',        `${r.currency} ${_fmtShort(r.totalValue)}`);
    _setText('pcaf-result-project-value-label',  `${_fmtShort(r.equity)} equity + ${_fmtShort(r.debt)} debt`);

    // Scope bars
    _setScope('s1', r.s1, r.s1Pct);
    _setScope('s2', r.s2, r.s2Pct);
    _setScope('s3', r.s3, r.s3Pct);
  }

  function _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function _setScope(key, value, pct) {
    const bar = document.getElementById(`pcaf-scope-${key}-bar`);
    const val = document.getElementById(`pcaf-scope-${key}-val`);
    if (bar) bar.style.width = `${pct}%`;
    if (val) val.textContent = `${_fmt(value)} tCO2e`;
  }

  function _fmtShort(n) {
    if (n >= 1e9) return `$${_round(n / 1e9, 1)}B`;
    if (n >= 1e6) return `$${_round(n / 1e6, 1)}M`;
    if (n >= 1e3) return `$${_round(n / 1e3, 1)}K`;
    return `$${n}`;
  }

  // ── Reset ────────────────────────────────────────────────────

  function reset() {
    _clearError();

    // Restore all inputs to default values
    _setInput('pcaf-project-name',  DEFAULTS.projectName);
    _setInput('pcaf-loan-id',       DEFAULTS.loanId);
    _setInput('pcaf-outstanding',   DEFAULTS.outstanding);
    _setInput('pcaf-equity',        DEFAULTS.equity);
    _setInput('pcaf-debt',          DEFAULTS.debt);
    _setInput('pcaf-emissions',     DEFAULTS.emissions);
    _setSelect('pcaf-currency',      DEFAULTS.currency);
    _setSelect('pcaf-project-phase', DEFAULTS.projectPhase);
    _setSelect('pcaf-project-type',  DEFAULTS.projectType);

    // Reset DQ radio to default (2)
    const dqRadio = document.querySelector(`input[name="dq"][value="${DEFAULTS.dq}"]`);
    if (dqRadio) {
      dqRadio.checked = true;
      dqRadio.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Reset badge
    const badge = document.getElementById('pcaf-results-badge');
    if (badge) {
      badge.textContent        = 'Live Preview';
      badge.style.background   = '';
      badge.style.color        = '';
    }

    // Recalculate with defaults
    calculate();
  }

  function _setInput(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }

  function _setSelect(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }

  // ── Save & Copy ──────────────────────────────────────────────

  function saveAndSubmit() {
    const r = window._pcafCurrentResult;
    if (!r) {
      calculate();
      return;
    }

    const now  = new Date().toISOString();
    const text = [
      `PCAF v3 Attribution Result`,
      `═══════════════════════════════`,
      `Project    : ${r.projectName}`,
      `Loan ID    : ${r.loanId}`,
      `Generated  : ${now}`,
      ``,
      `Attribution Factor : ${r.attribution.toFixed(3)}`,
      `  Outstanding       : ${r.currency} ${_fmt(r.outstanding)}`,
      `  Total Value       : ${r.currency} ${_fmt(r.totalValue)} (equity + debt)`,
      ``,
      `Financed Emissions  : ${_fmt(r.financedEmissions)} tCO2e/yr`,
      `  Scope 1 (Direct)  : ${_fmt(r.s1)} tCO2e`,
      `  Scope 2 (Energy)  : ${_fmt(r.s2)} tCO2e`,
      `  Scope 3 (Value Chain) : ${_fmt(r.s3)} tCO2e`,
      ``,
      `Economic Intensity  : ${r.economicIntensity} tCO2e / ${r.currency}M outstanding`,
      `Data Quality Score  : ${r.dqScore} — ${r.dqLabel}`,
      `Project Phase       : ${r.projectPhase} / ${r.projectType}`,
      ``,
      `Standard: PCAF Global GHG Accounting & Reporting Standard v3 (Dec 2025)`,
      `Methodology: Outstanding / (Equity + Debt) × Project Emissions`,
    ].join('\n');

    const btn      = document.getElementById('pcaf-save-btn');
    const original = btn ? btn.textContent : 'Save & Copy';

    navigator.clipboard.writeText(text)
      .then(() => {
        if (btn) {
          btn.textContent = '✓ Copied!';
          setTimeout(() => { btn.textContent = original; }, 2500);
        }
      })
      .catch(() => {
        // Clipboard not available — show in a modal-like alert
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);width:600px;height:300px;z-index:9999;font-size:12px;padding:12px;border-radius:8px;border:1px solid #ccc';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        setTimeout(() => document.body.removeChild(ta), 3000);
        if (btn) {
          btn.textContent = '✓ Copied!';
          setTimeout(() => { btn.textContent = original; }, 2500);
        }
      });
  }

  // ── Export PDF ───────────────────────────────────────────────

  async function exportPDF() {
    const r = window._pcafCurrentResult;
    if (!r) {
      calculate();
      // Wait for result then retry
      setTimeout(exportPDF, 100);
      return;
    }

    const btn      = document.getElementById('pcaf-export-pdf-btn');
    const original = btn ? btn.innerHTML : 'Export PDF';

    if (btn) {
      btn.innerHTML  = '<span style="display:inline-flex;align-items:center;gap:6px"><span class="rpt-spinner" style="width:12px;height:12px;border-width:2px"></span>Generating…</span>';
      btn.disabled   = true;
    }

    _clearError();

    try {
      const apiBase = window.CARBONIQ_API_BASE || '';
      const apiKey  = window.CARBONIQ_API_KEY  || 'ck_test_00000000000000000000000000000000';

      const res = await fetch(`${apiBase}/v1/reports/generate`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key':    apiKey,
        },
        body: JSON.stringify({
          type:    'pcaf',
          period:  String(new Date().getFullYear()),
          format:  'pdf',
          orgName: r.projectName,
          portfolioData: {
            totalProjects:         1,
            coverage_pct:          100,
            totalEmissions_tCO2e:  r.financedEmissions,
            weightedDQ:            parseInt(r.dqScore, 10),
            totalPortfolioValue_M: Math.round(r.outstanding / 1e6),
            taxonomyDist:          { green: 1, transition: 0, brown: 0 },
            dqDistribution:        { [r.dqScore]: 1 },
            assetClasses: [{
              class:            r.projectType,
              projects:         1,
              outstandingLoan_M: Math.round(r.outstanding / 1e6),
              emissions_tCO2e:  r.financedEmissions,
              intensity_tCO2e_M: r.economicIntensity,
            }],
            yoy: null,
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Server returned ${res.status}`);
      }

      const blob     = await res.blob();
      const url      = URL.createObjectURL(blob);
      const filename = `PCAF-${r.loanId.replace(/[^a-zA-Z0-9-]/g, '_')}-${new Date().getFullYear()}.pdf`;
      const a        = document.createElement('a');
      a.href         = url;
      a.download     = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (err) {
      _showError(`PDF export failed: ${err.message}`);
    } finally {
      if (btn) {
        btn.innerHTML = original;
        btn.disabled  = false;
      }
    }
  }

  // ── Init ─────────────────────────────────────────────────────
  // Called once when the DOM is ready (from app.js DOMContentLoaded).
  // Auto-calculates so the results panel is never blank on first load.

  function init() {
    calculate();
  }

  return { calculate, reset, saveAndSubmit, exportPDF, init };

})();
