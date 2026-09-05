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

  return { load, render, badgeHtml, forScope, UNKNOWN };
})();
