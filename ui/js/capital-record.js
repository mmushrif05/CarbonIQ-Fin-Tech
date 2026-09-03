/* ============================================================
   CarbonIQ — Recording the capital book
   ------------------------------------------------------------
   A drawer over the Dashboard for entering the three things the
   dashboard is derived from: a portfolio and its allocation, an
   investment against it, and a payment against that.

   Nothing here computes. Balance, deployment and every roll-up
   come back from the engine on the next read, so a figure on the
   dashboard can never disagree with the records behind it —
   which is the whole reason balance is not a field.

   A write that cannot persist is refused by the API with a 503
   and the reason. This drawer shows that reason rather than a
   generic failure, because "saved" followed by "gone" is the
   worst outcome available.
   ============================================================ */

const CapitalRecord = (() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  let _portfolios = [];
  let _investments = [];

  function _say(msg, kind = 'info') {
    const el = $('crd-status');
    if (!el) return;
    el.textContent = msg;
    el.className = 'crd-status is-' + kind;
  }

  async function _call(path, options) {
    const res = await window.CARBONIQ_fetch(path, options);
    let body = {};
    try { body = await res.json(); } catch (_) { /* a 204 carries no body */ }
    if (!res.ok) {
      const err = new Error(body.message || `Request failed (${res.status})`);
      err.remedy = body.remedy;
      throw err;
    }
    return body;
  }

  async function _load() {
    try {
      const [p, i] = await Promise.all([
        _call('/v1/capital/portfolios'),
        _call('/v1/capital/investments'),
      ]);
      _portfolios = p.portfolios || [];
      _investments = i.investments || [];
      _fill();
      _say(_portfolios.length
        ? `${_portfolios.length} portfolio${_portfolios.length === 1 ? '' : 's'}, `
          + `${_investments.length} investment${_investments.length === 1 ? '' : 's'} on record.`
        : 'No portfolio recorded yet. Start with one, or load the worked book.');
    } catch (err) {
      _say(`Could not read the book: ${err.message}`, 'error');
    }
  }

  function _fill() {
    const opts = (rows, label) => rows.map(r =>
      `<option value="${esc(r.id)}">${esc(label(r))}</option>`).join('');

    for (const id of ['crd-inv-portfolio', 'crd-budget-portfolio']) {
      const sel = $(id);
      if (!sel) continue;
      const keep = sel.value;
      sel.innerHTML = opts(_portfolios, r => `${r.name} — ${r.currency}`);
      if (keep) sel.value = keep;
    }

    const pay = $('crd-pay-investment');
    if (pay) {
      const keep = pay.value;
      pay.innerHTML = opts(_investments, r => `${r.name} (${r.status})`);
      if (keep) pay.value = keep;
    }

    const list = $('crd-list');
    if (list) {
      list.innerHTML = _portfolios.length ? _portfolios.map(p => `
        <div class="crd-row">
          <span class="crd-row-name">${esc(p.name)}</span>
          <span class="crd-row-meta">${esc(p.currency)} ${Number(p.allocatedBudget || 0).toLocaleString('en-US')}</span>
        </div>`).join('')
        : '<p class="crd-hint">Nothing recorded.</p>';
    }
  }

  const _num = (id) => {
    const raw = ($(id).value || '').trim();
    if (raw === '') return null;
    const v = Number(raw);
    return Number.isFinite(v) ? v : null;
  };

  async function _createPortfolio() {
    const name = ($('crd-pf-name').value || '').trim();
    if (!name) return _say('A portfolio needs a name.', 'error');
    try {
      await _call('/v1/capital/portfolios', {
        method: 'POST',
        body: JSON.stringify({
          name,
          currency: ($('crd-pf-currency').value || 'USD').trim(),
          allocatedBudget: _num('crd-pf-budget') || 0,
          mandate: ($('crd-pf-mandate').value || '').trim(),
          vintage: _num('crd-pf-vintage'),
        }),
      });
      $('crd-pf-name').value = '';
      $('crd-pf-budget').value = '';
      $('crd-pf-mandate').value = '';
      await _load();
      await _reloadDashboard();
      _say(`Recorded "${name}".`, 'ok');
    } catch (err) { _fail(err); }
  }

  async function _setBudget() {
    const id = $('crd-budget-portfolio').value;
    const amount = _num('crd-budget-amount');
    if (!id) return _say('Choose a portfolio.', 'error');
    if (amount === null) return _say('Enter the allocated budget.', 'error');
    try {
      await _call(`/v1/capital/portfolios/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ allocatedBudget: amount }),
      });
      await _load();
      await _reloadDashboard();
      _say('Allocation updated. Balance follows it on the dashboard — it is derived, not stored.', 'ok');
    } catch (err) { _fail(err); }
  }

  async function _createInvestment() {
    const portfolioId = $('crd-inv-portfolio').value;
    const name = ($('crd-inv-name').value || '').trim();
    if (!portfolioId) return _say('Choose a portfolio for it.', 'error');
    if (!name) return _say('An investment needs a name.', 'error');
    try {
      await _call('/v1/capital/investments', {
        method: 'POST',
        body: JSON.stringify({
          portfolioId, name,
          sector: ($('crd-inv-sector').value || '').trim() || undefined,
          country: ($('crd-inv-country').value || '').trim() || undefined,
          status: $('crd-inv-status').value,
          commitment: _num('crd-inv-commitment') || 0,
          /* Left blank means not yet priced, and it stays that way. A blank
             stored as zero would rank the project as the worst return on the
             book rather than holding it out of the ranking. */
          expectedReturnPct: _num('crd-inv-return'),
          tenorYears: _num('crd-inv-tenor'),
          emissions: {
            incurred_tCO2e: _num('crd-inv-incurred') || 0,
            forward_tCO2e: _num('crd-inv-forward') || 0,
            reduction_tCO2e: _num('crd-inv-reduction') || 0,
            avoided_tCO2e: _num('crd-inv-avoided') || 0,
          },
        }),
      });
      for (const id of ['crd-inv-name', 'crd-inv-commitment', 'crd-inv-return', 'crd-inv-tenor',
        'crd-inv-incurred', 'crd-inv-forward', 'crd-inv-reduction', 'crd-inv-avoided']) {
        $(id).value = '';
      }
      await _load();
      await _reloadDashboard();
      _say(`Recorded "${name}".`, 'ok');
    } catch (err) { _fail(err); }
  }

  async function _createPayment() {
    const investmentId = $('crd-pay-investment').value;
    const amount = _num('crd-pay-amount');
    if (!investmentId) return _say('Choose what the payment is against.', 'error');
    if (amount === null) return _say('Enter the amount.', 'error');
    try {
      await _call('/v1/capital/payments', {
        method: 'POST',
        body: JSON.stringify({
          investmentId,
          kind: $('crd-pay-kind').value,
          amount,
          date: ($('crd-pay-date').value || '').trim() || undefined,
          reference: ($('crd-pay-ref').value || '').trim(),
        }),
      });
      $('crd-pay-amount').value = '';
      $('crd-pay-ref').value = '';
      await _reloadDashboard();
      _say('Payment recorded. Paid and balance on the dashboard have moved with it.', 'ok');
    } catch (err) { _fail(err); }
  }

  async function _seed() {
    try {
      const out = await _call('/v1/capital/demo', { method: 'POST' });
      await _load();
      await _reloadDashboard();
      _say(out.note || 'Worked book loaded.', 'ok');
    } catch (err) { _fail(err); }
  }

  /** A refusal names the cause and the remedy — never just "failed". */
  function _fail(err) {
    _say(err.message + (err.remedy ? ` ${err.remedy}` : ''), 'error');
  }

  async function _reloadDashboard() {
    if (typeof Dashboard !== 'undefined' && Dashboard.refreshCapital) {
      await Dashboard.refreshCapital();
    }
  }

  // ── Drawer ───────────────────────────────────────────────
  function open() {
    const el = $('capital-record');
    if (!el) return;
    el.style.display = 'flex';
    _load();
  }
  function close() {
    const el = $('capital-record');
    if (el) el.style.display = 'none';
  }

  function init() {
    const pairs = [
      ['crd-close', close],
      ['crd-pf-save', _createPortfolio],
      ['crd-budget-save', _setBudget],
      ['crd-inv-save', _createInvestment],
      ['crd-pay-save', _createPayment],
      ['crd-seed', _seed],
    ];
    for (const [id, fn] of pairs) {
      const el = $(id);
      if (el) el.addEventListener('click', fn);
    }
    const backdrop = $('capital-record');
    if (backdrop) {
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { open, close, init };
})();
