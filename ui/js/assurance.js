// @ts-check
/**
 * The assurance badge — one declaration, read once, rendered the same
 * everywhere.
 *
 * A data-quality score says how good the evidence behind a figure is. It does
 * not say whether anyone independent has checked it, and those are different
 * questions a reader weighs together. The score without the badge invites the
 * reader to supply the missing half themselves, usually generously.
 *
 * Three states and no fourth. "Assurance not stated" is not "not assured":
 * one is the absence of any statement, the other is a statement the entity has
 * made, and rendering the first as the second puts words in their mouth.
 *
 * It is fetched once and cached for the session because the declaration is
 * entity-level — it does not vary by screen, and three screens fetching it
 * separately is three chances for them to disagree.
 */
window.CarbonIQAssurance = (function () {
  'use strict';

  let _cache = null;
  let _inflight = null;
  let _mode = null;
  let _modeInflight = null;

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** The shape the engine returns when nothing can be fetched at all. */
  const UNKNOWN = {
    status: 'not_declared',
    tone: 'quiet',
    label: 'Assurance not stated',
    detail: 'Whether these figures have been externally assured is a statement only the '
      + 'reporting entity can make. It has not been recorded.',
    declared: false,
  };

  async function load() {
    if (_cache) return _cache;
    if (_inflight) return _inflight;
    _inflight = (async () => {
      try {
        const res = await window.CARBONIQ_fetch('/v1/assurance');
        const body = await res.json();
        if (!res.ok) throw new Error(body.message || 'unavailable');
        _cache = body.assurance;
      } catch (_) {
        /* A declaration that could not be read is not a declaration of "no".
           The badge falls back to the same absent state it would show if
           nothing had been recorded. */
        _cache = { source: 'unavailable', scopes: { financed: UNKNOWN, insurance: UNKNOWN } };
      }
      _inflight = null;
      return _cache;
    })();
    return _inflight;
  }

  /** The declaration for one scope, from a payload that already carries it. */
  function forScope(payload, scope) {
    const a = payload && payload.scopes ? payload : _cache;
    return (a && a.scopes && a.scopes[scope]) || UNKNOWN;
  }

  /**
   * The badge. `title` carries the detail rather than a second line of copy,
   * because this sits beside a figure and must not become a paragraph.
   */
  function badgeHtml(decl) {
    const d = decl || UNKNOWN;
    return `<span class="assur-badge is-${esc(d.tone || 'quiet')}" title="${esc(d.detail || '')}">`
      + `<span class="assur-dot" aria-hidden="true"></span>${esc(d.label)}</span>`;
  }

  /** Render into every `[data-assurance]` placeholder under `root`. */
  async function render(root) {
    const scopeEl = (root || document).querySelectorAll('[data-assurance]');
    if (!scopeEl.length) return 0;
    const a = await load();
    scopeEl.forEach((el) => {
      el.innerHTML = badgeHtml(forScope(a, el.dataset.assurance));
    });
    return scopeEl.length;
  }

  /*
   * The operating mode is a second, separate fact, and it belongs to the tool
   * provider rather than to the entity. The declaration answers "who checked
   * these figures"; the mode answers "what may this deployment claim about
   * them", which is the sentence printed on the face of every document. Read
   * from the same module because a screen showing one without the other tells
   * half the story, and cached for the same reason the declaration is.
   */
  const MODE_UNKNOWN = {
    mode: 'self_declared',
    label: 'Self-declared',
    downgraded: false,
    statement: '',
    unmet: [],
  };

  async function loadMode() {
    if (_mode) return _mode;
    if (_modeInflight) return _modeInflight;
    _modeInflight = (async () => {
      try {
        const res = await window.CARBONIQ_fetch('/v1/assurance/mode');
        const body = await res.json();
        if (!res.ok) throw new Error(body.message || 'unavailable');
        _mode = body;
      } catch (_) {
        /* A mode that could not be read falls back to the weaker claim, never
           the stronger one. */
        _mode = MODE_UNKNOWN;
      }
      _modeInflight = null;
      return _mode;
    })();
    return _modeInflight;
  }

  /** The mode pill. Verified is plain, not celebratory; it states a position. */
  function modeHtml(m) {
    const p = m || MODE_UNKNOWN;
    const tone = p.mode === 'verified' ? 'plain' : 'quiet';
    const why = p.downgraded
      ? (p.unmet || []).map((u) => u.because || u.requirement).join('; ')
      : (p.statement || '');
    return `<span class="assur-badge is-${tone}" title="${esc(why)}">`
      + `<span class="assur-dot" aria-hidden="true"></span>${esc(p.label || 'Self-declared')}</span>`;
  }

  /** Render into every `[data-assurance-mode]` placeholder under `root`. */
  async function renderMode(root) {
    const els = (root || document).querySelectorAll('[data-assurance-mode]');
    if (!els.length) return 0;
    const m = await loadMode();
    els.forEach((el) => { el.innerHTML = modeHtml(m); });
    return els.length;
  }

  return { load, render, badgeHtml, forScope, UNKNOWN, loadMode, renderMode, modeHtml };
})();
