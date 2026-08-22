/* ============================================================
   CarbonIQ — PCAF Part C: Live Walkthrough

   A guided console onto the Part C engine, built for a reader who has to
   decide whether to believe the figures. Two rules govern it:

     Every number is fetched, never stored. If the engine cannot be
     reached the page says so and shows why; it never falls back to a
     remembered value dressed as a live one.

     Every call can be opened to the wire. The request, the response and
     the round trip are one click away, because a claim a reviewer cannot
     inspect is a claim they are right to discount.

   This page reads the API. It computes nothing itself — no figure shown
   here is calculated in the browser.
   ============================================================ */

const PCAFDemoPage = (() => {

  const $ = id => document.getElementById(id);

  const esc = t => String(t ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /** Last call, kept only so "show me the wire" has something to show. */
  let lastCall = null;

  /**
   * One live call, instrumented.
   *
   * Returns the parsed body plus what it took to get it, so the page can
   * report latency and status as facts rather than impressions.
   */
  async function call(path, opts = {}) {
    const started = performance.now();
    const record  = { method: opts.method || 'GET', path, startedAt: new Date().toISOString() };

    try {
      const res  = await window.CARBONIQ_fetch(path, opts);
      const text = await res.text();
      record.ms     = Math.round(performance.now() - started);
      record.status = res.status;

      let body = null;
      try { body = JSON.parse(text); } catch (_) { record.raw = text.slice(0, 2000); }
      record.body = body;
      lastCall = record;

      if (!res.ok) {
        const err = new Error(
          (body && (body.message || body.error)) || `The engine answered ${res.status}.`);
        err.record = record;
        throw err;
      }
      return { body, record };

    } catch (err) {
      record.ms = record.ms ?? Math.round(performance.now() - started);
      if (!record.status) record.error = err.message;
      lastCall = record;
      throw err;
    }
  }

  /** The wire panel: the request line, then the response as it arrived. */
  function renderWire() {
    const wire = $('demoWire');
    const body = $('demoWireBody');
    if (!wire || !body || !lastCall) return;

    const base = window.CARBONIQ_API_BASE || window.location.origin;
    const head = [
      `${lastCall.method} ${base}${lastCall.path}`,
      'x-api-key: ' + maskKey(window.CARBONIQ_API_KEY),
      '',
      lastCall.status
        ? `HTTP ${lastCall.status} · ${lastCall.ms} ms`
        : `no response · ${lastCall.ms} ms · ${lastCall.error || 'unknown error'}`,
      ''
    ].join('\n');

    const payload = lastCall.body
      ? JSON.stringify(lastCall.body, null, 2)
      : (lastCall.raw || '');

    body.textContent = head + payload.slice(0, 6000)
      + (payload.length > 6000 ? '\n\n… truncated for display …' : '');
    wire.hidden = false;
  }

  /* A key is a credential, not a demonstration. Only its prefix is ever
     drawn, so the wire panel can be shown on a projector. */
  function maskKey(k) {
    const s = String(k || '');
    if (!s) return '(none)';
    return s.slice(0, 11) + '…' + ` (${s.length} characters)`;
  }

  function setStatus(text, tone) {
    const el = $('demoConnStatus');
    if (!el) return;
    el.textContent = text;
    el.className = 'pcafdemo-status' + (tone ? ` pcafdemo-status-${tone}` : '');
  }

  function showError(message, remedy) {
    const el = $('demoConnError');
    if (!el) return;
    el.innerHTML = `<strong>${esc(message)}</strong>`
      + (remedy ? `<span>${esc(remedy)}</span>` : '');
    el.hidden = false;
  }

  /**
   * The connection proof.
   *
   * The conformance matrix is the right thing to call first: it needs no
   * input, no storage and no AI, so reaching it proves the whole path —
   * navigation, authentication, the serverless function and the engine —
   * without proving anything about a particular project.
   */
  async function checkConnection() {
    $('demoConnError').hidden   = true;
    $('demoConnMetrics').hidden = true;
    setStatus('checking…');

    try {
      const { body, record } = await call('/v1/pcaf/part-c/conformance');

      const rules = Array.isArray(body && body.rules) ? body.rules.length
        : Array.isArray(body && body.matrix) ? body.matrix.length
          : (body && typeof body.count === 'number') ? body.count : null;

      $('demoRuleCount').textContent = rules === null ? '—' : rules;
      $('demoLatency').textContent   = `${record.ms} ms`;
      $('demoHttp').textContent      = record.status;
      $('demoConnMetrics').hidden    = false;

      setStatus('live', 'ok');
      $('demoConnLede').textContent =
        'The engine answered. Every rule below cites the file that enforces it and '
        + 'the test that proves it — those citations fail the build if they rot.';

      $('demoFoot').textContent =
        `Answered by the running engine at ${new Date().toLocaleTimeString()}. `
        + 'Nothing on this page is stored between visits.';

    } catch (err) {
      setStatus('unavailable', 'bad');
      const b = (err.record && err.record.body) || {};
      showError(err.message, b.remedy || b.diagnose || null);
      $('demoFoot').textContent =
        'The page is showing no figures rather than remembered ones.';
    } finally {
      renderWire();
    }
  }

  function init() {
    const retry = $('demoRetry');
    if (retry) retry.addEventListener('click', checkConnection);
    checkConnection();
  }

  return { init, refresh: checkConnection };
})();
