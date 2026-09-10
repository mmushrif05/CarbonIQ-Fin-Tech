/* Not yet under `// @ts-check`, and on `docs/TYPECHECK-WORKLIST.md`.
   These errors are not new. This code was written inside an HTML file, where
   no checker ever looked at it — so the worklist grew when the file moved,
   not when the code did. What changed is that the gap is now counted.
   Almost all of it is one root cause: `document.getElementById` returns
   `HTMLElement | null`, and this file reads `.value` off the result. A file
   joins the check when its errors are fixed, never by adding the pragma, so
   that is its own change rather than something smuggled into the one that
   made the code reachable. */
/* ============================================================
   CarbonIQ — Reports
   ui/js/reports.js
   ============================================================
   Lifted out of `ui/pages/reports.html`, where it did not run.

   A page fragment is inserted with `innerHTML`, and a `<script>` inserted
   that way is never executed — the browser parses it into the DOM and
   leaves it inert. So this module was never defined, and every control on
   the page threw a ReferenceError the moment it was clicked. The page
   loader hid it: `init: () => typeof reportsPage !== 'undefined' && …`
   silently did nothing rather than failing where somebody would see it.

   Loaded as a real script by index.html, which is also what lets
   `script-src` drop `'unsafe-inline'`.
   ============================================================ */

'use strict';

const ReportsPage = (() => {
  const API_BASE = window.CARBONIQ_API_BASE || '';

  const history = [];

  /*
   * One map, and it carries every type the buttons on this page can ask for.
   *
   * There were two returns here, the second unreachable, and the two maps
   * disagreed: one knew `slgft-cbsl` and the other knew `slgft`. Both report
   * types exist and are deliberately kept apart — `slgft-cbsl` is the CBSL
   * Direction 05 / SLFRS S2 disclosure, `slgft` the fuller taxonomy report —
   * so whichever map was reachable, one of the two rendered its own id as its
   * label. Nobody saw it, because this module was never loaded at all.
   *
   * The dropped label also read "Compliance Report". Compliance with CBSL
   * Direction 05 is determined by the Central Bank and not by this software,
   * which is why nothing else in the product says otherwise.
   */
  const TYPE_LABELS = {
    pcaf: 'PCAF Annual Disclosure',
    gri305: 'GRI 305 Emissions',
    tcfd: 'TCFD Climate Risk',
    'ifrs-s2': 'IFRS S2 Disclosures',
    'slgft-cbsl': 'CBSL Direction 05 / SLFRS S2 Disclosure',
    slgft: 'Sri Lanka Green Finance Taxonomy Report',
  };

  function _typeLabel(type) {
    return TYPE_LABELS[type] || type;
  }

  async function generate(type) {
    const orgName = document.getElementById('rptOrgName').value.trim() || 'Your Organisation';
    const period  = document.getElementById('rptPeriod').value;
    const format  = document.getElementById('rptFormat').value;

    const progressEl = document.getElementById(`rpt-progress-${type}`);
    const resultEl   = document.getElementById(`rpt-result-${type}`);
    const card       = document.querySelector(`.rpt-card[data-type="${type}"]`);
    const btn        = card.querySelector('.rpt-generate-btn');

    // Show loading state
    btn.disabled = true;
    resultEl.style.display = 'none';
    progressEl.style.display = 'flex';

    try {
      const res = await window.CARBONIQ_fetch('/v1/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, period, format, orgName }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || `Server error ${res.status}`);
      }

      progressEl.style.display = 'none';

      if (format === 'pdf') {
        // Trigger browser download
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `CarbonIQ-${type.toUpperCase()}-${period}.pdf`;
        a.click();
        URL.revokeObjectURL(url);

        _showSuccess(resultEl, type, period, format, null, a.download);
      } else {
        const data = await res.json();
        _showSuccess(resultEl, type, period, format, data.report, null);
      }

      _addHistory(type, period, format);

    } catch (err) {
      progressEl.style.display = 'none';
      _showError(resultEl, err.message);
    } finally {
      btn.disabled = false;
    }
  }

  function _showSuccess(el, type, period, format, reportData, filename) {
    if (format === 'pdf') {
      el.innerHTML = `
        <div class="rpt-success">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-6" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>PDF downloaded — <strong>${filename}</strong></span>
        </div>`;
    } else {
      // JSON: show a collapsible preview + download button
      const jsonStr = JSON.stringify(reportData, null, 2);
      const blob    = new Blob([jsonStr], { type: 'application/json' });
      const url     = URL.createObjectURL(blob);
      el.innerHTML = `
        <div class="rpt-success">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-6" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>Report generated</span>
          <a href="${url}" download="CarbonIQ-${type}-${period}.json" class="btn btn-secondary btn-sm" style="margin-left:auto">Download JSON</a>
        </div>
        <details class="rpt-json-preview">
          <summary>Preview JSON</summary>
          <pre>${_escapeHtml(JSON.stringify(reportData, null, 2).slice(0, 3000))}${jsonStr.length > 3000 ? '\n…(truncated)' : ''}</pre>
        </details>`;
    }
    el.style.display = 'block';
  }

  function _showError(el, message) {
    el.innerHTML = `
      <div class="rpt-error">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="#ef4444" stroke-width="1.4"/><path d="M7 4v3M7 9.5v.5" stroke="#ef4444" stroke-width="1.4" stroke-linecap="round"/></svg>
        ${_escapeHtml(message)}
      </div>`;
    el.style.display = 'block';
  }

  function _addHistory(type, period, format) {
    const now = new Date().toLocaleTimeString();
    history.unshift({ type, period, format, time: now });

    const historyEl = document.getElementById('rptHistory');
    const tbody     = document.getElementById('rptHistoryBody');
    historyEl.style.display = 'block';

    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong>${_typeLabel(type)}</strong></td>
      <td>FY ${period}</td>
      <td><span class="format-tag format-tag-${format}">${format.toUpperCase()}</span></td>
      <td>${now}</td>
      <td><button class="btn btn-ghost btn-sm" data-action="ReportsPage.regenerate" data-arg="${type}">Re-generate</button></td>`;
    tbody.prepend(row);
  }

  function regenerate(type) {
    generate(type);
  }

  function clearHistory() {
    history.length = 0;
    document.getElementById('rptHistoryBody').innerHTML = '';
    document.getElementById('rptHistory').style.display = 'none';
  }

  function _escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Public init hook (called by app.js after lazy-load)
  function init() {
    // Nothing to init — all handlers are inline
  }

  return { generate, regenerate, clearHistory, init };
})();
