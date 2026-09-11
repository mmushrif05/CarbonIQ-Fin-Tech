/* ============================================================
   CarbonIQ — PCAF Part A, the lending book
   ============================================================

   Every figure on this screen comes from /v1/pcaf/part-a. The page holds
   no arithmetic of its own — not an attribution factor, not a sum of
   lines, not a score. A number computed here and a number computed by the
   engine would agree until the day they did not, and the disagreement
   would surface in a disclosure.

   So the loop is: choose a year, read the position, read the rows, render
   what came back. Recording an exposure posts the form and renders the
   engine's answer — the figures, or the refusal with its clause.

   Three rules the render carries, each a way to draw a confident screen
   that is wrong:

     scope 3 is a line of its own and is never added to scope 1 and 2;
     removals and credits are lines of their own and net against nothing;
     an exposure with no attribution factor shows a dash, not a zero —
     Number(null) is 0, and 0 is finite, and that has cost this codebase
     three defects already.
   ============================================================ */

const PartARegisterPage = (() => {

  const $ = id => document.getElementById(id);
  const fmt = (n, d = 0) => (n === null || n === undefined || !Number.isFinite(Number(n))) ? '—'
    : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const say = (id, t) => { const el = $(id); if (el) el.textContent = t; };
  const setHtml = (id, h) => { const el = $(id); if (el) el.innerHTML = h; };
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  const show = (id, yes) => { const el = $(id); if (el) el.hidden = !yes; };

  let currency = 'LKR';
  let year = null;
  let rows = [];
  let openId = null;

  /* A score is a category on a scale where 1 is best. Never a fraction of
     five. The weighted score across a book is shown to two decimals; a single
     exposure's score is the whole number its option carries. */
  const dqBadge = (v, label, dp = 0) => v === null || v === undefined
    ? `<span class="dqb dqb-na">${esc(label || 'not scored')}</span>`
    : `<span class="dqb dqb-${Math.round(v)}">${label ? `<i>${esc(label)}</i>` : ''}<b>${Number(v).toFixed(dp)}</b></span>`;

  const sevChip = sev => `<span class="partc-sev">${sev === 'material' ? 'material' : 'advisory'}</span>`;

  /* `Auth` is a top-level const in a classic script — a global lexical
     binding, not a property of window — so it is reached by name, the way
     app.js reaches every page module. */
  const preview = () => {
    try { return typeof Auth !== 'undefined' && typeof Auth.isPreview === 'function' && Boolean(Auth.isPreview()); }
    catch (_) { return false; }
  };

  async function call(path, opts = {}) {
    const res = await window.CARBONIQ_fetch('/v1/pcaf/part-a' + path, opts);
    let data = {};
    try { data = await res.json(); } catch (_) { /* empty */ }
    if (!res.ok) {
      const err = new Error([data.message, data.remedy].filter(Boolean).join(' ') || `Request failed (${res.status})`);
      err.status = res.status;
      err.code = data.error || data.code;
      throw err;
    }
    return data;
  }
  const post = (path, body) => call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const put = (path, body) => call(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const del = path => call(path, { method: 'DELETE' });

  // ── the held vocabulary ─────────────────────────────────────

  /* Reference data for the form: the sectors a factor and a band are held
     for. Loaded before the first request so the select is populated before
     anyone can open the form. */
  async function loadVocabulary() {
    const sel = $('pr-f-sector-key');
    if (!sel) return;
    try {
      const { vocabulary } = await call('/factors');
      const sectors = (vocabulary && vocabulary.sectors) || [];
      sel.innerHTML = '<option value="">Not mapped</option>' + sectors
        .map(x => `<option value="${esc(x.key)}">${esc(x.label)} · ISIC ${esc(x.isic)}${x.held ? '' : ' · no factor held'}</option>`).join('');
    } catch (_) { /* the free-text sector still records; the engine says what it could not map */ }
  }

  // ── years ──────────────────────────────────────────────────

  async function loadYears() {
    let years = [];
    try { ({ years } = await call('/years')); } catch (_) { years = []; }
    const chosen = $('pr-year') ? $('pr-year').value : '';
    const list = years.map(y => y.reportingYear);
    if (!list.length) list.push(String(new Date().getFullYear()));
    setHtml('pr-year', list.map(y => `<option value="${esc(y)}">${esc(y)}</option>`).join(''));
    $('pr-year').value = list.includes(chosen) ? chosen : list[list.length - 1];
    year = $('pr-year').value;
  }

  // ── the position ───────────────────────────────────────────

  async function load() {
    year = $('pr-year').value;
    say('pr-status', 'Loading…');
    let position = null;
    try {
      position = await call(`/position/${year}`);
    } catch (err) {
      /* An empty year is a 409 by design — a book with nothing in it and a
         book nobody has measured are different claims. Say so, and offer
         the form. */
      show('pr-body', false);
      say('pr-status', err.message);
      return;
    }
    let list = [];
    try { ({ exposures: list } = await call(`/exposures?reportingYear=${encodeURIComponent(year)}&limit=200`)); }
    catch (err) { say('pr-status', err.message); }
    rows = list;
    render(position);
    show('pr-body', true);
    say('pr-status', `${position.exposures} exposure(s) in FY${position.reportingYear}.`);
  }

  function render(p) {
    currency = (p.coverage && p.coverage.currency) || currency;
    const L = p.total.lines;
    say('pr-subtitle', `FY${p.reportingYear} · ${currency} · business loans and unlisted equity`);
    say('pr-s12', fmt(L.scope1And2.value, 2));
    say('pr-s3', L.scope3.value === null ? '—' : fmt(L.scope3.value, 2));
    say('pr-removals', L.removals.value === null ? '—' : fmt(L.removals.value, 2));

    const dq = p.total.dataQuality;
    setHtml('pr-dq12', dq.scope1And2.score === null
      ? '<span class="dqb dqb-na">no score</span>'
      : `Outstanding-weighted ${dqBadge(dq.scope1And2.score, null, 2)}`);
    setHtml('pr-dq3', dq.scope3.score === null
      ? `<span class="dqb dqb-na">${L.scope3.counted ? 'no score' : 'not reported'}</span>`
      : `Outstanding-weighted ${dqBadge(dq.scope3.score, null, 2)}${dq.scope3.excluded ? ` <span class="partc-hint">${dq.scope3.excluded} without a figure, excluded</span>` : ''}`);

    if (p.coverage.share === null) {
      say('pr-coverage', '—');
      say('pr-coverage-unit', 'book total not stated');
    } else {
      say('pr-coverage', `${(p.coverage.share * 100).toFixed(1)}%`);
      say('pr-coverage-unit', 'of total loans and investments');
    }

    renderBook(p);
    renderGroups(p);
    renderPlan(p.improvementPlan);
    renderRows();
    if (openId && !rows.find(r => r.exposureId === openId)) closeDetail();
  }

  function renderBook(p) {
    const c = p.coverage;
    if (c.share === null) {
      setHtml('pr-book', `<p class="partc-hint">Not stated for FY${esc(p.reportingYear)}. Coverage cannot be a percentage of anything until it is.</p>`);
    } else {
      setHtml('pr-book', `
        <dl class="pr-kv">
          <dt>Total loans and investments</dt><dd>${esc(c.currency || currency)} ${fmt(c.totalLoansAndInvestments, 0)}</dd>
          <dt>Assessed outstanding</dt><dd>${esc(currency)} ${fmt(p.total.outstanding, 0)}</dd>
          <dt>Coverage</dt><dd>${(c.share * 100).toFixed(2)}%</dd>
          <dt>Basis</dt><dd>Declared${c.statedBy ? ` by ${esc(c.statedBy)}` : ''}</dd>
        </dl>`);
    }
    show('pr-book-form', !preview());
    if ($('pr-book-currency') && !$('pr-book-currency').value) $('pr-book-currency').value = currency;
  }

  function renderGroups(p) {
    const groups = [];
    const g = (label, obj) => Object.entries(obj || {}).map(([k, v]) => ({ label, key: k, ...v }));
    groups.push(...g('Sector', p.bySector), ...g('Kind', p.byKind), ...g('Borrower type', p.byBorrowerType));
    const fin = p.financialSector;
    setHtml('pr-groups', `
      <div class="pr-scroll"><table class="partc-table">
        <thead><tr><th>Group</th><th></th><th>Exposures</th><th>Outstanding</th><th>Scope 1+2</th><th>Scope 3</th><th>Score</th></tr></thead>
        <tbody>
          ${groups.map(x => `<tr>
            <td>${esc(x.label)}</td><td>${esc(x.key)}</td>
            <td class="num">${x.exposures}</td>
            <td class="num">${fmt(x.outstanding, 0)}</td>
            <td class="num">${fmt(x.lines.scope1And2.value, 2)}</td>
            <td class="num">${x.lines.scope3.value === null ? '—' : fmt(x.lines.scope3.value, 2)}</td>
            <td class="num">${dqBadge(x.dataQuality.scope1And2.score, null, 2)}</td>
          </tr>`).join('')}
          ${fin ? `<tr class="total"><td>Financial-sector borrowers</td><td>apart</td>
            <td class="num">${fin.exposures}</td><td class="num">${fmt(fin.outstanding, 0)}</td>
            <td class="num">${fmt(fin.lines.scope1And2.value, 2)}</td>
            <td class="num">${fin.lines.scope3.value === null ? '—' : fmt(fin.lines.scope3.value, 2)}</td>
            <td class="num">${dqBadge(fin.dataQuality.scope1And2.score, null, 2)}</td></tr>` : ''}
        </tbody></table></div>
      ${fin ? `<p class="partc-hint">Loans to other financial institutions are rolled up apart — PCAF Part A §5.2 (p.56).</p>` : ''}`);
  }

  function renderPlan(plan) {
    if (!plan) { setHtml('pr-plan', ''); return; }
    say('pr-plan-note', `Reported score ${plan.reportedScore.score === null ? '—' : Number(plan.reportedScore.score).toFixed(2)}, weighted by outstanding amount. Target score ${plan.target}. Every figure below is a scenario.`);
    const steps = plan.steps.length
      ? `<h5 class="partc-subhead">By option — what one step would be worth</h5>
        <div class="pr-scroll"><table class="partc-table">
          <thead><tr><th>Option</th><th>Score now</th><th>Exposures</th><th>Outstanding</th><th>Share of book</th><th>Scenario score</th><th>Movement</th></tr></thead>
          <tbody>${plan.steps.map(s => `<tr>
            <td>Option ${esc(s.option)}</td>
            <td class="num">${dqBadge(s.currentScore)}</td>
            <td class="num">${s.exposures}</td>
            <td class="num">${fmt(s.outstanding, 0)}</td>
            <td class="num">${s.shareOfBook === null ? '—' : (s.shareOfBook * 100).toFixed(1) + '%'}</td>
            <td class="num">${s.scenarioScore === null ? '—' : Number(s.scenarioScore).toFixed(2)} <span class="partc-hint">scenario</span></td>
            <td class="num">${s.movement === null ? '—' : '−' + Number(s.movement).toFixed(2)}</td>
          </tr>`).join('')}</tbody></table></div>`
      : '<p class="partc-hint">Every exposure is at or above the target score.</p>';
    const remedies = plan.byRemedy.length
      ? `<h5 class="partc-subhead">By remedy — what would clear each finding</h5>
        <div class="pr-scroll"><table class="partc-table">
          <thead><tr><th></th><th>Finding</th><th>Exposures</th><th>Outstanding</th><th>What clears it</th></tr></thead>
          <tbody>${plan.byRemedy.map(r => `<tr>
            <td>${sevChip(r.severity)}</td>
            <td>${esc(r.code.replace(/_/g, ' ').toLowerCase())}</td>
            <td class="num">${r.exposures}</td>
            <td class="num">${fmt(r.outstanding, 0)}</td>
            <td>${esc(r.remedy)}</td>
          </tr>`).join('')}</tbody></table></div>`
      : '<p class="partc-hint">No findings across the book.</p>';
    setHtml('pr-plan', `${steps}${remedies}<p class="partc-hint">${esc(plan.scenarioNote)}</p>`);
  }

  function renderRows() {
    say('pr-rows-note', rows.length ? `${rows.length} shown. Open a row for its trace and findings.` : '');
    setHtml('pr-rows', rows.length === 0
      ? '<p class="partc-hint">No exposures recorded in this year.</p>'
      : `<div class="pr-scroll"><table class="partc-table">
          <thead><tr><th>Borrower</th><th>Instrument</th><th>Outstanding</th><th>AF</th><th>Scope 1+2</th><th>Scope 3</th><th>Score</th><th>Checks</th></tr></thead>
          <tbody>${rows.map(r => {
            const x = r.result || {};
            const inv = x.inventory || {};
            const af = x.attribution && Number.isFinite(x.attribution.value) ? x.attribution.value.toFixed(4) : '—';
            const dq = inv.dataQuality || {};
            const v = (x.validation || {});
            const n = (v.findings || []).length;
            const material = (v.findings || []).some(f => f.severity === 'material');
            return `<tr class="pr-row${r.exposureId === openId ? ' is-open' : ''}" data-id="${esc(r.exposureId)}">
              <td>${esc(r.counterparty && r.counterparty.name)}<br><span class="partc-hint">${esc(r.counterparty && r.counterparty.sector || '')}</span></td>
              <td>${esc((x.exposure && x.exposure.instrument || '').replace(/-/g, ' '))}</td>
              <td class="num">${fmt(x.exposure && x.exposure.outstanding && x.exposure.outstanding.value, 0)}</td>
              <td class="num">${af}</td>
              <td class="num">${fmt(inv.scope1And2 && inv.scope1And2.value, 2)}</td>
              <td class="num">${inv.scope3 && inv.scope3.absent ? '—' : fmt(inv.scope3 && inv.scope3.value, 2)}</td>
              <td class="num">${dqBadge(dq.scope1And2 && dq.scope1And2.score, dq.scope1And2 && dq.scope1And2.option ? 'Option ' + dq.scope1And2.option : null)}</td>
              <td><span class="pr-verdict ${n === 0 ? 'pr-verdict-clean' : material ? 'pr-verdict-material' : ''}">${n === 0 ? 'clean' : `${n} finding${n === 1 ? '' : 's'}`}</span></td>
            </tr>`;
          }).join('')}</tbody></table></div>`);
    for (const tr of document.querySelectorAll('#pr-rows .pr-row')) {
      tr.addEventListener('click', () => openDetail(tr.getAttribute('data-id')));
    }
  }

  // ── one exposure ───────────────────────────────────────────

  async function openDetail(id) {
    openId = id;
    let exposure;
    try { ({ exposure } = await call(`/exposures/${encodeURIComponent(id)}`)); }
    catch (err) { say('pr-status', err.message); return; }
    renderDetail(exposure);
    renderRows();
    show('pr-detail', true);
    $('pr-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeDetail() { openId = null; show('pr-detail', false); renderRows(); }

  function renderDetail(e) {
    const x = e.result;
    const inv = x.inventory;
    const cp = x.exposure.counterparty || {};
    say('pr-detail-title', cp.name || 'Exposure');
    say('pr-detail-status', '');
    const line = (label, l) => `<dt>${label}</dt><dd>${l && !l.absent && Number.isFinite(l.value) ? fmt(l.value, 2) + ' tCO₂e' : (l && l.reason ? esc(l.reason) : '—')}</dd>`;
    const dq = inv.dataQuality;
    const findings = (x.validation && x.validation.findings) || [];
    setHtml('pr-detail-body', `
      <div class="partc-panels">
        <div class="partc-panel">
          <h5 class="partc-subhead">Financed lines</h5>
          <dl class="pr-kv">
            ${line('Scope 1', inv.scope1)}${line('Scope 2', inv.scope2)}${line('Scope 1 and 2', inv.scope1And2)}
            ${line('Scope 3', inv.scope3)}${line('Removals', inv.removals)}
            ${inv.creditsRetired ? line('Credits retired', inv.creditsRetired) : ''}${line('Credits generated', inv.creditsGenerated)}
          </dl>
          <p class="partc-hint">${esc(inv.separation)}</p>
        </div>
        <div class="partc-panel">
          <h5 class="partc-subhead">Data quality</h5>
          <p>${dqBadge(dq.scope1And2.score, 'Option ' + dq.scope1And2.option)} scope 1 and 2${dq.scope1And2.note ? ` <span class="partc-hint">${esc(dq.scope1And2.note)}</span>` : ''}</p>
          <p>${dq.scope3 && !dq.scope3.absent ? dqBadge(dq.scope3.score, 'Option ' + dq.scope3.option) + ' scope 3' : '<span class="dqb dqb-na">scope 3 not scored</span>'}</p>
          <p class="partc-hint">${esc(dq.scale)}</p>
          <h5 class="partc-subhead">Attribution</h5>
          ${x.attribution ? `<p class="pr-eq">${esc(x.attribution.equation)}</p>
            <dl class="pr-kv"><dt>Factor</dt><dd>${x.attribution.value}</dd>
            <dt>Outstanding</dt><dd>${fmt(x.exposure.outstanding.value, 0)}</dd>
            ${x.denominator ? `<dt>Company value</dt><dd>${fmt(x.denominator.value, 0)} <span class="partc-hint">${esc(x.denominator.equation)}</span></dd>` : ''}</dl>
            ${x.denominator && x.denominator.assumptions && x.denominator.assumptions.length ? `<ul class="partc-hint">${x.denominator.assumptions.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}`
            : '<p class="partc-hint">No attribution factor: the figure rests on a sector-average option and is a rough estimate of this institution\'s share.</p>'}
          ${x.factorRelease ? `<h5 class="partc-subhead">Factor set</h5>
            <p class="partc-hint">${esc(x.factorRelease.tables[0].table)} v${esc(x.factorRelease.tables[0].version)}, ${esc(x.factorRelease.tables[0].status)} · rows ${esc(x.factorRelease.rows.join(', '))} · SHA-256 ${esc(x.factorRelease.checksum.slice(0, 16))}…</p>` : ''}
          ${x.exposure.counterparty.sectorKey ? `<p class="partc-hint">Held sector: ${esc(x.exposure.counterparty.sectorKey)}</p>` : ''}
        </div>
      </div>
      <h5 class="partc-subhead">What the data says about itself</h5>
      ${findings.length === 0
        ? `<p class="partc-hint">${esc((x.validation && x.validation.note) || 'No findings.')}</p>`
        : findings.map(f => `<div class="pr-finding partc-sev-${f.severity === 'material' ? 'material' : 'info'}">
            <div>${sevChip(f.severity)}</div>
            <div class="pr-finding-body">
              <p>${esc(f.statement)}</p>
              <p class="partc-hint">${esc(f.effect)}</p>
              <p><strong>What clears it.</strong> ${esc(f.remedy)}</p>
              <span class="partc-hint">${esc(f.reference)}</span>
            </div>
          </div>`).join('')}
      <p class="partc-hint">Computed ${esc(e.computedAt)} · ${esc(e.standard)}</p>`);
    for (const el of document.querySelectorAll('#pr-detail [data-writes]')) el.hidden = preview();
  }

  async function recompute() {
    if (!openId) return;
    say('pr-detail-status', 'Recomputing…');
    try {
      const { movement } = await post(`/exposures/${encodeURIComponent(openId)}/recompute`);
      await load();
      if (openId) await openDetail(openId);
      /* After the re-open, not before: openDetail() resets the status line, so
         setting the note first left it wiped the instant the detail refreshed. */
      say('pr-detail-status', movement.note);
    } catch (err) { say('pr-detail-status', err.message); }
  }

  async function remove() {
    if (!openId) return;
    if (!window.confirm('Remove this exposure from the register?')) return;
    try {
      await del(`/exposures/${encodeURIComponent(openId)}`);
      closeDetail();
      await load();
    } catch (err) { say('pr-detail-status', err.message); }
  }

  // ── recording ──────────────────────────────────────────────

  const num = id => { const v = $(id) && $(id).value; return v === '' || v === undefined || v === null ? undefined : Number(v); };
  const str = id => { const v = $(id) && $(id).value; return v ? String(v).trim() : undefined; };

  /** The request the engine takes, read from the form and nothing else. */
  function collect() {
    const listed = $('pr-f-listed').checked;
    const fi = $('pr-f-fi').checked;
    const instrument = $('pr-f-instrument').value;
    const body = {
      reportingYear: Number(year),
      instrument,
      borrowerListed: instrument === 'unlisted-equity' ? false : listed,
      borrowerType: $('pr-f-borrower-type').value,
      counterparty: { name: str('pr-f-name'), sector: str('pr-f-sector'), sectorKey: str('pr-f-sector-key'), financialInstitution: fi || undefined },
      plausibility: { revenue: num('pr-f-revenue') },
      outstanding: { amount: num('pr-f-outstanding'), averageOutstanding: num('pr-f-average'), asOf: str('pr-f-asof'), currency: str('pr-f-currency') },
    };
    const ref = str('pr-f-ref');
    if (ref) body.identifiers = { accountNumber: ref };

    const hasValue = listed
      ? num('pr-f-mcap') !== undefined
      : (num('pr-f-equity') !== undefined || num('pr-f-debt') !== undefined);
    if (hasValue) {
      body.denominator = listed
        ? { marketCapOrdinary: num('pr-f-mcap'), totalDebtInterestBearing: num('pr-f-debt-ib'), minorityInterests: num('pr-f-minorities'),
          financialInstitution: fi || undefined, customerDeposits: fi ? num('pr-f-deposits') : undefined, asOf: str('pr-f-asof'), currency: str('pr-f-currency') }
        : { totalEquity: num('pr-f-equity'), totalDebt: num('pr-f-debt'),
          financialInstitution: fi || undefined, customerDeposits: fi ? num('pr-f-deposits') : undefined, asOf: str('pr-f-asof'), currency: str('pr-f-currency') };
    }

    const basis = $('pr-f-basis').value;
    const period = str('pr-f-period');
    const reported = v => v === undefined ? undefined
      : { value: v, basis, period, verifier: basis === 'reported-verified' ? str('pr-f-verifier') : undefined };
    const s1 = num('pr-f-s1'), s2 = num('pr-f-s2'), s3 = num('pr-f-s3');
    if (s1 !== undefined || s2 !== undefined || s3 !== undefined || hasValue) {
      body.emissions = { scope1: reported(s1), scope2: reported(s2), scope3: reported(s3) };
    } else {
      /* Nothing reported and no company value: Option 3b from a sector factor —
         the one typed here, or, left empty, the held factor for the mapped
         sector. */
      const factor = sf => (sf === undefined ? undefined
        : { value: sf, unit: 'tCO2e per unit of assets', source: str('pr-f-sf-source'), vintage: num('pr-f-sf-vintage') });
      body.emissions = {
        scope1: { basis: 'assets-sector', activity: { factor: factor(num('pr-f-sf1')) } },
        scope2: { basis: 'assets-sector', activity: { factor: factor(num('pr-f-sf2')) } },
      };
    }
    if (s3 === undefined) body.emissions.scope3AbsentReason = str('pr-f-s3-reason');
    return prune(body);
  }

  /* Undefined keys never reach the wire: the schema is closed and a key set
     to undefined is a key the server would refuse by name. */
  function prune(v) {
    if (Array.isArray(v)) return v.map(prune);
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, val] of Object.entries(v)) {
        const p = prune(val);
        if (p !== undefined && !(p && typeof p === 'object' && !Array.isArray(p) && Object.keys(p).length === 0)) out[k] = p;
      }
      return out;
    }
    return v;
  }

  async function submitForm(ev) {
    ev.preventDefault();
    say('pr-form-status', 'Recording…');
    try {
      const { exposure } = await post('/exposures', collect());
      say('pr-form-status', `Recorded ${exposure.counterparty.name}. ${exposure.result.validation.note}`);
      $('pr-form').reset();
      applyDenominatorMode();
      show('pr-record', false);
      await load();
      await openDetail(exposure.exposureId);
    } catch (err) {
      say('pr-form-status', err.message);
    }
  }

  function applyDenominatorMode() {
    const listed = $('pr-f-listed').checked && $('pr-f-instrument').value !== 'unlisted-equity';
    show('pr-denom-listed', listed);
    show('pr-denom-private', !listed);
    const factors = num('pr-f-s1') === undefined && num('pr-f-s2') === undefined
      && num('pr-f-equity') === undefined && num('pr-f-debt') === undefined && num('pr-f-mcap') === undefined;
    show('pr-sector-factor', factors);
  }

  async function submitBook(ev) {
    ev.preventDefault();
    say('pr-book-status', 'Stating…');
    try {
      await put('/book', prune({ reportingYear: Number(year), totalLoansAndInvestments: num('pr-book-total'),
        currency: str('pr-book-currency'), statedBy: str('pr-book-by') }));
      say('pr-book-status', 'Stated.');
      await load();
    } catch (err) { say('pr-book-status', err.message); }
  }

  // ── lifecycle ──────────────────────────────────────────────

  /* Everything that changes what the first request says — the year, the
     preview state, the listeners — is wired before load() is called. */
  async function init() {
    on('pr-refresh', 'click', load);
    on('pr-year', 'change', () => { closeDetail(); load(); });
    on('pr-record-toggle', 'click', () => { show('pr-record', $('pr-record').hidden); applyDenominatorMode(); });
    on('pr-form-cancel', 'click', () => show('pr-record', false));
    on('pr-form', 'submit', submitForm);
    on('pr-book-form', 'submit', submitBook);
    on('pr-detail-close', 'click', closeDetail);
    on('pr-detail-recompute', 'click', recompute);
    on('pr-detail-remove', 'click', remove);
    for (const id of ['pr-f-listed', 'pr-f-instrument', 'pr-f-s1', 'pr-f-s2', 'pr-f-equity', 'pr-f-debt', 'pr-f-mcap']) {
      on(id, 'change', applyDenominatorMode);
      on(id, 'input', applyDenominatorMode);
    }
    if ($('pr-f-asof') && !$('pr-f-asof').value) $('pr-f-asof').value = `${new Date().getFullYear()}-12-31`;
    for (const el of document.querySelectorAll('.parta-register [data-writes]')) el.hidden = preview();
    await loadVocabulary();
    await loadYears();
    await load();
  }

  function refresh() {
    return load();
  }

  return { init, refresh, load, collect, prune };
})();
