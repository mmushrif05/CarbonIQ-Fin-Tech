/* ============================================================
   CarbonIQ — Adjusting the figures

   The dashboard could already be asked different *questions* —
   a different carbon weighting, a longer horizon, a faster grid.
   It could not be asked a different *book*. This drawer is that:
   every input the screen is derived from, editable, with the
   whole dashboard recomputing behind it.

   Three rules hold it honest.

   Nothing here computes. The overlay changes inputs; the engine
   derives every figure from the adjusted book using the same
   functions that derive it from the recorded one. A browser that
   totalled a column would be a second implementation of it, and
   the two would eventually disagree on the screen a person acts
   on rather than in a test.

   An adjusted figure is never shown as a recorded one. The
   dashboard carries a banner, edited inputs are marked, and the
   count travels with the payload.

   An adjustment is not a record. It is held in this browser, it
   is never written to the book, and reset removes it rather than
   writing the old values back — a reset that wrote defaults back
   would reintroduce exactly what it exists to clear.
   ============================================================ */

const CapitalAdjust = (() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  const KEY = 'carboniq_capital_overlay';

  /* The four emission lines, in the order the dashboard reports them, so a
     reader moving between the two is not re-learning the order. */
  const EMISSIONS = [
    ['incurred_tCO2e', 'Incurred'],
    ['forward_tCO2e', 'Forward'],
    ['reduction_tCO2e', 'Reduction'],
    ['avoided_tCO2e', 'Avoided'],
  ];

  const STATUSES = ['pipeline', 'committed', 'deployed', 'exited', 'declined'];

  let _base = null;                 // the book as it stands
  let _overlay = { portfolios: {}, investments: {}, payments: [] };
  let _timer = null;
  let _onChange = null;             // the dashboard's recompute
  let _loading = false;

  /* Absence before the number, everywhere. An emptied field means "leave it
     as the book has it", never "zero" — `Number('')` is 0, and 0 is a
     perfectly plausible allocation, so the two must not be conflated. */
  const numOrNull = (v) =>
    (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

  function count() {
    return Object.values(_overlay.portfolios).reduce((t, e) => t + Object.keys(e).length, 0)
      + Object.values(_overlay.investments).reduce(
        (t, e) => t + Object.keys(e).filter(k => k !== 'emissions').length
          + Object.keys(e.emissions || {}).length, 0)
      + _overlay.payments.length;
  }

  function isEmpty() { return count() === 0; }

  function overlay() { return _overlay; }

  /* Storage can throw outright in a private window or with site data blocked,
     so a failure leaves the book unadjusted rather than the screen broken. */
  function _load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return;
      const held = JSON.parse(raw);
      _overlay = {
        portfolios: held.portfolios && typeof held.portfolios === 'object' ? held.portfolios : {},
        investments: held.investments && typeof held.investments === 'object' ? held.investments : {},
        payments: Array.isArray(held.payments) ? held.payments : [],
      };
    } catch (_) { _overlay = { portfolios: {}, investments: {}, payments: [] }; }
  }

  function _save() {
    try {
      if (isEmpty()) window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, JSON.stringify(_overlay));
    } catch (_) { /* a convenience, never a requirement */ }
  }

  function _set(kind, id, field, value, sub) {
    const bag = _overlay[kind];
    if (!bag[id]) bag[id] = {};
    const target = sub ? (bag[id][sub] = bag[id][sub] || {}) : bag[id];

    if (value === null) {
      delete target[field];
      /* An entity with nothing left changed is removed rather than left as an
         empty object, so `count()` is the number of adjusted values and not
         the number of rows a reader once clicked into. */
      if (sub && !Object.keys(target).length) delete bag[id][sub];
      if (!Object.keys(bag[id]).length) delete bag[id];
    } else {
      target[field] = value;
    }
    _save();
    _schedule();
  }

  function _schedule() {
    clearTimeout(_timer);
    _timer = setTimeout(() => {
      _renderFooter();
      if (typeof _onChange === 'function') _onChange();
    }, 260);
  }

  function reset() {
    _overlay = { portfolios: {}, investments: {}, payments: [] };
    _save();
    if (_base) _renderBody();
    _renderFooter();
    if (typeof _onChange === 'function') _onChange();
  }

  // ── the base book ─────────────────────────────────────────────────────────

  async function _fetchBase() {
    if (_base || _loading) return _base;
    _loading = true;
    try {
      const res = await window.CARBONIQ_fetch('/v1/capital/book');
      if (!res.ok) throw new Error(`API ${res.status}`);
      const body = await res.json();
      _base = body.book;
      _base.source = body.source;
    } catch (err) {
      _base = null;
      const body = $('adj-body');
      if (body) {
        body.innerHTML = `<p class="cap-note is-warn">The book could not be read (${esc(err.message)}), `
          + 'so there is nothing to adjust. Nothing has been changed.</p>';
      }
    } finally { _loading = false; }
    return _base;
  }

  // ── rendering ─────────────────────────────────────────────────────────────

  const _edited = (kind, id, field, sub) => {
    const e = _overlay[kind][id];
    if (!e) return false;
    return sub ? !!(e[sub] && field in e[sub]) : field in e;
  };

  const _valueOf = (kind, id, field, fallback, sub) => {
    const e = _overlay[kind][id];
    if (e) {
      if (sub && e[sub] && field in e[sub]) return e[sub][field];
      if (!sub && field in e) return e[field];
    }
    return fallback;
  };

  function _numInput(kind, id, field, fallback, opts = {}) {
    const on = _edited(kind, id, field, opts.sub);
    const v = _valueOf(kind, id, field, fallback, opts.sub);
    return `<input type="number" class="adj-input${on ? ' is-edited' : ''}"
      data-kind="${kind}" data-id="${esc(id)}" data-field="${field}"
      ${opts.sub ? `data-sub="${opts.sub}"` : ''}
      value="${v === null || v === undefined ? '' : v}"
      step="${opts.step || 'any'}" min="${opts.min === undefined ? 0 : opts.min}"
      aria-label="${esc(opts.label || field)}"
      placeholder="${fallback === null || fallback === undefined ? 'not set' : fallback}">`;
  }

  function _renderBody() {
    const body = $('adj-body');
    if (!body || !_base) return;

    const pf = _base.portfolios.map(p => `
      <div class="adj-row">
        <div class="adj-row-name">${esc(p.name)}<span class="adj-row-id">${esc(p.id)}</span></div>
        <label class="adj-field"><span>Allocated</span>
          ${_numInput('portfolios', p.id, 'allocatedBudget', p.allocatedBudget,
    { label: `${p.name} allocated budget` })}</label>
        <label class="adj-field"><span>Pledged</span>
          ${_numInput('portfolios', p.id, 'pledged', p.pledged, { label: `${p.name} pledged` })}</label>
      </div>`).join('');

    const inv = _base.investments.map(i => `
      <details class="adj-inv${_overlay.investments[i.id] ? ' is-edited' : ''}">
        <summary>
          <span class="adj-inv-name">${esc(i.name)}</span>
          <span class="adj-inv-meta">${esc(i.sector || '')} · ${esc(
    _valueOf('investments', i.id, 'status', i.status))}</span>
        </summary>
        <div class="adj-inv-grid">
          <label class="adj-field"><span>Status</span>
            <select class="adj-input${_edited('investments', i.id, 'status') ? ' is-edited' : ''}"
                    data-kind="investments" data-id="${esc(i.id)}" data-field="status"
                    aria-label="${esc(i.name)} status">
              ${STATUSES.map(st => `<option value="${st}"${
  _valueOf('investments', i.id, 'status', i.status) === st ? ' selected' : ''}>${st}</option>`).join('')}
            </select></label>
          <label class="adj-field"><span>Commitment</span>
            ${_numInput('investments', i.id, 'commitment', i.commitment, { label: `${i.name} commitment` })}</label>
          <label class="adj-field"><span>Project cost</span>
            ${_numInput('investments', i.id, 'projectCost', i.projectCost, { label: `${i.name} project cost` })}</label>
          <label class="adj-field"><span>Return %</span>
            ${_numInput('investments', i.id, 'expectedReturnPct', i.expectedReturnPct,
    { step: '0.1', label: `${i.name} expected return` })}</label>
          <label class="adj-field"><span>Tenor (yrs)</span>
            ${_numInput('investments', i.id, 'tenorYears', i.tenorYears, { label: `${i.name} tenor` })}</label>
          <label class="adj-field"><span>Start year</span>
            ${_numInput('investments', i.id, 'startYear', i.startYear,
    { min: 1900, label: `${i.name} start year` })}</label>
          ${EMISSIONS.map(([f, label]) => `
            <label class="adj-field"><span>${label} tCO2e</span>
              ${_numInput('investments', i.id, f, (i.emissions || {})[f],
    { sub: 'emissions', label: `${i.name} ${label}` })}</label>`).join('')}
        </div>
      </details>`).join('');

    const options = _base.investments.map(i =>
      `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('');

    /* Payments are added, never edited. A payment is an event, and the honest
       way to model "what if we drew another $20M" is another event rather than
       an altered one. */
    const added = _overlay.payments.map((p, k) => {
      const named = _base.investments.find(i => i.id === p.investmentId);
      return `<li class="adj-pay">
        <span>${esc(named ? named.name : p.investmentId)} · ${esc(p.kind)} · ${
  Number(p.amount).toLocaleString()}</span>
        <button type="button" class="adj-pay-drop" data-drop="${k}" aria-label="Remove this payment">Remove</button>
      </li>`;
    }).join('');

    body.innerHTML = `
      <section class="adj-section">
        <h3>Portfolios</h3>
        <p class="cap-note">What has been allocated, and what has been pledged against it.</p>
        ${pf}
      </section>

      <section class="adj-section">
        <h3>Investments</h3>
        <p class="cap-note">Open one to change what it commits, what it is expected to return, when it
          starts, and the four emission lines. Moving a project from <em>pipeline</em> to
          <em>committed</em> writes it into the book — the pipeline shortens and the capital position
          moves.</p>
        ${inv}
      </section>

      <section class="adj-section">
        <h3>Payments</h3>
        <p class="cap-note">A payment is an event, so one is added rather than edited. Drawdown is what
          moves attributed emissions: on the outstanding basis a commitment that has not been drawn
          carries nothing yet.</p>
        <div class="adj-pay-add">
          <select id="adj-pay-inv" class="adj-input" aria-label="Investment">${options}</select>
          <select id="adj-pay-kind" class="adj-input" aria-label="Kind">
            <option value="disbursement">disbursement</option>
            <option value="repayment">repayment</option>
            <option value="fee">fee</option>
          </select>
          <input type="number" id="adj-pay-amt" class="adj-input" min="0" step="any"
                 placeholder="Amount" aria-label="Amount">
          <button type="button" class="adj-pay-btn" id="adj-pay-add">Add</button>
        </div>
        <ul class="adj-pay-list">${added || '<li class="cap-note">None added.</li>'}</ul>
      </section>`;

    _wireBody();
  }

  function _wireBody() {
    document.querySelectorAll('#adj-body .adj-input[data-field]').forEach((el) => {
      const handler = () => {
        const { kind, id, field, sub } = el.dataset;
        const base = _baseValue(kind, id, field, sub);
        let value;
        if (el.tagName === 'SELECT') {
          value = el.value === String(base ?? '') ? null : el.value;
        } else {
          const n = numOrNull(el.value);
          /* Back to the book's own value is not an adjustment — it is the
             absence of one, so the entry is dropped rather than stored as an
             edit that happens to match. */
          value = (n === null || n === base) ? null : n;
        }
        el.classList.toggle('is-edited', value !== null);
        _set(kind, id, field, value, sub);
      };
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', handler);
    });

    const add = $('adj-pay-add');
    if (add) {
      add.addEventListener('click', () => {
        const amount = numOrNull($('adj-pay-amt').value);
        if (amount === null || amount <= 0) return;
        _overlay.payments.push({
          investmentId: $('adj-pay-inv').value,
          kind: $('adj-pay-kind').value,
          amount,
        });
        $('adj-pay-amt').value = '';
        _save();
        _renderBody();
        _renderFooter();
        if (typeof _onChange === 'function') _onChange();
      });
    }

    document.querySelectorAll('#adj-body .adj-pay-drop').forEach((btn) => {
      btn.addEventListener('click', () => {
        _overlay.payments.splice(Number(btn.dataset.drop), 1);
        _save();
        _renderBody();
        _renderFooter();
        if (typeof _onChange === 'function') _onChange();
      });
    });
  }

  function _baseValue(kind, id, field, sub) {
    const list = kind === 'portfolios' ? _base.portfolios : _base.investments;
    const row = list.find(r => r.id === id);
    if (!row) return null;
    const v = sub ? (row[sub] || {})[field] : row[field];
    return v === undefined ? null : v;
  }

  function _renderFooter() {
    const n = count();
    const label = $('adj-count');
    if (label) {
      label.textContent = n === 0
        ? 'Nothing adjusted'
        : `${n} value${n === 1 ? '' : 's'} adjusted`;
    }
    const reset = $('adj-reset');
    if (reset) reset.hidden = n === 0;
  }

  // ── the drawer ────────────────────────────────────────────────────────────

  async function open() {
    const back = $('capital-adjust');
    if (!back) return;
    back.hidden = false;
    document.body.classList.add('adj-open');

    $('adj-explain').textContent =
      'Changes are held in this browser only. Nothing is recorded, and every figure behind this '
      + 'drawer is recomputed by the engine from the book as you have adjusted it. Reset returns the '
      + 'screen to the book as it stands.';

    await _fetchBase();
    if (_base) {
      $('adj-sub').textContent = _base.source === 'baseline'
        ? 'The baseline book held in the repository'
        : 'The book recorded by your organisation';
      _renderBody();
    }
    _renderFooter();
  }

  function close() {
    const back = $('capital-adjust');
    if (!back) return;
    back.hidden = true;
    document.body.classList.remove('adj-open');
  }

  function init(onChange) {
    _onChange = onChange;
    _load();
    const wire = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
    wire('cap-adjust', open);
    wire('adj-close', close);
    wire('adj-done', close);
    wire('adj-reset', reset);

    const back = $('capital-adjust');
    if (back) {
      back.addEventListener('click', (e) => { if (e.target === back) close(); });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && back && !back.hidden) close();
    });
  }

  return { init, open, close, reset, overlay, count, isEmpty };
})();

window.CapitalAdjust = CapitalAdjust;
