/* Not yet under `// @ts-check`, and on `docs/TYPECHECK-WORKLIST.md`.
   It carries real type errors — this code was written inside an HTML file,
   where no checker ever saw it. A file joins the check when its errors are
   fixed, never by adding the pragma, so fixing them is its own change rather
   than something smuggled into the one that moved the file. */
/* ============================================================
   CarbonIQ — Agent pipeline
   ui/js/pipeline.js
   ============================================================
   Lifted out of `ui/pages/pipeline.html`, where it did not run.

   A page fragment is inserted with `innerHTML`, and a `<script>` inserted
   that way is never executed — the browser parses it into the DOM and
   leaves it inert. So this module was never defined, and every control on
   the page threw a ReferenceError the moment it was clicked. The page
   loader hid it: `init: () => typeof pipelinePage !== 'undefined' && …`
   silently did nothing rather than failing where somebody would see it.

   Loaded as a real script by index.html, which is also what lets
   `script-src` drop `'unsafe-inline'`.
   ============================================================ */

'use strict';

const PipelinePage = (() => {
  'use strict';

  const TEMPLATES = {
    green_loan_origination: {
      label: 'Green Loan Origination',
      description: 'End-to-end: screening → origination → covenant design with human review gate',
      stages: ['screen', 'originate', 'covenants'],
      icon: 'loan',
    },
    quick_assessment: {
      label: 'Quick Assessment',
      description: 'Parallel screening + underwriting, followed by decision triage',
      stages: ['screen', 'underwrite', 'triage'],
      icon: 'speed',
    },
    monitoring_review: {
      label: 'Monitoring Review',
      description: 'Covenant monitoring with portfolio impact update',
      stages: ['monitor', 'portfolio'],
      icon: 'monitor',
    },
  };

  const STAGE_LABELS = {
    screen: 'Pre-Screening', originate: 'Origination', covenants: 'Covenant Design',
    underwrite: 'Underwriting', triage: 'Decision Triage', monitor: 'Monitoring', portfolio: 'Portfolio',
  };

  const STAGE_ICONS = {
    screen: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.5"/><path d="M11 11l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    originate: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 13V5l4-3h2l4 3v8a1 1 0 01-1 1H4a1 1 0 01-1-1z" stroke="currentColor" stroke-width="1.3"/></svg>',
    covenants: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 2h8l2 2v8l-2 2H4l-2-2V4l2-2z" stroke="currentColor" stroke-width="1.3"/><path d="M5 7h6M5 10h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    underwrite: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 11l4-4 3 3 5-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    triage: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v4l3 2-3 2v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    monitor: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 12l3-3 3 2 6-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    portfolio: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M1 7h14" stroke="currentColor" stroke-width="1.3"/></svg>',
  };

  let _selectedTemplate = null;
  const _history = [];

  function _renderTemplates() {
    const grid = document.getElementById('pipeTemplateGrid');
    if (!grid) return;
    grid.innerHTML = Object.entries(TEMPLATES).map(([id, t]) => `
      <div class="pipe-template-card" data-template="${id}" data-action="PipelinePage.selectTemplate" data-arg="${id}">
        <div class="pipe-template-icon pipe-icon-${t.icon}">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/>
            <path d="M8 8l8 4-8 4V8z" fill="currentColor" opacity="0.3" stroke="currentColor" stroke-width="1"/>
          </svg>
        </div>
        <div class="pipe-template-content">
          <div class="pipe-template-title">${t.label}</div>
          <div class="pipe-template-desc">${t.description}</div>
          <div class="pipe-template-stages">
            ${t.stages.map(s => `<span class="pipe-stage-chip">${STAGE_LABELS[s]}</span>`).join('<span class="pipe-stage-arrow">→</span>')}
          </div>
        </div>
        <div class="pipe-template-check">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
      </div>
    `).join('');
  }

  function selectTemplate(templateId) {
    _selectedTemplate = templateId;
    document.querySelectorAll('.pipe-template-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.template === templateId);
    });
    document.getElementById('pipeRunBtn').disabled = false;
  }

  async function run() {
    if (!_selectedTemplate) return;

    const payload = {
      templateId: _selectedTemplate,
      input: {
        projectName:    document.getElementById('pipe-project-name').value.trim() || 'Unnamed Project',
        buildingType:   document.getElementById('pipe-building-type').value,
        buildingArea_m2: parseFloat(document.getElementById('pipe-area').value) || undefined,
        region:         document.getElementById('pipe-region').value,
        loanAmount:     parseFloat(document.getElementById('pipe-loan').value) || undefined,
        projectValue:   parseFloat(document.getElementById('pipe-value').value) || undefined,
      },
    };

    const template = TEMPLATES[_selectedTemplate];
    _showProgress(template);

    try {
      const res = await window.CARBONIQ_fetch('/v1/supervisor/pipeline', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || `Server error ${res.status}`);
      }

      const data = await res.json();
      _showResults(data, template);
      _addHistory(data, template);

    } catch (err) {
      _showError(err.message);
    }
  }

  function _showProgress(template) {
    document.getElementById('pipeIdle').style.display = 'none';
    document.getElementById('pipeError').style.display = 'none';
    document.getElementById('pipeResults').style.display = 'none';

    const progress = document.getElementById('pipeProgress');
    progress.style.display = 'block';
    document.getElementById('pipeProgressTitle').textContent = `Running ${template.label}…`;
    document.getElementById('pipeStatusPill').textContent = 'running';
    document.getElementById('pipeStatusPill').className = 'pipe-status-pill pipe-status-running';

    document.getElementById('pipeStageList').innerHTML = template.stages.map((s, i) => `
      <div class="pipe-stage-card pipe-stage-pending" id="pipe-stage-${s}">
        <div class="pipe-stage-num">${i + 1}</div>
        <div class="pipe-stage-icon">${STAGE_ICONS[s] || ''}</div>
        <div class="pipe-stage-info">
          <div class="pipe-stage-label">${STAGE_LABELS[s]}</div>
          <div class="pipe-stage-status">Pending…</div>
        </div>
        <div class="pipe-stage-spinner"></div>
      </div>
    `).join('');
  }

  function _showResults(data, template) {
    document.getElementById('pipeProgress').style.display = 'none';
    const resultsEl = document.getElementById('pipeResults');
    resultsEl.style.display = 'block';

    const status = data.pipeline?.status || data.status || 'completed';
    const pill = document.getElementById('pipeResultStatus');
    pill.textContent = status;
    pill.className = `pipe-status-pill pipe-status-${status}`;

    const stages = data.pipeline?.stages || data.stages || [];
    document.getElementById('pipeResultStages').innerHTML = stages.map((s, i) => {
      const stageStatus = s.status || 'completed';
      const icon = stageStatus === 'completed' ? 'check' : stageStatus === 'failed' ? 'cross' : stageStatus === 'paused' ? 'pause' : 'pending';
      return `
        <div class="pipe-result-stage pipe-result-${stageStatus}">
          <div class="pipe-result-num">${i + 1}</div>
          <div class="pipe-result-info">
            <div class="pipe-result-label">${STAGE_LABELS[s.stageId] || s.agentType || s.stageId}</div>
            <div class="pipe-result-status">${stageStatus}</div>
            ${s.runId ? `<div class="pipe-result-runid">Run: ${s.runId}</div>` : ''}
          </div>
          <div class="pipe-result-icon pipe-icon-${icon}">
            ${icon === 'check' ? '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' : ''}
            ${icon === 'cross' ? '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' : ''}
            ${icon === 'pause' ? '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="4" y="3" width="3" height="10" rx="1" fill="currentColor"/><rect x="9" y="3" width="3" height="10" rx="1" fill="currentColor"/></svg>' : ''}
          </div>
        </div>`;
    }).join('');

    if (status === 'paused') {
      document.getElementById('pipeResultStages').insertAdjacentHTML('afterend',
        `<div class="pipe-paused-notice">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="#f59e0b" stroke-width="1.5"/><path d="M8 5v3M8 10v.5" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round"/></svg>
          Pipeline paused — human review required before covenant terms take legal effect (EU AI Act Art. 22).
        </div>`);
    }
  }

  function _showError(msg) {
    document.getElementById('pipeProgress').style.display = 'none';
    document.getElementById('pipeResults').style.display = 'none';
    const errEl = document.getElementById('pipeError');
    errEl.style.display = 'block';
    errEl.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="#ef4444" stroke-width="1.5"/><path d="M8 5v3M8 10v.5" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round"/></svg>
      <span>${msg}</span>`;
  }

  function _addHistory(data, template) {
    const pipelineId = data.pipeline?.pipelineId || data.pipelineId || '—';
    const status = data.pipeline?.status || data.status || 'completed';
    _history.unshift({ pipelineId, template: template.label, project: document.getElementById('pipe-project-name').value || '—', status, time: new Date().toLocaleTimeString() });

    const histEl = document.getElementById('pipeHistory');
    histEl.style.display = 'block';
    const tbody = document.getElementById('pipeHistoryBody');
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong>${template.label}</strong></td>
      <td>${document.getElementById('pipe-project-name').value || '—'}</td>
      <td><span class="pipe-status-pill pipe-status-${status}" style="font-size:11px">${status}</span></td>
      <td>${new Date().toLocaleTimeString()}</td>
      <td><code style="font-size:11px;color:var(--text-secondary)">${pipelineId}</code></td>`;
    tbody.prepend(row);
  }

  function init() {
    _renderTemplates();
  }

  return { init, selectTemplate, run };
})();
