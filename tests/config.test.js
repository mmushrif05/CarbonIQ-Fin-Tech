const config = require('../config');

describe('Config', () => {
  it('loads default values in test environment', () => {
    expect(config.env).toBe('test');
    expect(config.port).toBe(3099);
    expect(config.version).toBeDefined();
  });

  it('has frozen config object', () => {
    config.env = 'production';
    // Object.freeze silently ignores writes in non-strict mode
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
