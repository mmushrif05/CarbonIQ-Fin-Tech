/**
 * The climate block on the Lending Book, swept.
 *
 * The block is what SLFRS S2 §29(b)–(d) are summed from, so the rules that
 * matter are the ones that keep the screen from deciding anything: the three
 * closed lists come from the server, the form sends the block on every class,
 * an edit prefills it from the record rather than from the engine's input, and
 * the page still computes nothing.
 */

'use strict';

const { source, must, mustNot } = require('./helpers/ui-source');
const { idsOf, CLIMATE_VERDICTS, ALIGNMENT_VERDICTS } = require('../src/domains/pcaf-part-a/domain/climate/vocabulary');

const JS = source('ui/js/parta-register.js');
const HTML = source('ui/pages/parta-register.html');

describe('the block is on the form and answers from the server', () => {
  test('every control the module reads is in the fragment', () => {
    for (const id of ['pr-f-cl-transition', 'pr-f-cl-transition-horizon', 'pr-f-cl-physical',
      'pr-f-cl-physical-horizon', 'pr-f-cl-opportunity', 'pr-f-cl-code', 'pr-f-cl-note']) {
      must(HTML, `id="${id}"`, `the form carries #${id}`);
    }
    must(HTML, /SLFRS S2 §29\(b\)–\(d\)/, 'the block names the paragraph it answers');
  });

  test('the lists are fetched from the one registry, not written in the browser', () => {
    must(JS, /await call\('\/climate\/reference'\)/, 'the vocabularies come from the server');
    must(JS, /fillClimateLists\(climateVocabulary\)/, 'the selects are filled from what came back');
    for (const id of [...idsOf(CLIMATE_VERDICTS), ...idsOf(ALIGNMENT_VERDICTS)]) {
      mustNot(JS, new RegExp(`['"]${id}['"]`), `no verdict id "${id}" in the module`,
        'the list comes from /climate/reference');
      mustNot(HTML, new RegExp(`value="${id}"`), `no verdict id "${id}" in the fragment`,
        'the options are rendered from the server\'s list');
    }
  });

  test('the block is sent on every class, so the share answers for the whole book', () => {
    must(JS, /body\.climate = collectClimate\(\);/, 'every class sends it');
    must(JS, /function collectClimate\(\)/, 'one collector, not one per class');
  });

  test('an edit prefills from the record rather than from the engine input', () => {
    must(JS, /fillClimate\(current\.climate\)/, 'the classification is read off the record');
    must(JS, /function fillClimate\(held\)/, 'there is a prefill for it');
  });

  test('the detail prints the verdicts in words, and an unassessed loan says so', () => {
    must(JS, /function climatePanel\(c\)/, 'the detail has a panel');
    must(JS, /'Not assessed'/, 'an exposure with no judgement says so rather than showing a blank');
    must(JS, /the position sums what is assessed and states what is not/, 'the panel says how it is counted');
  });

  test('the screen still computes nothing about it', () => {
    mustNot(JS, /climate[\s\S]{0,80}?\.reduce\(/, 'no sum over the classification',
      'the position route returns every figure');
  });
});
