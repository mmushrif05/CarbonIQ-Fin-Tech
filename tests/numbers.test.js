// @ts-check
/**
 * One guard, and it cannot be walked around.
 *
 * `Number(x) || 0` is the expression this codebase has shipped three separate
 * defects on: `Number(null)` is `0` and `0` is finite, so a field nobody filled
 * in arrives as a measured zero. Every one of the three reached a screen with
 * its own unit test passing, because a unit test calls the function with a
 * value and the defect is about the absence of one.
 *
 * So this file does two things a feature test cannot. It proves the shared
 * helpers answer absence before they answer the number, for every shape
 * absence arrives in. And it sweeps the source tree for the raw expression,
 * so a fourth instance cannot be written — including in a file no feature
 * test happens to walk.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { maybeNumber, numberOr, numberOrNull, intOr, isNumeric, sumNumeric } =
  require('../src/shared/numbers');

const SRC = path.join(__dirname, '..', 'src');

/** Every `.js` file under `src/`. */
function sourceFiles(dir = SRC, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, found);
    else if (entry.name.endsWith('.js')) found.push(full);
  }
  return found;
}

/* Every shape absence arrives in. A boolean is here deliberately: `Number(true)`
   is 1, so a tick-box coerces to a quantity, which is how a flag becomes a
   measurement. */
const ABSENT = [null, undefined, '', '   ', NaN, Infinity, -Infinity,
  true, false, 'abc', '12abc', {}, [], () => 1];

describe('Absence is answered before the number is', () => {
  test('maybeNumber is undefined for every shape of absence', () => {
    for (const v of ABSENT) expect(maybeNumber(v)).toBeUndefined();
  });

  test('a genuine zero survives, and is never mistaken for absence', () => {
    expect(maybeNumber(0)).toBe(0);
    expect(maybeNumber('0')).toBe(0);
    expect(maybeNumber(-0)).toBe(-0);   // the value is carried through, not normalised
    expect(numberOr(0, 40)).toBe(0);
    expect(numberOrNull(0)).toBe(0);
    expect(isNumeric(0)).toBe(true);
  });

  test('numbers and numeric strings are read the same way', () => {
    for (const [given, expected] of [[12, 12], ['12', 12], [' 12 ', 12],
      [1.5, 1.5], ['-3', -3], ['1e3', 1000]]) {
      expect(maybeNumber(given)).toBe(expected);
    }
  });

  test('numberOr states its own default at the call site', () => {
    for (const v of ABSENT) expect(numberOr(v, 40)).toBe(40);
    expect(numberOr(undefined)).toBe(0);
  });

  test('numberOrNull is the same test, answered the way JSON can carry it', () => {
    for (const v of ABSENT) expect(numberOrNull(v)).toBeNull();
    /* Why it exists at all: JSON.stringify drops an undefined field, and a
       field that disappeared reads as one nobody thought about. */
    expect(JSON.stringify({ a: maybeNumber(null) })).toBe('{}');
    expect(JSON.stringify({ a: numberOrNull(null) })).toBe('{"a":null}');
  });

  test('intOr truncates towards zero, as parseInt does', () => {
    expect(intOr(3.9)).toBe(3);
    expect(intOr(-3.9)).toBe(-3);
    expect(intOr('7.6', 1)).toBe(7);
    for (const v of ABSENT) expect(intOr(v, 5)).toBe(5);
  });

  test('sumNumeric skips absence and says how much it skipped', () => {
    expect(sumNumeric([1, 2, null, '3', undefined, ''])).toEqual(
      { total: 6, counted: 3, skipped: 3 });
    /* A total that quietly counted absence as zero is a total nobody can
       reconcile against the rows it came from. */
    expect(sumNumeric([0, 0])).toEqual({ total: 0, counted: 2, skipped: 0 });
    expect(sumNumeric([null, null])).toEqual({ total: 0, counted: 0, skipped: 2 });
    expect(sumNumeric([])).toEqual({ total: 0, counted: 0, skipped: 0 });
    // A caller handed nothing at all still gets a total it can print.
    expect(sumNumeric(/** @type {any} */ (null))).toEqual({ total: 0, counted: 0, skipped: 0 });
  });
});

describe('The raw coercion cannot be written again', () => {
  /* `Number(anything) || <literal>` — the whole defect class, not only `|| 0`:
     `Number(0) || 40` is 40, so a rate genuinely set to zero is overwritten by
     its own default just as an unfilled one is. */
  const RAW = /\bNumber\s*\([^;\n]*\)\s*\|\|\s*-?\d/;

  test('no file under src/ carries it', () => {
    const offenders = sourceFiles()
      .filter(f => path.relative(SRC, f) !== 'shared/numbers.js')
      .filter(f => RAW.test(
        fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')))
      .map(f => path.relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  test('the six private helpers it replaced are gone', () => {
    /* There were six, with three different policies on absence, two of them in
       the module that computes the disclosed premium-weighted data-quality
       score. A private helper is invisible to a sweep like the one above,
       which is why they are named here rather than only removed. */
    const gone = [
      ['domains/capital/infrastructure/capital-book.js', /const num = \(v, fallback/],
      ['domains/capital/infrastructure/capital-book.js', /const numOrNull = \(v\) =>\n/],
      ['domains/gcf/domain/emissions.js', /const _num = \(t\) => \{/],
      ['domains/gcf/domain/instruments.js', /const _num = \(v\) => \{/],
      ['domains/gcf/domain/screening.js', /const _num = \(v\) => \{/],
      ['domains/pcaf-part-c/application/partc-portfolio.js', /const _num = v =>/],
      ['domains/pcaf-part-c/domain/dq-scoring.js', /const _num = v =>/],
    ];
    for (const [file, pattern] of gone) {
      expect(fs.readFileSync(path.join(SRC, String(file)), 'utf8')).not.toMatch(pattern);
    }
  });

  test('every module that coerces resolves the helper from one place', () => {
    const users = sourceFiles().filter(f =>
      /\b(numberOr|numberOrNull|maybeNumber|intOr|isNumeric|sumNumeric)\(/
        .test(fs.readFileSync(f, 'utf8')));
    expect(users.length).toBeGreaterThan(20);
    for (const f of users) {
      if (path.relative(SRC, f) === 'shared/numbers.js') continue;
      expect(fs.readFileSync(f, 'utf8')).toMatch(/require\(['"][^'"]*shared\/numbers['"]\)/);
    }
  });
});
