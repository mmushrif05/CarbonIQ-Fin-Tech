// @ts-check
/* ============================================================
   CarbonIQ — what markup is allowed to call
   ui/js/register-actions.js
   ============================================================
   The allow-list behind `data-action`, in one file, loaded last so that
   every module it names has been defined.

   This list is the control. A dispatcher that resolved names against
   `window` would let any attribute call any global, which is what an inline
   handler already was — so closing `'unsafe-inline'` and then resolving
   dynamically would have moved the hole rather than shut it. A module that
   is not here cannot be reached from markup, and putting one here is a
   decision somebody makes in this file rather than a side effect of writing
   an attribute somewhere else.

   Only a module's public surface is reachable, and only one level deep:
   `Module.method`, never `Module.thing.method`.
   ============================================================ */

'use strict';

/*
 * Moving between pages, as an action.
 *
 * One control asked for this by calling the shell's own `navigateTo` from an
 * attribute. It is the shell's, not any page's, so it is named here rather
 * than borrowed from whichever module happened to be in scope.
 */
const Nav = {
  /** @param {string} pageId */
  go(pageId) {
    if (typeof window.CARBONIQ_navigateTo === 'function') window.CARBONIQ_navigateTo(pageId);
  },
};

Actions.register({
  /* The shell */
  Auth,
  LoginPage,
  Nav,
  Settings,

  /* The pages */
  AgentsPage,
  CarbonPricingPage,
  Dashboard,
  Monitoring,
  NdcSdgPage,
  NewProject,
  PCAFCalculator,
  PipelinePage,
  ReportsPage,
  Taxonomy,
});
