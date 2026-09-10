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
