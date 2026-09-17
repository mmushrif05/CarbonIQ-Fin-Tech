/**
 * The climate facts panel, swept.
 *
 * The panel draws every control from the registry the server serves, so the
 * rules worth pinning are the ones that keep it that way: no list of S2 fields
 * in the browser, no arithmetic, the registry fetched before anything renders,
 * and illustrative content labelled wherever it appears.
 *
 * Plus the four mechanical faults this codebase has shipped once each —
 * `[hidden]` beaten by a display rule, a grid item that will not shrink, a
 * control read before the request that fills it, and an id a module reads that
 * its fragment does not carry.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { source, must, mustNot } = require('./helpers/ui-source');
const climate = require('../src/domains/pcaf-part-a/domain/climate');

const ROOT = path.join(__dirname, '..');
const JS = source('ui/js/parta-climate.js');
const HTML = source('ui/pages/parta-position.html');
const INDEX = source('ui/index.html');
const CSS = source('ui/css/bank.css');
const POSITION = source('ui/js/parta-position.js');

describe('the panel is reachable and wired', () => {
  test('the module ships, the shell loads it, and the page carries its card', () => {
    expect(fs.existsSync(path.join(ROOT, 'ui/js/parta-climate.js'))).toBe(true);
    must(INDEX, '<script src="js/parta-climate.js"></script>', 'the shell loads the module');
    must(HTML, 'id="fe-climate"', 'the page carries the card');
    must(POSITION, /PartAClimatePanel\.load\(p\.entity\)/, 'the position hands it the settings it already fetched');
  });

  test('every id the module reads is in the fragment', () => {
    const ids = new Set([...JS.matchAll(/\$\('([a-z0-9-]+)'\)|\bon\('([a-z0-9-]+)'|\bshow\('([a-z0-9-]+)'|\bsay\('([a-z0-9-]+)'|setHtml\('([a-z0-9-]+)'/g)]
      .map(m => m[1] || m[2] || m[3] || m[4] || m[5]).filter(Boolean));
    expect(ids.size).toBeGreaterThan(4);
    for (const id of ids) {
      expect({ id, present: HTML.includes(`id="${id}"`) }).toEqual({ id, present: true });
    }
  });
});

describe('the registry is the only source of what S2 asks', () => {
  test('no S2 paragraph, field label or vocabulary id is written in the browser', () => {
    mustNot(JS, /§\s*\d/, 'no standard paragraph in the module', 'the registry carries the paragraph');
    for (const id of climate.idsOf(climate.RISK_KINDS)) {
      mustNot(JS, new RegExp(`['"]${id}['"]`), `no vocabulary id "${id}" in the module`,
        'the list comes from /climate/reference');
    }
    for (const item of climate.ITEMS.slice(0, 8)) {
      mustNot(JS, new RegExp(item.label.slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        `no item label "${item.label}" in the module`, 'the registry carries the label');
    }
  });

  test('the module computes nothing', () => {
    mustNot(JS, /\.reduce\(/, 'no reduce', 'the server counts what is stated');
    mustNot(JS, /\btoFixed\(/, 'no rounding of a figure', 'print what the route returned');
    mustNot(JS, /[\w)] \/ [\w(]/, 'no division', 'the share is the route\'s');
  });

  test('the registry is fetched before anything is drawn', () => {
    must(JS, /if \(!registry\) \{[\s\S]{0,200}?await call\('\/climate\/reference'\)/,
      'the registry is fetched first');
    must(JS, /registry = await call\('\/climate\/reference'\);[\s\S]{0,400}?render\(\);/,
      'nothing renders before it has arrived');
  });
});

describe('illustrative content is never mistaken for the bank\'s own', () => {
  test('the panel names all three states and labels the trial content', () => {
    must(JS, /STATE_WORD = \{ stated:/, 'the three states are one map');
    must(JS, /Illustrative/, 'illustrative content is labelled');
    must(JS, /Stated by the bank/, 'the bank\'s own words are labelled');
    must(JS, /Not stated/, 'an absent fact says so');
    must(JS, /rather than as a statement by the bank/, 'the trial line says what an unedited item prints as');
  });

  test('the load control exists and is offered only over an empty record', () => {
    must(HTML, 'id="fe-cl-illustrative"', 'the control is in the fragment');
    must(HTML, /id="fe-cl-illustrative" hidden/, 'hidden by attribute until the server says the record is empty');
    must(JS, /show\('fe-cl-illustrative', Boolean\(settings && settings\.climateReadiness/,
      'the server\'s own counts decide whether it is offered');
  });

  test('no endorsement language reaches the panel or the card', () => {
    for (const src of [JS, HTML]) {
      mustNot(src, /certified by PCAF|PCAF (approved|endorsed|certified)/i,
        'no endorsement language', 'always PCAF-conformant');
    }
  });
});

describe('the four mechanical rules', () => {
  test('hidden beats any display this sheet sets, and every grid item may shrink', () => {
    must(CSS, /\.partc-card \[hidden\], \.cl-tabs \[hidden\] \{ display: none !important; \}/,
      'hidden beats display');
    must(CSS, /\.cl-figure \{[^}]*min-width: 0/, 'the figure grid may shrink');
    must(CSS, /\.cl-row \{[^}]*min-width: 0/, 'a repeating row may shrink');
    must(CSS, /\.cl-control input, \.cl-control textarea, \.cl-control select \{[^}]*min-width: 0/,
      'a select sizes to its container rather than its widest option');
  });

  test('a repeating block keeps what was typed when another row is asked for', () => {
    must(JS, /const held = collectRows\(item\);[\s\S]{0,200}?renderPillar\(\);/,
      'the rows are collected before they are redrawn');
  });
});
