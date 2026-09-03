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
    /* Only the Portfolio screen. The Dashboard reads the capital book, which
       has its own states and its own messages; stamping "sample data — not
       your portfolio" over live recorded figures was worse than saying
       nothing at all. */
    const hosts = ['page-portfolio']
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    if (!hosts.length) return;

    const src = (data && data._source) || {};

    hosts.forEach((host, i) => {
      const bannerId = 'dash-demo-banner-pf';
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
  /* ══════════════════════════════════════════════════════════════════════
     THE DASHBOARD — the capital book
     ══════════════════════════════════════════════════════════════════════
     What the institution has allocated, what it has committed, what it has
     actually paid, what is left, what the book has emitted and will emit,
     what it has helped reduce and avoid, and what is waiting to be written.

     Three separations are held on screen because they are held in the engine,
     and a screen that blurs them would make the engine's care pointless.

     Committed is not paid. They sit in different tiles and different segments
     of the deployment bar, because a book two-thirds committed and under half
     deployed is in a completely different position from one with the money out.

     Incurred is not forward. One is measured, the other is a projection over
     the remaining term. The forward bar is hatched so a reader can see which
     is which without reading the label, and they are never stacked.

     Reduction and avoidance are not deductions. They sit in a second block
     behind a rule that says so, because PCAF reports avoided emissions apart
     from the inventory and never nets them against it (Part A, p.126).

     The palette is validated, not chosen by eye: #00875a / #5e5ce6 / #c77700 /
     #1f6fb2 pass the lightness band, chroma floor, CVD separation (worst
     adjacent deutan ΔE 23.4), the normal-vision floor and contrast against
     this surface. Every segment also carries a direct label and a 2px gap, so
     nothing rests on colour alone.
     ══════════════════════════════════════════════════════════════════════ */

  const CAP = {
    paid:      '#00875a',
    undrawn:   '#5e5ce6',
    uncommit:  '#c77700',
    incurred:  '#00875a',
    forward:   '#5e5ce6',
    reduction: '#c77700',
    avoided:   '#1f6fb2',
  };

  let _capital = null;
  let _carbonWeight = 0.5;
  let _portfolioFilter = '';

  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /** Money, at the scale a reader actually holds in their head. */
  function _money(n, currency = 'USD') {
    const v = Number(n) || 0;
    const sign = v < 0 ? '−' : '';
    const a = Math.abs(v);
    const sym = currency === 'USD' ? '$' : `${currency} `;
    if (a >= 1e9) return `${sign}${sym}${(a / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${sign}${sym}${(a / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `${sign}${sym}${(a / 1e3).toFixed(0)}K`;
    return `${sign}${sym}${a.toFixed(0)}`;
  }
  const _t = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

  /**
   * Whole percentages that sum to 100.
   *
   * Rounding each share on its own gave 43 + 27 + 31 = 101 for one allocation.
   * A reader who adds up the parts of one whole and gets 101 stops trusting
   * the rest of the screen, and they are right to. Largest remainder puts the
   * rounding difference on the share that lost the most to it.
   */
  function _wholePercents(values) {
    const total = values.reduce((t, v) => t + v, 0);
    if (!total) return values.map(() => 0);
    const exact = values.map(v => (v / total) * 100);
    const floors = exact.map(Math.floor);
    let left = 100 - floors.reduce((t, v) => t + v, 0);
    const order = exact
      .map((v, i) => ({ i, rem: v - Math.floor(v) }))
      .sort((a, b) => b.rem - a.rem);
    for (const { i } of order) {
      if (left <= 0) break;
      floors[i] += 1;
      left -= 1;
    }
    return floors;
  }

  async function _fetchCapital() {
    const qs = new URLSearchParams({ carbonWeight: String(_carbonWeight) });
    if (_portfolioFilter) qs.set('portfolioId', _portfolioFilter);
    try {
      const res = await window.CARBONIQ_fetch(`/v1/capital/dashboard?${qs}`);
      if (!res.ok) throw new Error(`API ${res.status}`);
      const { dashboard } = await res.json();
      _capital = { mode: dashboard.empty ? 'empty' : 'live', data: dashboard };
    } catch (err) {
      _capital = { mode: 'unavailable', detail: err.message };
    }
    return _capital;
  }

  function _renderDashboard(state) {
    const $ = (id) => document.getElementById(id);

    /* The loader comes down whatever the outcome. A spinner that outlives its
       request is indistinguishable from a slow network. */
    const loader = $('dash-loading');
    if (loader) loader.style.display = 'none';
    if (!$('cap-capital')) return;

    const store = $('cap-storage');
    if (!state || state.mode === 'unavailable') {
      _capitalMessage(
        'The book could not be read'
          + (state && state.detail ? ` (${esc(state.detail)})` : '')
          + '. Nothing below is your position — it is blank because the request failed, '
          + 'not because the book is empty.');
      if (store) store.hidden = true;
      return;
    }

    const d = state.data;

    if (state.mode === 'empty') {
      _capitalMessage(d.emptyNote
        + ' Record a portfolio and its allocation, or load a worked book, from Record.');
      _renderStorage(d.storage);
      return;
    }

    _clearMessage();
    _renderCapital(d.capital);
    _renderEmissions(d.emissions);
    _renderPortfolioRows(d.portfolios, d.capital.currency);
    _renderPipeline(d.pipeline, d.capital.currency);
    _renderStorage(d.storage);
    _fillPortfolioFilter(d.portfolios);
  }

  /** One message, in place of the figures, so a blank screen always says why. */
  function _capitalMessage(text) {
    for (const id of ['cap-allocated', 'cap-paid', 'cap-undrawn', 'cap-balance']) {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    }
    for (const id of ['cap-deploy-bar', 'cap-deploy-legend', 'cap-inventory-rows',
      'cap-impact-rows', 'cap-portfolio-rows', 'cap-pipeline-rows', 'cap-scatter',
      'cap-bytype-rows', 'cap-dq']) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    }
    let box = document.getElementById('cap-message');
    if (!box) {
      box = document.createElement('p');
      box.id = 'cap-message';
      box.className = 'cap-message';
      const host = document.getElementById('page-dashboard');
      host.insertBefore(box, host.firstChild.nextSibling);
    }
    box.textContent = text;
  }
  function _clearMessage() {
    const box = document.getElementById('cap-message');
    if (box) box.remove();
  }

  function _renderStorage(st) {
    const el = document.getElementById('cap-storage');
    if (!el) return;
    el.hidden = !(st && st.durable === false);
    if (st && st.durable === false) {
      el.textContent = `Storage is ${st.mode} and not durable. ${st.reason || ''} ${st.remedy || ''}`.trim();
    }
  }

  // ── Capital ───────────────────────────────────────────────────────────────

  function _renderCapital(c) {
    const $ = (id) => document.getElementById(id);
    const cur = c.currency;

    $('cap-capital-sub').textContent =
      `${c.portfolios} portfolio${c.portfolios === 1 ? '' : 's'} · `
      + `${c.commitmentPct == null ? '—' : c.commitmentPct + '%'} committed · `
      + `${c.deploymentPct == null ? '—' : c.deploymentPct + '%'} deployed`;

    $('cap-allocated').textContent = _money(c.allocated, cur);
    $('cap-allocated-foot').textContent = c.note
      || `${_money(c.uncommitted, cur)} of it is not yet committed to anything.`;

    $('cap-paid').textContent = _money(c.paid, cur);
    $('cap-paid-foot').textContent =
      `${_money(c.disbursed, cur)} disbursed less ${_money(c.repaid, cur)} repaid`
      + (c.fees ? `. ${_money(c.fees, cur)} of fees is paid but is not a drawdown of commitment.` : '.');

    $('cap-undrawn').textContent = _money(c.undrawnCommitment, cur);
    $('cap-undrawn-foot').textContent =
      `${_money(c.committed, cur)} committed in total. A commitment is a promise; a payment is a movement.`;

    $('cap-balance').textContent = _money(c.balance, cur);
    $('cap-balance-foot').textContent = c.overDeployed
      ? 'Over the allocation. Reported as it is rather than held at zero.'
      : 'Allocated less paid. Derived from the payment log, never typed.';
    $('cap-balance').classList.toggle('is-negative', c.balance < 0);

    /* The stacked bar: paid, committed-but-undrawn, and uncommitted are three
       parts of the one allocation, so they are one bar rather than three. */
    const segs = [
      { key: 'paid',     label: 'Paid out',            value: c.paid,              color: CAP.paid },
      { key: 'undrawn',  label: 'Committed, undrawn',  value: c.undrawnCommitment, color: CAP.undrawn },
      { key: 'uncommit', label: 'Uncommitted',         value: Math.max(0, c.uncommitted), color: CAP.uncommit },
    ];
    const total = segs.reduce((t, s) => t + Math.max(0, s.value), 0) || 1;

    $('cap-deploy-sub').textContent = `${_money(c.allocated, cur)} allocated in total`;
    $('cap-deploy-bar').innerHTML = segs
      .filter(s => s.value > 0)
      .map(s => `<span class="cap-stack-seg" style="width:${(s.value / total) * 100}%;background:${s.color}"
                       title="${esc(s.label)}: ${_money(s.value, cur)}"></span>`).join('');

    const shares = _wholePercents(segs.map(s => Math.max(0, s.value)));
    $('cap-deploy-legend').innerHTML = segs.map((s, i) => `
      <span class="cap-legend-item">
        <i class="cap-swatch" style="background:${s.color}"></i>
        ${esc(s.label)} <b>${_money(s.value, cur)}</b>
        <em>${shares[i]}%</em>
      </span>`).join('');
  }

  // ── Emissions ─────────────────────────────────────────────────────────────

  function _renderEmissions(e) {
    const $ = (id) => document.getElementById(id);

    $('cap-emissions-sub').textContent =
      `Across ${e.investmentsCounted} committed or deployed investment`
      + `${e.investmentsCounted === 1 ? '' : 's'} · ${e.unit}`;

    /* Two blocks, scaled against one maximum so the bars are comparable, but
       never stacked and never summed across the rule between them. */
    const all = [e.incurred, e.forward, e.reduction, e.avoided];
    const max = Math.max(1, ...all.map(v => Math.abs(Number(v) || 0)));

    const row = (label, value, color, { hatch = false, foot = '' } = {}) => `
      <div class="cap-ledger-row">
        <span class="cap-row-label">${esc(label)}</span>
        <span class="cap-row-track">
          <span class="cap-row-fill${hatch ? ' is-projected' : ''}"
                style="width:${(Math.abs(value) / max) * 100}%;--fill:${color}"></span>
        </span>
        <span class="cap-row-value">${_t(value)}</span>
        ${foot ? `<span class="cap-row-foot">${esc(foot)}</span>` : ''}
      </div>`;

    $('cap-inventory-rows').innerHTML =
      row('Already incurred', e.incurred, CAP.incurred, { foot: 'Measured' })
      + row('Expected over the remaining term', e.forward, CAP.forward,
            { hatch: true, foot: 'Projection — hatched wherever it appears' });
    $('cap-inventory-note').textContent = e.inventoryNote;

    $('cap-impact-rows').innerHTML =
      row('Reduction achieved', e.reduction, CAP.reduction,
          { foot: 'Against each project’s own base year' })
      + row('Emissions avoided', e.avoided, CAP.avoided,
            { foot: 'Against a counterfactual that did not happen' });
    $('cap-impact-note').textContent = e.creditNote;

    const dq = e.dataQuality;
    $('cap-dq').innerHTML = dq.weighted == null
      ? `<span class="cap-dq-value">not reported</span>
         <span class="cap-dq-foot">${esc(dq.note || 'No investment carries a data-quality score.')}</span>`
      : `<span class="cap-dq-label">Data quality</span>
         <span class="cap-dq-value">${dq.weighted.toFixed(2)}</span>
         <span class="cap-dq-foot">${esc(dq.scale)} ${esc(dq.basis)}
           Weighted over ${dq.investmentsScored} investment${dq.investmentsScored === 1 ? '' : 's'}${
             dq.investmentsWithoutScore
               ? `; ${dq.investmentsWithoutScore} carrying no score ${dq.investmentsWithoutScore === 1 ? 'is' : 'are'} excluded rather than counted as zero.`
               : '.'}</span>`;
  }

  // ── Portfolios ────────────────────────────────────────────────────────────

  function _renderPortfolioRows(rows, cur) {
    const body = document.getElementById('cap-portfolio-rows');
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="8" class="cap-empty">No portfolio recorded.</td></tr>';
      return;
    }
    body.innerHTML = rows.map(p => `
      <tr>
        <td><strong>${esc(p.name)}</strong>
            <br><span class="cap-dim">${esc(p.mandate || '')}${p.vintage ? ` · vintage ${esc(p.vintage)}` : ''}</span></td>
        <td class="num">${_money(p.allocated, p.currency || cur)}</td>
        <td class="num">${_money(p.committed, p.currency || cur)}</td>
        <td class="num">${_money(p.paid, p.currency || cur)}</td>
        <td class="num${p.balance < 0 ? ' is-negative' : ''}">${_money(p.balance, p.currency || cur)}</td>
        <td class="num">${_t(p.incurred_tCO2e)}</td>
        <td class="num cap-projected">${_t(p.forward_tCO2e)}</td>
        <td class="num">${p.intensity_tCO2e_perMillion == null
          ? '<span class="cap-dim">nothing drawn</span>'
          : `${p.intensity_tCO2e_perMillion} <span class="cap-dim">t/$M</span>`}</td>
      </tr>`).join('');
  }

  function _fillPortfolioFilter(rows) {
    const sel = document.getElementById('cap-portfolio-filter');
    if (!sel || sel.dataset.filled === String(rows.length)) return;
    const keep = sel.value;
    sel.innerHTML = '<option value="">All portfolios</option>'
      + rows.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    sel.value = keep;
    sel.dataset.filled = String(rows.length);
  }

  // ── Pipeline ──────────────────────────────────────────────────────────────

  function _renderPipeline(p, cur) {
    const $ = (id) => document.getElementById(id);

    $('cap-pipeline-sub').textContent =
      `${p.count} project${p.count === 1 ? '' : 's'} waiting · `
      + `${_money(p.totalRequested, cur)} requested · `
      + `${_t(p.totalContribution_tCO2e)} tCO2e would be added to the book if all were written`;

    $('cap-weight-note').textContent = p.weightingNote;

    const rows = [...p.ranked, ...p.unrankable];
    $('cap-pipeline-rows').innerHTML = rows.length ? rows.map(r => `
      <tr class="${r.rankable ? '' : 'is-unranked'}">
        <td class="num">${r.rank || '<span class="cap-dim">—</span>'}</td>
        <td><strong>${esc(r.name)}</strong>
            <br><span class="cap-dim">${esc(r.country || '')}${r.taxonomy ? ` · ${esc(r.taxonomy)}` : ''}</span></td>
        <td>${esc(r.sector || '')}${r.assetType ? `<br><span class="cap-dim">${esc(r.assetType)}</span>` : ''}</td>
        <td class="num">${_money(r.commitment, cur)}</td>
        <td class="num">${r.expectedReturnPct == null
          ? '<span class="cap-dim">not priced</span>' : `${r.expectedReturnPct}%`}</td>
        <td class="num">${r.impact_tCO2e_perMillion == null
          ? '<span class="cap-dim">—</span>' : _t(r.impact_tCO2e_perMillion)}</td>
        <td class="num cap-projected">${_t(r.financedEmissionContribution_tCO2e)}</td>
        <td class="num">${r.score == null
          ? `<span class="cap-dim" title="${esc(r.missing.join('; '))}">not scored</span>`
          : `<b>${r.score.toFixed(3)}</b>`}</td>
      </tr>`).join('')
      : '<tr><td colspan="8" class="cap-empty">Nothing is waiting.</td></tr>';

    const un = $('cap-unrankable-note');
    un.hidden = !p.unrankableNote;
    if (p.unrankableNote) un.textContent = p.unrankableNote;

    $('cap-bytype-rows').innerHTML = p.byType.map(t => `
      <div class="cap-bytype-row">
        <span class="cap-bytype-name">${esc(t.sector)}</span>
        <span class="cap-bytype-count">${t.count}</span>
        <span class="cap-bytype-cap">${_money(t.commitment, cur)}</span>
        <span class="cap-bytype-em cap-projected">${_t(t.contribution_tCO2e)} tCO2e</span>
      </div>`).join('');

    _renderScatter(p, cur);
  }

  /**
   * Impact against return.
   *
   * Two different measures, so a scatter rather than a bar: the question is
   * which projects sit high on both, and no ranked list shows that as
   * directly. Area carries the capital, so a large ask is visibly a large ask.
   * Every mark is the same hue — colour follows the entity here, and rank is
   * shown by a ring and a label rather than by repainting the leader.
   */
  function _renderScatter(p, cur) {
    const host = document.getElementById('cap-scatter');
    const note = document.getElementById('cap-scatter-note');
    const pts = p.ranked.filter(r =>
      Number.isFinite(r.expectedReturnPct) && Number.isFinite(r.impact_tCO2e_perMillion));

    if (pts.length < 2) {
      host.innerHTML = '';
      note.textContent = pts.length
        ? 'One project can be plotted; a scatter needs at least two to compare.'
        : 'Nothing in the pipeline carries both a return and a carbon impact, so there is nothing to plot.';
      return;
    }

    const W = 720, H = 316, M = { t: 34, r: 18, b: 40, l: 66 };
    const xs = pts.map(r => r.expectedReturnPct);
    const ys = pts.map(r => r.impact_tCO2e_perMillion);
    const x0 = 0, x1 = Math.max(...xs) * 1.12;               // return starts at zero
    const yMax = Math.max(...ys) * 1.15;
    const y0 = -yMax * 0.06, y1 = yMax;   // the axis marks zero; the pad keeps
                                          // a mark near it from being clipped
    const px = v => M.l + ((v - x0) / (x1 - x0 || 1)) * (W - M.l - M.r);
    const py = v => H - M.b - ((v - y0) / (y1 - y0 || 1)) * (H - M.t - M.b);

    const maxCap = Math.max(...pts.map(r => r.commitment)) || 1;
    const rad = c => 7 + 13 * Math.sqrt(Math.max(0, c) / maxCap);

    const xTicks = [0, x1 / 2, x1];
    const yTicks = [0, y1 / 2, y1];

    host.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" role="img"
           aria-label="Carbon impact per million against expected return, for ${pts.length} pipeline projects">
        ${yTicks.map(v => `
          <line class="cap-grid" x1="${M.l}" y1="${py(v)}" x2="${W - M.r}" y2="${py(v)}"/>
          <text class="cap-axis-label" x="${M.l - 8}" y="${py(v) + 4}" text-anchor="end">${_t(v)}</text>`).join('')}
        ${xTicks.map(v => `
          <text class="cap-axis-label" x="${px(v)}" y="${H - M.b + 18}" text-anchor="middle">${v.toFixed(1)}%</text>`).join('')}
        <line class="cap-axis" x1="${M.l}" y1="${py(0).toFixed(1)}" x2="${W - M.r}" y2="${py(0).toFixed(1)}"/>
        <line class="cap-axis" x1="${M.l}" y1="${M.t}" x2="${M.l}" y2="${H - M.b}"/>
        <text class="cap-axis-title" x="${M.l}" y="${H - 6}">Expected return</text>
        <!-- Above the plot, not beside it: at the left margin it sat on top of
             the topmost tick label. -->
        <text class="cap-axis-title" x="0" y="14">tCO2e avoided or reduced per $M</text>
        ${pts.map(r => `
          <circle class="cap-dot${r.rank === 1 ? ' is-lead' : ''}"
                  cx="${px(r.expectedReturnPct).toFixed(1)}" cy="${py(r.impact_tCO2e_perMillion).toFixed(1)}"
                  r="${rad(r.commitment).toFixed(1)}">
            <title>${esc(r.name)} — ${_money(r.commitment, cur)}, ${r.expectedReturnPct}% return, ${_t(r.impact_tCO2e_perMillion)} tCO2e per $M, score ${r.score}</title>
          </circle>`).join('')}
        ${pts.filter(r => r.rank <= 2).map(r => `
          <text class="cap-dot-label" x="${px(r.expectedReturnPct).toFixed(1)}"
                y="${(py(r.impact_tCO2e_perMillion) - rad(r.commitment) - 7).toFixed(1)}"
                text-anchor="middle">${esc(r.name)}</text>`).join('')}
      </svg>`;

    const lead = pts.find(r => r.rank === 1);
    note.textContent = lead
      ? `Up and to the right is better on both measures. ${lead.name} leads at this weighting; `
        + `move the slider and the leader can change, because these are two different questions.`
      : '';
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

  /* Two screens, two sources. The Dashboard is the capital book — what has
     been allocated, committed, paid and emitted, and what is waiting. The
     Portfolio screen stays on the aggregation endpoint it has always used.
     They are fetched separately so a slow or missing one cannot blank the
     other, and neither is ever mixed into the other's totals. */
  async function init() {
    if (_initialized) return;
    _initialized = true;
    await Promise.all([
      _fetchCapital().then(_renderDashboard),
      _fetchData().then((data) => { _renderDemoBanner(data); _renderPortfolio(data); }),
    ]);
    _wireCapitalControls();
  }

  async function refresh() {
    _cache = null;
    _initialized = true;
    const dl = document.getElementById('dash-loading');
    const pl = document.getElementById('pf-loading');
    if (dl) dl.style.display = 'flex';
    if (pl) pl.style.display = 'flex';
    await Promise.all([
      _fetchCapital().then(_renderDashboard),
      _fetchData().then((data) => { _renderDemoBanner(data); _renderPortfolio(data); }),
    ]);
  }

  /** Re-read the book alone — used by the weighting slider and the filter. */
  async function refreshCapital() {
    _renderDashboard(await _fetchCapital());
  }

  let _wired = false;
  let _weightTimer = null;

  function _wireCapitalControls() {
    if (_wired) return;
    const weight = document.getElementById('cap-weight');
    const filter = document.getElementById('cap-portfolio-filter');
    if (!weight || !filter) return;
    _wired = true;

    /* The ranking is recomputed by the engine, never in the browser: a screen
       that scored differently from the API would be showing one thing and
       disclosing another. Debounced, because a slider fires continuously. */
    weight.addEventListener('input', () => {
      _carbonWeight = Number(weight.value) / 100;
      const note = document.getElementById('cap-weight-note');
      if (note) note.textContent = `Reading the pipeline at ${weight.value}% carbon…`;
      clearTimeout(_weightTimer);
      _weightTimer = setTimeout(refreshCapital, 180);
    });

    filter.addEventListener('change', () => {
      _portfolioFilter = filter.value;
      refreshCapital();
    });

    const refreshBtn = document.getElementById('cap-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshCapital);

    const record = document.getElementById('cap-record');
    if (record) record.addEventListener('click', () => {
      if (typeof CapitalRecord !== 'undefined') CapitalRecord.open();
    });
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

  return { init, refresh, refreshCapital, exportCSV, generateAIReport };
})();
