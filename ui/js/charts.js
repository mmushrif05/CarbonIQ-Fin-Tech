/* ============================================================
   CarbonIQ — charts
   ============================================================
   Small SVG drawings for figures another module already holds. This file
   is geometry: it scales a value to a width and places a label. It fetches
   nothing, sums nothing and decides nothing — a chart that computed its
   own total would be a second engine, and the rule on every PCAF screen is
   that the browser renders the engines rather than repeating them.

   The marks follow one spec. A bar is thin, grows from one baseline, is
   square at the baseline and rounded at its data end; touching fills are
   parted by a gap in the surface colour rather than a stroke; the value
   sits at the tip; the grid is a hairline. Text wears the text tokens and
   never the series colour — identity comes from the mark beside it. Every
   drawing carries role="img" and a label for a reader who cannot see it,
   sizes by viewBox so it follows its container at a phone width, and has
   a hover and focus readout and a table twin, so no value is reachable by
   colour alone.

   Colour is handed in by the caller as a CSS value, so one hue means one
   asset class on every panel of a screen and the palette lives in one
   stylesheet rather than here.
   ============================================================ */

'use strict';

const Charts = (() => {
  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const fmt = (v, d = 0) => (finite(v)
    ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
    : '—');

  /* The largest row value, for the axis. Zero when nothing is finite, and a
     zero axis draws every bar at nothing rather than dividing by it. */
  function ceiling(rows) {
    let max = 0;
    for (const r of rows) if (finite(r.value) && r.value > max) max = r.value;
    return max;
  }

  const WIDE = 640;
  const ROW = 28;
  const TOP = 4;
  const R = 4;

  /* A bar square at the baseline and rounded at its data end. */
  function bar(x, y, w, h, round) {
    if (!(w > 0)) return '';
    const r = round ? Math.min(R, w / 2, h / 2) : 0;
    return `M${x.toFixed(1)},${y.toFixed(1)}h${(w - r).toFixed(1)}a${r},${r} 0 0 1 ${r},${r}v${(h - 2 * r).toFixed(1)}a${r},${r} 0 0 1 -${r},${r}h-${(w - r).toFixed(1)}z`;
  }

  /* The readout a mark carries: a title and its rows, kept as data on the
     mark and built into the tooltip as text, never as markup. */
  const tip = (title, rows) => esc(JSON.stringify({ t: String(title || ''), r: rows.map(r => [String(r[0]), String(r[1])]) }));

  /**
   * Horizontal bars, one per row, scaled to the largest value among them.
   * A row may carry segments — each drawn at its own value from the left,
   * inside the row's bar — so a headline can show what it is made of without
   * the drawing adding anything up: the bar is the value, the segments are
   * theirs, and where they fall short of the bar the remainder is the row's
   * own colour. Segments are parted by a gap in the surface colour.
   *
   * A row marked `projected` is hatched: the one texture in the system, and
   * it means not measured. The pattern is drawn in the row's own colour.
   *
   * rows: [{ key, label, value, color, dim, projected?, segments?: [{ label, value, color }] }]
   * opts: { label, decimals, compact, unit }
   */
  function hbars(rows, opts = {}) {
    /* Compact: a drawing that sits inside a card rather than across a panel —
       a narrower label column and shorter rows, the same geometry. */
    const compact = Boolean(opts.compact);
    const LW = compact ? 150 : 190;
    const VW = compact ? 80 : 96;
    const PAD = 6;
    const W = compact ? 460 : WIDE;
    const RH = compact ? 22 : ROW;
    const BH = compact ? 10 : 14;
    const max = ceiling(rows);
    const usable = W - LW - VW - PAD;
    const px = v => (max > 0 && finite(v) ? (Math.max(0, v) / max) * usable : 0);
    const H = TOP + rows.length * RH + 4;
    const d = opts.decimals === undefined ? 0 : opts.decimals;
    const unit = opts.unit ? ` ${opts.unit}` : '';
    const pid = `chh-${Math.random().toString(36).slice(2, 8)}`;
    const hatches = rows.map((r, i) => (r.projected
      ? `<pattern id="${pid}-${i}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" class="ch-hatch-ground"/><rect width="3" height="6" style="fill:${esc(r.color || 'currentColor')}"/></pattern>` : '')).join('');
    const fillOf = (r, i) => (r.projected ? `url(#${pid}-${i})` : (r.color || 'currentColor'));
    const bars = rows.map((r, i) => {
      const y = TOP + i * RH;
      const by = y + (RH - BH) / 2;
      const whole = px(r.value);
      let x = LW;
      const segs = (r.segments || []).filter(s => px(s.value) > 0);
      const parts = segs.map((s, j) => {
        const w = px(s.value);
        const last = j === segs.length - 1 && x + w >= LW + whole - 0.5;
        const out = `<path d="${bar(x, by, w, BH, last)}" style="fill:${esc(s.color)}"/>`
          + (j < segs.length - 1 || !last ? `<rect class="ch-gap" x="${(x + w - 1).toFixed(1)}" y="${by}" width="2" height="${BH}"/>` : '');
        x += w;
        return out;
      }).join('');
      const rest = whole - (x - LW);
      const remainder = segs.length && rest > 0.5 ? `<path d="${bar(x, by, rest, BH, true)}" style="fill:${esc(r.color || 'currentColor')}"/>` : '';
      const body = segs.length ? parts + remainder : `<path d="${bar(LW, by, whole, BH, true)}" style="fill:${esc(fillOf(r, i))}"/>`;
      const readout = tip(r.label, [[opts.valueLabel || 'Value', `${fmt(r.value, d)}${unit}`], ...(r.projected ? [['Basis', 'Projection — not measured']] : []), ...(r.segments || []).map(s => [s.label, `${fmt(s.value, d)}${unit}`])]);
      return `<g class="ch-row${r.dim ? ' is-dim' : ''}${r.projected ? ' is-projected' : ''}" data-key="${esc(r.key || '')}" tabindex="0" data-tip="${readout}">
        <rect class="ch-hit" x="0" y="${y}" width="${W}" height="${RH}"/>
        <text class="ch-label" x="${LW - 10}" y="${y + RH / 2 + 4}" text-anchor="end">${esc(r.label)}</text>
        ${body}
        <text class="ch-value" x="${(LW + whole + 8).toFixed(1)}" y="${y + RH / 2 + 4}">${fmt(r.value, d)}</text>
      </g>`;
    }).join('');
    return `<svg class="ch ch-hbars" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || 'Bars')}">
      ${hatches ? `<defs>${hatches}</defs>` : ''}<line class="ch-axis" x1="${LW}" y1="${TOP}" x2="${LW}" y2="${H - 4}"/>${bars}</svg>`;
  }

  /**
   * One full-width bar per row, split into shares the caller already holds
   * as fractions of one. Where the shares fall short of one the track shows
   * through, which is what "not scored" looks like — the drawing never
   * invents a remainder.
   *
   * rows: [{ key, label, dim, segments: [{ label, share, color }] }]
   */
  function shares(rows, opts = {}) {
    const LW = 190;
    const PAD = 8;
    const W = WIDE;
    const RH = ROW;
    const BH = 14;
    const usable = W - LW - PAD;
    const H = TOP + rows.length * RH + 4;
    const bars = rows.map((r, i) => {
      const y = TOP + i * RH;
      const by = y + (RH - BH) / 2;
      let x = LW;
      const segs = (r.segments || []).filter(s => finite(s.share) && s.share > 0);
      const parts = segs.map((s, j) => {
        const w = Math.max(0, Math.min(1, s.share)) * usable;
        const last = j === segs.length - 1;
        const out = `<path d="${bar(x, by, w, BH, last)}" style="fill:${esc(s.color)}"/>`
          + (last ? '' : `<rect class="ch-gap" x="${(x + w - 1).toFixed(1)}" y="${by}" width="2" height="${BH}"/>`);
        x += w;
        return out;
      }).join('');
      const readout = tip(r.label, segs.map(s => [s.label, `${fmt(s.share * 100, 1)}%`]));
      return `<g class="ch-row${r.dim ? ' is-dim' : ''}" data-key="${esc(r.key || '')}" tabindex="0" data-tip="${readout}">
        <rect class="ch-hit" x="0" y="${y}" width="${W}" height="${RH}"/>
        <text class="ch-label" x="${LW - 10}" y="${y + RH / 2 + 4}" text-anchor="end">${esc(r.label)}</text>
        <rect class="ch-track" x="${LW}" y="${by}" width="${usable}" height="${BH}" rx="${R}"/>
        ${parts}
      </g>`;
    }).join('');
    return `<svg class="ch ch-shares" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || 'Shares')}">${bars}</svg>`;
  }

  /** A ring showing one percentage, the figure in the middle; a dash where none is held. */
  function ring(pct, opts = {}) {
    const RR = 44;
    const S = 120;
    const C = 2 * Math.PI * RR;
    const p = finite(pct) ? Math.max(0, Math.min(100, pct)) : null;
    const dash = p === null ? 0 : (C * p) / 100;
    const readout = tip(opts.label || 'Share', [[opts.valueLabel || 'Share', p === null ? 'not stated' : `${fmt(p, 1)}%`]]);
    return `<svg class="ch ch-ring" viewBox="0 0 ${S} ${S}" role="img" aria-label="${esc(opts.label || 'Share')}: ${p === null ? 'not stated' : `${fmt(p, 1)}%`}" tabindex="0" data-tip="${readout}">
      <circle class="ch-track" cx="${S / 2}" cy="${S / 2}" r="${RR}" fill="none" stroke-width="9"/>
      <circle cx="${S / 2}" cy="${S / 2}" r="${RR}" fill="none" stroke-width="9" style="stroke:${esc(opts.color || 'currentColor')}"
        stroke-dasharray="${dash.toFixed(1)} ${(C - dash).toFixed(1)}" stroke-linecap="round" transform="rotate(-90 ${S / 2} ${S / 2})"/>
      <text class="ch-ring-value" x="${S / 2}" y="${S / 2 + (opts.sublabel ? 3 : 8)}" text-anchor="middle">${p === null ? '—' : `${fmt(p, opts.decimals === undefined ? 1 : opts.decimals)}%`}</text>
      ${opts.sublabel ? `<text class="ch-ring-sub" x="${S / 2}" y="${S / 2 + 20}" text-anchor="middle">${esc(opts.sublabel)}</text>` : ''}
    </svg>`;
  }

  /**
   * A score on a scale of five cells, 1 at the left and 5 at the right, the
   * cell the score sits in filled in the hue the caller hands for it. It is
   * a category on a scale — never a fraction of five — so the ends carry
   * the words "highest" and "lowest" rather than a denominator.
   *
   * colors: five CSS values, one per score, in the order of the scale.
   */
  function scale(score, opts = {}) {
    const S = finite(score) ? Math.round(score) : null;
    const BW = 56, BH = 26, GAP = 6, X0 = 2, Y0 = 2;
    const colors = opts.colors || [];
    const cells = [1, 2, 3, 4, 5].map((n, i) => {
      const x = X0 + i * (BW + GAP);
      const on = S === n;
      return `<rect class="ch-scale-box${on ? ' is-on' : ''}" x="${x}" y="${Y0}" width="${BW}" height="${BH}" rx="7"${on ? ` style="fill:${esc(colors[i] || 'currentColor')}"` : ''}/>
        <text class="ch-scale-n${on ? ' is-on' : ''}" x="${x + BW / 2}" y="${Y0 + BH / 2 + 5}" text-anchor="middle">${n}</text>`;
    }).join('');
    const W = X0 * 2 + 5 * BW + 4 * GAP;
    return `<svg class="ch ch-scale" viewBox="0 0 ${W} ${BH + 22}" role="img" aria-label="${esc(opts.label || 'Score')}: ${S === null ? 'not scored' : `${S} on the scale from 1, the highest quality, to 5, the lowest`}">
      ${cells}
      <text class="ch-scale-end" x="${X0}" y="${BH + 17}">1 · highest quality</text>
      <text class="ch-scale-end" x="${W - X0}" y="${BH + 17}" text-anchor="end">5 · lowest</text>
    </svg>`;
  }

  /** A key beneath a drawing: a swatch and a word per item. */
  function legend(items) {
    return `<div class="ch-legend" role="list">${items.map(i => `<span class="ch-key" role="listitem"><i style="background:${esc(i.color)}"></i>${esc(i.label)}</span>`).join('')}</div>`;
  }

  /**
   * The table twin of a drawing: the same rows as text, one line per row
   * and one indented line per segment, so every value is reachable without
   * a pointer. Shares print as percentages; values print as handed.
   */
  function table(rows, opts = {}) {
    const d = opts.decimals === undefined ? 0 : opts.decimals;
    const isShare = rows.some(r => (r.segments || []).some(s => s.share !== undefined));
    const cell = (v, share) => (share ? `${fmt(v * 100, 1)}%` : fmt(v, d));
    const body = rows.map(r => `<tr><th scope="row">${esc(r.label)}</th><td class="num">${r.value === undefined ? '' : cell(r.value, false)}</td></tr>`
      + (r.segments || []).map(s => `<tr class="ch-table-seg"><th scope="row">${esc(s.label)}</th><td class="num">${cell(s.share !== undefined ? s.share : s.value, s.share !== undefined)}</td></tr>`).join('')).join('');
    return `<table class="ch-table"><thead><tr><th scope="col">${esc(opts.head || 'Item')}</th><th scope="col" class="num">${esc(isShare ? 'Share' : (opts.unit || 'Value'))}</th></tr></thead><tbody>${body}</tbody></table>`;
  }

  /**
   * A figure: the drawing, its legend, and the table twin behind a toggle.
   * The caller hands the drawing already made and the rows it was made
   * from; the figure lays them out and decides nothing.
   */
  function figure(chart, rows, opts = {}) {
    const id = `chf-${Math.random().toString(36).slice(2, 8)}`;
    return `<figure class="ch-fig" data-view="chart">
      <div class="ch-fig-head">${opts.title ? `<figcaption class="ch-fig-title">${esc(opts.title)}</figcaption>` : '<span></span>'}
        <div class="ch-view" role="group" aria-label="Show as">
          <button type="button" class="ch-view-btn is-on" data-view="chart" aria-pressed="true" aria-controls="${id}-chart">Chart</button>
          <button type="button" class="ch-view-btn" data-view="table" aria-pressed="false" aria-controls="${id}-table">Table</button>
        </div></div>
      <div class="ch-fig-chart" id="${id}-chart">${chart}${opts.legend ? legend(opts.legend) : ''}</div>
      <div class="ch-fig-table" id="${id}-table" hidden>${table(rows, opts)}</div>
      ${opts.caption ? `<p class="ch-fig-caption">${esc(opts.caption)}</p>` : ''}
    </figure>`;
  }

  // ── the hover layer, mounted once ──────────────────────────

  let mounted = false;
  let tipEl = null;

  function readout(el) {
    let data = null;
    try { data = JSON.parse(el.getAttribute('data-tip') || 'null'); } catch (_) { data = null; }
    if (!data) return false;
    while (tipEl.firstChild) tipEl.removeChild(tipEl.firstChild);
    const t = document.createElement('div');
    t.className = 'ch-tip-title';
    t.textContent = data.t;
    tipEl.appendChild(t);
    for (const [k, v] of data.r || []) {
      const row = document.createElement('div');
      row.className = 'ch-tip-row';
      const val = document.createElement('b');
      val.textContent = v;
      const key = document.createElement('span');
      key.textContent = k;
      row.appendChild(val);
      row.appendChild(key);
      tipEl.appendChild(row);
    }
    return true;
  }

  function place(x, y) {
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = x + 14, top = y + 14;
    if (left + w > vw - 8) left = Math.max(8, x - w - 14);
    if (top + h > vh - 8) top = Math.max(8, y - h - 14);
    tipEl.style.left = `${left}px`;
    tipEl.style.top = `${top}px`;
  }

  function showFor(el, x, y) {
    if (!readout(el)) return;
    tipEl.hidden = false;
    el.classList.add('is-hover');
    place(x, y);
  }

  function hide(el) {
    tipEl.hidden = true;
    if (el) el.classList.remove('is-hover');
  }

  const target = ev => (ev.target && ev.target.closest ? ev.target.closest('[data-tip]') : null);

  function mount() {
    if (mounted || typeof document === 'undefined' || !document.body) return;
    mounted = true;
    tipEl = document.createElement('div');
    tipEl.className = 'ch-tip';
    tipEl.setAttribute('role', 'tooltip');
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
    let current = null;
    document.addEventListener('pointerover', ev => {
      const el = target(ev);
      if (!el || el === current) return;
      if (current) hide(current);
      current = el;
      showFor(el, ev.clientX, ev.clientY);
    });
    document.addEventListener('pointermove', ev => { if (current && !tipEl.hidden) place(ev.clientX, ev.clientY); });
    document.addEventListener('pointerout', ev => {
      const el = target(ev);
      if (!el || el !== current) return;
      const to = ev.relatedTarget && ev.relatedTarget.closest ? ev.relatedTarget.closest('[data-tip]') : null;
      if (to === el) return;
      hide(current);
      current = null;
    });
    document.addEventListener('focusin', ev => {
      const el = target(ev);
      if (!el) return;
      if (current) hide(current);
      current = el;
      const b = el.getBoundingClientRect();
      showFor(el, b.left + Math.min(b.width, 160), b.top);
    });
    document.addEventListener('focusout', ev => {
      const el = target(ev);
      if (el && el === current) { hide(current); current = null; }
    });
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && current) { hide(current); current = null; } });
    /* The table toggle on every figure. */
    document.addEventListener('click', ev => {
      const btn = ev.target && ev.target.closest ? ev.target.closest('.ch-view-btn') : null;
      if (!btn) return;
      const fig = btn.closest('.ch-fig');
      if (!fig) return;
      const view = btn.getAttribute('data-view');
      fig.setAttribute('data-view', view);
      for (const b of fig.querySelectorAll('.ch-view-btn')) {
        const on = b.getAttribute('data-view') === view;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
      const chart = fig.querySelector('.ch-fig-chart'), tbl = fig.querySelector('.ch-fig-table');
      if (chart) chart.hidden = view !== 'chart';
      if (tbl) tbl.hidden = view !== 'table';
    });
  }

  if (typeof document !== 'undefined') {
    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount);
  }

  return { hbars, shares, ring, scale, legend, table, figure, mount };
})();
