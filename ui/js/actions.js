// @ts-check
/* ============================================================
   CarbonIQ — actions declared in markup, dispatched from one place
   ui/js/actions.js
   ============================================================
   Every control used to carry `onclick="Something.method()"`. That is a
   script in an attribute, so `script-src` needed `'unsafe-inline'` — and
   `'unsafe-inline'` on script-src is the difference between a stored string
   that reaches a page being ugly and being an account takeover. It was the
   last hole in the perimeter, and it is closed by this file.

   A control now says what it does and nothing about how:

     <button data-action="ReportsPage.generate" data-arg="tcfd">
     <select data-action-change="Monitoring.loadProject">   <!-- gets .value -->
     <input  data-action-input="Taxonomy.updateIntensity">  <!-- gets .value -->

   Three delegated listeners on `document` resolve the name and call it.
   Delegated rather than bound per element because half these controls are
   drawn after the page loads, and a listener attached at wiring time would
   miss every row rendered later.

   ── The allow-list is the point ────────────────────────────────────────────

   The obvious dispatcher is `window[name]`, and it would put the hole
   straight back: markup that can name any global can call any global, which
   is what an inline handler already was. So a name is resolved against
   `ROOTS` — a map this file is handed once, listing exactly the modules a
   control may reach. A name that is not in it does nothing and says so in
   the console. The list is in one place, and adding to it is a decision
   somebody makes rather than a side effect of writing an attribute.

   The page modules are top-level `const` in classic scripts, which makes
   them global *lexical* bindings rather than properties of `window` — so
   they could not be looked up dynamically even if that were wanted. The
   registration is in `index.html`, after every module has loaded.
   ============================================================ */

const Actions = (() => {
  'use strict';

  /** @type {Record<string, any>} */
  let ROOTS = {};

  /**
   * Name the modules markup may call. Later calls add to the list rather
   * than replace it, so a page can register its own without knowing what
   * else is registered.
   * @param {Record<string, any>} modules
   */
  function register(modules) {
    ROOTS = { ...ROOTS, ...(modules || {}) };
  }

  /**
   * Resolve `Module.method` against the allow-list.
   *
   * Exactly two segments: a registered module and one of its methods. Deeper
   * paths are refused rather than walked, because `A.b.c` is the shape that
   * turns an allow-list of modules back into a reachable object graph.
   *
   * @param {string} name
   * @returns {{root: any, fn: Function}|null}
   */
  function _resolve(name) {
    const parts = String(name || '').split('.');
    if (parts.length !== 2) return null;
    const root = ROOTS[parts[0]];
    if (!root) return null;
    const fn = root[parts[1]];
    return typeof fn === 'function' ? { root, fn } : null;
  }

  /**
   * @param {HTMLElement} el
   * @param {string} name
   * @param {any[]} args
   */
  function _call(el, name, args) {
    const found = _resolve(name);
    if (!found) {
      /* Named, not silent. A control that does nothing is indistinguishable
         from a slow one, and the guard that hid three dead pages in this
         codebase was exactly a silent `typeof x !== 'undefined' &&`. */
      // eslint-disable-next-line no-console
      console.warn(`No action registered for "${name}" (${el.tagName.toLowerCase()})`);
      return;
    }
    found.fn.apply(found.root, args);
  }

  /*
   * A handler is called with two things: the value the event carried, and the
   * element it came from.
   *
   * `data-arg` covers the common case of one literal. A control that needs
   * more — a row index and a field name, say — reads them off its own
   * dataset, which keeps structured arguments out of markup entirely. It is
   * also what replaced the one handler that interpolated a whole JSON
   * document into an attribute.
   */
  const _argOf = el => (el.dataset.arg === undefined ? undefined : el.dataset.arg);

  function init() {
    document.addEventListener('click', event => {
      const target = /** @type {HTMLElement} */ (event.target);
      const el = target && target.closest ? target.closest('[data-action]') : null;
      if (!el) return;
      const node = /** @type {HTMLElement} */ (el);
      /* A backdrop closes only when the backdrop itself was clicked, never
         when the click came from the dialog sitting on top of it. */
      if (node.dataset.actionSelf !== undefined && event.target !== node) return;
      if (node.tagName === 'A') event.preventDefault();
      _call(node, node.dataset.action || '', [_argOf(node), node]);
    });

    for (const [type, attr] of [['input', 'actionInput'], ['change', 'actionChange']]) {
      document.addEventListener(type, event => {
        const node = /** @type {HTMLInputElement} */ (event.target);
        if (!node || !node.dataset || node.dataset[attr] === undefined) return;
        _call(node, node.dataset[attr] || '', [node.value, node]);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { register, init, _resolve };
})();

/* The shell reads it as a global; this line is for the type checker and for
   any module that would rather import than assume. */
if (typeof module !== 'undefined' && module.exports) module.exports = Actions;
