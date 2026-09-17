/* ============================================================
   CarbonIQ — charts
   ============================================================
   Small SVG drawings for figures another module already holds. This file
   is geometry: it scales a value to a width and places a label. It fetches
   nothing, sums nothing and decides nothing — a chart that computed its
   own total would be a second engine, and the rule on every PCAF screen is
   that the browser renders the engines rather than repeating them.

   Every drawing carries role="img" and a label for a reader who cannot see
   it, and sizes by viewBox so it follows its container at a phone width.
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
  const ROW = 30;
  const TOP = 4;

  /**
   * Horizontal bars, one per row, scaled to the largest value among them.
   * A row may carry segments — each drawn at its own value from the left,
   * inside the row's bar — so a headline can show what it is made of without
   * the drawing adding anything up: the bar is the value, the segments are
   * theirs, and where they fall short of the bar the track shows through.
   *
   * rows: [{ key, label, value, color, dim, segments?: [{ label, value, color }] }]
   * opts: { label, decimals }
   */
  function hbars(rows, opts = {}) {
    /* Compact: a drawing that sits inside a card rather than across a panel —
       a narrower label column and shorter rows, the same geometry. */
    const compact = Boolean(opts.compact);
    const LW = compact ? 160 : 200;
    const VW = compact ? 84 : 96;
    const PAD = 6;
    const W = compact ? 460 : WIDE;
    const RH = compact ? 22 : ROW;
    const max = ceiling(rows);
    const usable = W - LW - VW - PAD;
    const px = v => (max > 0 && finite(v) ? (Math.max(0, v) / max) * usable : 0);
    const H = TOP + rows.length * RH + 4;
    const d = opts.decimals === undefined ? 0 : opts.decimals;
    const bars = rows.map((r, i) => {
      const y = TOP + i * RH;
      let x = LW;
      const segs = (r.segments || []).map(s => {
        const w = px(s.value);
        const out = `<rect x="${x.toFixed(1)}" y="${y + 6}" width="${w.toFixed(1)}" height="${RH - 12}" rx="3" style="fill:${esc(s.color)}"><title>${esc(s.label)}: ${fmt(s.value, d)}</title></rect>`;
        x += w;
        return out;
      }).join('');
      const whole = `<rect x="${LW}" y="${y + 6}" width="${px(r.value).toFixed(1)}" height="${RH - 12}" rx="3" style="fill:${esc(r.color || 'currentColor')}"><title>${esc(r.label)}: ${fmt(r.value, d)}</title></rect>`;
      return `<g class="ch-row${r.dim ? ' is-dim' : ''}" data-key="${esc(r.key || '')}">
        <text class="ch-label" x="${LW - 8}" y="${y + RH / 2 + 4}" text-anchor="end">${esc(r.label)}</text>
        <rect class="ch-track" x="${LW}" y="${y + 6}" width="${usable}" height="${RH - 12}" rx="3"/>
        ${segs || whole}
        <text class="ch-value" x="${LW + usable + 8}" y="${y + RH / 2 + 4}">${fmt(r.value, d)}</text>
      </g>`;
    }).join('');
    return `<svg class="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || 'Bars')}">${bars}</svg>`;
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
    const LW = 200;
    const PAD = 8;
    const W = WIDE;
    const RH = ROW;
    const usable = W - LW - PAD;
    const H = TOP + rows.length * RH + 4;
    const bars = rows.map((r, i) => {
      const y = TOP + i * RH;
      let x = LW;
      const segs = (r.segments || []).map(s => {
        const w = finite(s.share) ? Math.max(0, Math.min(1, s.share)) * usable : 0;
        const out = `<rect x="${x.toFixed(1)}" y="${y + 6}" width="${w.toFixed(1)}" height="${RH - 12}" style="fill:${esc(s.color)}"><title>${esc(s.label)}: ${fmt(s.share * 100, 1)}%</title></rect>`;
        x += w;
        return out;
      }).join('');
      return `<g class="ch-row${r.dim ? ' is-dim' : ''}" data-key="${esc(r.key || '')}">
        <text class="ch-label" x="${LW - 8}" y="${y + RH / 2 + 4}" text-anchor="end">${esc(r.label)}</text>
        <rect class="ch-track" x="${LW}" y="${y + 6}" width="${usable}" height="${RH - 12}" rx="3"/>
        ${segs}
      </g>`;
    }).join('');
    return `<svg class="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || 'Shares')}">${bars}</svg>`;
  }

  /** A ring showing one percentage, the figure in the middle; a dash where none is held. */
  function ring(pct, opts = {}) {
    const R = 44;
    const S = 120;
    const C = 2 * Math.PI * R;
    const p = finite(pct) ? Math.max(0, Math.min(100, pct)) : null;
    const dash = p === null ? 0 : (C * p) / 100;
    return `<svg class="ch ch-ring" viewBox="0 0 ${S} ${S}" role="img" aria-label="${esc(opts.label || 'Share')}: ${p === null ? 'not stated' : `${fmt(p, 1)}%`}">
      <circle class="ch-track" cx="${S / 2}" cy="${S / 2}" r="${R}" fill="none" stroke-width="12"/>
      <circle cx="${S / 2}" cy="${S / 2}" r="${R}" fill="none" stroke-width="12" style="stroke:${esc(opts.color || 'currentColor')}"
        stroke-dasharray="${dash.toFixed(1)} ${(C - dash).toFixed(1)}" stroke-linecap="round" transform="rotate(-90 ${S / 2} ${S / 2})"/>
      <text class="ch-ring-value" x="${S / 2}" y="${S / 2 + 7}" text-anchor="middle">${p === null ? '—' : `${fmt(p, 1)}%`}</text>
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
    return `<div class="ch-legend">${items.map(i => `<span class="ch-key"><i style="background:${esc(i.color)}"></i>${esc(i.label)}</span>`).join('')}</div>`;
  }

  return { hbars, shares, ring, scale, legend };
})();
