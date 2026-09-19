/**
 * Helpers for a form sectioned by ui/js/form-steps.js.
 *
 * A journey that fills a field has to be on the section holding it, exactly
 * as a person does. `reveal` is the product's own call — it is what the form
 * uses to open the section of a control the browser has refused — so a
 * journey using it is driving the same path, not a test-only back door.
 */

'use strict';

/** Open the section holding this control, if the form is sectioned at all. */
async function openSectionOf(page, id) {
  await page.evaluate((fieldId) => {
    const el = document.getElementById(fieldId);
    if (el && window.FormSteps) window.FormSteps.reveal(el);
  }, id);
}

/** Open the section, then fill — the pair every journey wants. */
async function fillIn(page, id, value) {
  await openSectionOf(page, id);
  await page.fill(`#${id}`, value);
}

module.exports = { openSectionOf, fillIn };
