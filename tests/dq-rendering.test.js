/**
 * How a data-quality score is allowed to be written.
 *
 * The PCAF scale runs 1 = highest quality to 5 = lowest. It is a category,
 * not a mark out of five. Written "3 / 5" it reads as a fraction, and a
 * reader who has not opened the standard will take 3/5 for a middling-good
 * result when it is in fact the third of five bands and a 1 would be better.
 *
 * The direction is the whole point of the scale, so this suite treats the
 * inverted rendering as a defect in its own right and sweeps the source for
 * it — not only the paths a feature test happens to exercise.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIRS = ['services', 'routes', 'ui/js', 'ui/pages'];
const FILES = ['ui/index.html'];

/** Every source file that could render a score, with its text. */
function sources() {
  const out = [];
  const walk = dir => {
    let entries = [];
    try { entries = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }); }
    catch (_) { return; }
    for (const e of entries) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) { walk(rel); continue; }
      if (!/\.(js|html)$/.test(e.name)) continue;
      out.push({ file: rel, text: fs.readFileSync(path.join(ROOT, rel), 'utf8') });
    }
  };
  DIRS.forEach(walk);
  for (const f of FILES) {
    try { out.push({ file: f, text: fs.readFileSync(path.join(ROOT, f), 'utf8') }); }
    catch (_) { /* optional */ }
  }
  return out;
}

/* Lines that talk about the rule rather than rendering it. */
const EXPLANATORY = /reads as|inverts|never written|must not|mark out of five|1-5|1–5|1 = best|1 is the highest/i;

describe('No data-quality score is rendered as a fraction of five', () => {
  const files = sources();

  test('the sweep actually reads the source it claims to', () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.some(f => f.file.includes('pcaf-partc.js'))).toBe(true);
  });

  test('no line renders a score with "/ 5"', () => {
    const offenders = [];
    for (const { file, text } of files) {
      text.split('\n').forEach((line, i) => {
        if (EXPLANATORY.test(line)) return;
        // A score followed by a slash and a five, in markup or a template.
        if (/(score|quality|\bdq\b)[^\n]{0,80}?\d\s*\/\s*5\b/i.test(line)
          || /\bkpi-unit"?>\s*\/\s*5\s*</i.test(line)
          || /toFixed\(\d\)\}\s*\/\s*5/.test(line)) {
          offenders.push(`${file}:${i + 1}  ${line.trim().slice(0, 120)}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  test('nowhere calls the score a mark out of five in a unit label', () => {
    const offenders = [];
    for (const { file, text } of files) {
      text.split('\n').forEach((line, i) => {
        if (EXPLANATORY.test(line)) return;
        if (/out of 5\b/i.test(line)) offenders.push(`${file}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe('The scale direction is stated where a score is shown', () => {
  const { SCALE_NOTE } = require('../services/pcaf-partc/data-quality');

  test('the canonical wording names 1 as the highest quality', () => {
    expect(SCALE_NOTE).toMatch(/1 is the highest data quality/i);
    expect(SCALE_NOTE).toMatch(/5 the lowest/i);
  });

  test('the engine carries it on every scored result', () => {
    const { runPartC } = require('../services/pcaf-partc');
    const fx = require('./fixtures/fisheries');
    const r = runPartC(fx.idiInput());
    expect(r.dataQuality.scaleNote).toBe(SCALE_NOTE);
    expect(r.dqScoring.scale).toBe(SCALE_NOTE);
    expect(r.dqScoring.direction).toMatch(/lower score is better/i);
  });
});
