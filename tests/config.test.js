'use strict';

const config = require('../src/platform/config');

describe('Config', () => {
  it('loads default values in test environment', () => {
    expect(config.env).toBe('test');
    expect(config.port).toBe(3099);
    expect(config.version).toBeDefined();
  });

  it('has frozen config object', () => {
    /* In strict mode a write to a frozen object throws rather than being
       silently ignored, and the suite is strict now — which is the stronger
       assertion, because "the value did not change" is also true of a write
       that never happened. */
    expect(() => { config.env = 'production'; }).toThrow(TypeError);
    expect(config.env).toBe('test');
  });

  it('loads feature flags', () => {
    expect(typeof config.features.covenantEngine).toBe('boolean');
    expect(typeof config.features.portfolioAggregation).toBe('boolean');
    expect(typeof config.features.taxonomyChecker).toBe('boolean');
  });

  it('loads PCAF defaults', () => {
    expect(config.pcaf.version).toBe('3.0');
    expect(config.pcaf.defaultAttribution).toBe(1.0);
  });
});

describe("The function environment has a ceiling, and it is reported before a deploy hits it", () => {
  /*
   * Netlify Functions are AWS Lambdas, and Lambda refuses to create a function
   * whose whole environment exceeds 4 KB — every key, every value, the
   * platform's own injected variables included. There is no warning and no
   * partial application.
   *
   * This deployment hit it. One base64 service account was using roughly
   * two-thirds of the budget, and the deploy that added a 32-character token
   * was the one that failed — with a message naming a number and no variable.
   * Nothing in the codebase mentioned the limit, so four merges went undeployed
   * while the cause was hunted.
   */
  const config = require('../src/platform/config');

  test('the size is measured across keys, values and a separator each', () => {
    const size = config.environmentSize({ AB: 'cd' });
    expect(size.bytes).toBe(5);
    expect(size.count).toBe(1);
    expect(size.limit).toBe(4096);
  });

  test('multi-byte values are counted in bytes, not characters', () => {
    /* A UTF-8 value costs Lambda its bytes. Counting characters would report a
       budget that is not the one being spent. */
    expect(config.environmentSize({ A: '\u00e9\u00e9' }).bytes).toBe(1 + 4 + 1);
  });

  test('the largest are named, biggest first, so the answer is the first line', () => {
    const size = config.environmentSize({ SMALL: 'a', BIG: 'x'.repeat(3000), MID: 'y'.repeat(200) });
    expect(size.largest.map(l => l.variable)).toEqual(['BIG', 'MID', 'SMALL']);
    expect(size.largest[0].bytes).toBe(3004);
  });

  test('a crowded environment is a named problem on a serverless runtime', () => {
    const restore = { NETLIFY: process.env.NETLIFY, HUGE: process.env.HUGE };
    process.env.NETLIFY = 'true';
    process.env.HUGE = 'x'.repeat(4000);
    try {
      const { ok, problems } = config.validate({ env: 'production' });
      expect(ok).toBe(false);
      const found = problems.find(p => p.variable === 'HUGE');
      expect(found).toBeTruthy();
      expect(found.problem).toMatch(/4096-byte ceiling/);
      expect(found.problem).toMatch(/a deploy will fail at function creation/);
      expect(found.remedy).toMatch(/Scope the largest to Builds only/);
    } finally {
      for (const [k, v] of Object.entries(restore)) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
    }
  });

  test('and it is silent where the limit does not apply', () => {
    /* A server this product runs on a machine has no such ceiling; warning
       there is noise, and a warning that fires on nothing is one people learn
       to skip. */
    const restore = process.env.NETLIFY;
    delete process.env.NETLIFY;
    process.env.HUGE_LOCAL = 'x'.repeat(8000);
    try {
      const { problems } = config.validate({ env: 'production' });
      expect(problems.filter(p => /ceiling/.test(p.problem))).toEqual([]);
    } finally {
      delete process.env.HUGE_LOCAL;
      if (restore === undefined) delete process.env.NETLIFY; else process.env.NETLIFY = restore;
    }
  });

  test('no value can reach the report — names and byte counts only', () => {
    const restore = process.env.NETLIFY;
    process.env.NETLIFY = 'true';
    process.env.A_CREDENTIAL = `secret-${'z'.repeat(4000)}`;
    try {
      const { problems } = config.validate({ env: 'production' });
      const printed = JSON.stringify(problems);
      expect(printed).toContain('A_CREDENTIAL');
      /* The name, never the value. /health prints this block. */
      expect(printed).not.toContain('zzzz');
      expect(printed).not.toContain('secret-');
    } finally {
      delete process.env.A_CREDENTIAL;
      if (restore === undefined) delete process.env.NETLIFY; else process.env.NETLIFY = restore;
    }
  });
});
