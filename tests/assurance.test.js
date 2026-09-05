/**
 * Whether anyone independent has checked these figures.
 *
 * A data-quality score says how good the evidence behind a number is. It says
 * nothing about whether a third party has audited it, and a reader weighs the
 * two together — a PCAF score of 1 on an unaudited figure and a 3 on an
 * assured one carry different weight in front of a regulator.
 *
 * Assurance cannot be computed from anything held here. It is a *declared*
 * fact in the sense services/report-integrity.js uses the word, and inventing
 * one is the failure that module exists to prevent — the same class as the
 * board meetings and the flood-zone percentage that were removed from the
 * portfolio reports.
 *
 * The distinction these tests exist to hold: "not declared" is not "not
 * assured". One is the absence of any statement; the other is a statement the
 * entity has made. A screen that renders the first as the second is putting
 * words in their mouth, and it is the easy mistake to make because both look
 * like "no" on a badge.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const assurance = require('../services/assurance');
const store = require('../services/partc-store');

const ROOT = path.join(__dirname, '..');

beforeEach(() => { if (store._resetMemory) store._resetMemory(); });

describe('Nothing is assumed on a deployment where nothing was recorded', () => {
  test('every scope reports absent, not "not assured"', async () => {
    const a = await assurance.read('org-none');
    expect(a.source).toBe('baseline');
    for (const scope of assurance.SCOPES) {
      expect(a.scopes[scope].status).toBe('not_declared');
      expect(a.scopes[scope].declared).toBe(false);
      expect(a.scopes[scope].label).toMatch(/not stated/i);
      // The two must never be worded the same.
      expect(a.scopes[scope].label).not.toMatch(/^Not independently assured/);
    }
  });

  test('the absent state says what it would take, like every other absent fact here', async () => {
    const a = await assurance.read('org-none');
    expect(a.scopes.financed.detail).toMatch(/only the reporting entity can make/i);
  });

  test('the shipped baseline declares nothing at all', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'assurance.json'), 'utf8'));
    for (const scope of Object.values(raw.scopes)) {
      expect(scope.status).toBe('not_declared');
      expect(scope.provider).toBeUndefined();
    }
  });
});

describe('A declaration is the entity speaking, and is carried as such', () => {
  test('an assured scope carries its provider, standard and level', async () => {
    const saved = await assurance.save('org-a', {
      scopes: {
        financed: {
          status: 'assured', provider: 'An Assurance Firm',
          standard: 'ISAE 3000 (Revised)', level: 'limited', period: 'FY2026',
        },
      },
    });
    const f = saved.scopes.financed;
    expect(f.status).toBe('assured');
    expect(f.declared).toBe(true);
    expect(f.tone).toBe('good');
    expect(f.detail).toContain('ISAE 3000 (Revised)');
    expect(f.detail).toContain('An Assurance Firm');
    expect(f.detail).toContain('limited assurance');
  });

  test('a scope not named in the declaration stays absent rather than inheriting', async () => {
    const saved = await assurance.save('org-b', {
      scopes: { financed: { status: 'assured', provider: 'X' } },
    });
    expect(saved.scopes.financed.status).toBe('assured');
    expect(saved.scopes.insurance.status).toBe('not_declared');
  });

  test('"not assured" is a statement, and reads differently from silence', async () => {
    const saved = await assurance.save('org-c', {
      scopes: { financed: { status: 'not_assured' } },
    });
    const f = saved.scopes.financed;
    expect(f.status).toBe('not_assured');
    expect(f.declared).toBe(true);
    expect(f.label).toMatch(/Not independently assured/);
    expect(f.label).not.toBe(assurance.present({}).label);
  });

  test('an unrecognised status falls back to absent rather than to a claim', async () => {
    const saved = await assurance.save('org-d', {
      scopes: { financed: { status: 'definitely_audited_trust_me' } },
    });
    expect(saved.scopes.financed.status).toBe('not_declared');
  });

  test('an invalid assurance level is refused rather than stored loosely', async () => {
    await expect(assurance.save('org-e', {
      scopes: { financed: { status: 'assured', level: 'absolute' } },
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  /* The same rule the capital book follows: a recorded declaration replaces
     the baseline entirely. A half-merged declaration is a claim nobody made. */
  test('a recorded declaration replaces the baseline rather than merging with it', async () => {
    await assurance.save('org-f', { scopes: { insurance: { status: 'not_assured' } } });
    const a = await assurance.read('org-f');
    expect(a.source).toBe('recorded');
    expect(a.scopes.insurance.status).toBe('not_assured');
    expect(a.scopes.financed.status).toBe('not_declared');
  });

  test('one organisation cannot see another’s declaration', async () => {
    await assurance.save('org-g', { scopes: { financed: { status: 'assured', provider: 'G' } } });
    const other = await assurance.read('org-h');
    expect(other.source).toBe('baseline');
    expect(other.scopes.financed.status).toBe('not_declared');
  });
});

describe('The badge is the same object on every screen', () => {
  test('three states and no fourth', () => {
    expect(assurance.STATES.sort()).toEqual(['assured', 'not_assured', 'not_declared']);
  });

  test('only an assured state earns colour', () => {
    expect(assurance.present({ status: 'assured' }).tone).toBe('good');
    expect(assurance.present({ status: 'not_assured' }).tone).toBe('plain');
    expect(assurance.present({}).tone).toBe('quiet');
  });

  test('the browser helper carries the same absent wording as the engine', () => {
    const js = fs.readFileSync(path.join(ROOT, 'ui', 'js', 'assurance.js'), 'utf8');
    expect(js).toContain('Assurance not stated');
    // The same sentence, with the source's own line breaks collapsed.
    expect(js.replace(/\s*\+\s*'/g, '').replace(/'\s*/g, '').replace(/\s+/g, ' '))
      .toContain('only the reporting entity can make');
  });

  /* A fetch that failed is not a declaration of "no". */
  test('the browser helper falls back to absent, never to a claim', () => {
    const js = fs.readFileSync(path.join(ROOT, 'ui', 'js', 'assurance.js'), 'utf8');
    expect(js).toMatch(/catch[\s\S]{0,400}scopes: \{ financed: UNKNOWN, insurance: UNKNOWN \}/);
    // The helper never constructs an assured state; it only renders one it was given.
    expect(js).not.toMatch(/status:\s*'assured'/);
  });
});
