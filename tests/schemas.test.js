const {
  scoreRequestSchema,
  pcafRequestSchema,
  taxonomyRequestSchema,
  covenantRequestSchema,
  portfolioRequestSchema,
  webhookCreateSchema,
  webhookUpdateSchema,
} = require('../schemas');

// ---------------------------------------------------------------------------
// Helpers — valid base payloads for each schema
// ---------------------------------------------------------------------------
const validScorePayload = () => ({
  project: {
    name: 'Green Tower HQ',
    location: { country: 'SG' },
    type: 'commercial',
    grossFloorArea: 12000,
  },
  materials: [
    { name: 'Concrete C30', category: 'concrete', quantity: 5000, unit: 'kg' },
  ],
});

const validPcafPayload = () => ({
  loan: { id: 'LN-001', amount: 5000000 },
  property: {
    value: 10000000,
    type: 'commercial',
    grossFloorArea: 12000,
    location: { country: 'SG' },
  },
  emissions: { totalEmbodied: 480000, dataQuality: 3 },
});

const validTaxonomyPayload = () => ({
  project: {
    name: 'Green Tower HQ',
    type: 'commercial',
    grossFloorArea: 12000,
    location: { country: 'SG' },
  },
  carbonIntensity: { embodied: 350 },
  taxonomies: ['ASEAN', 'SG'],
});

const validCovenantPayload = () => ({
  loan: { id: 'LN-001' },
  project: {
    name: 'Green Tower HQ',
    type: 'commercial',
    grossFloorArea: 12000,
    location: { country: 'SG' },
  },
  currentMetrics: { embodiedCarbonIntensity: 400 },
  covenants: [
    { metric: 'embodied_carbon_intensity', operator: 'lte', value: 500 },
  ],
});

const validPortfolioPayload = () => ({
  portfolio: { name: 'APAC Green Book', reportingDate: '2026-03-01' },
  assets: [
    {
      loanId: 'LN-001',
      projectName: 'Green Tower HQ',
      projectType: 'commercial',
      location: { country: 'SG' },
      loanAmount: 5000000,
      propertyValue: 10000000,
      grossFloorArea: 12000,
      emissions: { embodied: 480000, dataQuality: 3 },
    },
  ],
});

const validWebhookPayload = () => ({
  url: 'https://bank.example.com/webhooks/carboniq',
  events: ['score.completed', 'covenant.breach'],
});

// ---------------------------------------------------------------------------
// Score Schema
// ---------------------------------------------------------------------------
describe('Score Request Schema', () => {
  it('accepts a valid payload', () => {
    const { error } = scoreRequestSchema.validate(validScorePayload());
    expect(error).toBeUndefined();
  });

  it('rejects missing project', () => {
    const { error } = scoreRequestSchema.validate({ materials: [{ name: 'C', category: 'concrete', quantity: 1, unit: 'kg' }] });
    expect(error).toBeDefined();
  });

  it('rejects empty materials array', () => {
    const payload = validScorePayload();
    payload.materials = [];
    const { error } = scoreRequestSchema.validate(payload);
    expect(error).toBeDefined();
  });

  it('rejects invalid material category', () => {
    const payload = validScorePayload();
    payload.materials[0].category = 'unobtanium';
    const { error } = scoreRequestSchema.validate(payload);
    expect(error).toBeDefined();
  });

  it('applies defaults for options', () => {
    const { value } = scoreRequestSchema.validate(validScorePayload());
    expect(value.options.includeBreakdown).toBe(true);
    expect(value.benchmarkRegion).toBe('GLOBAL');
    expect(value.currency).toBe('USD');
  });

  it('accepts recycledContent on materials', () => {
    const payload = validScorePayload();
    payload.materials[0].recycledContent = 30;
    const { error } = scoreRequestSchema.validate(payload);
    expect(error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// PCAF Schema
// ---------------------------------------------------------------------------
describe('PCAF Request Schema', () => {
  it('accepts a valid payload', () => {
    const { error } = pcafRequestSchema.validate(validPcafPayload());
    expect(error).toBeUndefined();
  });

  it('rejects missing emissions', () => {
    const payload = validPcafPayload();
    delete payload.emissions;
    const { error } = pcafRequestSchema.validate(payload);
    expect(error).toBeDefined();
  });

  it('rejects invalid data quality (out of range)', () => {
    const payload = validPcafPayload();
    payload.emissions.dataQuality = 6;
    const { error } = pcafRequestSchema.validate(payload);
    expect(error).toBeDefined();
  });

  it('defaults pcafVersion to 3.0', () => {
    const { value } = pcafRequestSchema.validate(validPcafPayload());
    expect(value.pcafVersion).toBe('3.0');
  });
});

// ---------------------------------------------------------------------------
// Taxonomy Schema
// ---------------------------------------------------------------------------
describe('Taxonomy Request Schema', () => {
  it('accepts a valid payload', () => {
    const { error } = taxonomyRequestSchema.validate(validTaxonomyPayload());
    expect(error).toBeUndefined();
  });

  it('rejects invalid taxonomy name', () => {
    const payload = validTaxonomyPayload();
    payload.taxonomies = ['INVALID'];
    const { error } = taxonomyRequestSchema.validate(payload);
    expect(error).toBeDefined();
  });

  it('rejects empty taxonomies array', () => {
    const payload = validTaxonomyPayload();
    payload.taxonomies = [];
    const { error } = taxonomyRequestSchema.validate(payload);
    expect(error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Covenant Schema
// ---------------------------------------------------------------------------
describe('Covenant Request Schema', () => {
  it('accepts a valid payload', () => {
    const { error } = covenantRequestSchema.validate(validCovenantPayload());
    expect(error).toBeUndefined();
  });

  it('rejects invalid operator', () => {
    const payload = validCovenantPayload();
    payload.covenants[0].operator = 'NOT_A_VALID_OP';
    const { error } = covenantRequestSchema.validate(payload);
    expect(error).toBeDefined();
  });

  it('rejects invalid metric', () => {
    const payload = validCovenantPayload();
    payload.covenants[0].metric = 'not_a_metric';
    const { error } = covenantRequestSchema.validate(payload);
    expect(error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Portfolio Schema
// ---------------------------------------------------------------------------
describe('Portfolio Request Schema', () => {
  it('accepts a valid payload', () => {
    const { error } = portfolioRequestSchema.validate(validPortfolioPayload());
    expect(error).toBeUndefined();
  });

  it('rejects missing portfolio.reportingDate', () => {
    const payload = validPortfolioPayload();
    delete payload.portfolio.reportingDate;
    const { error } = portfolioRequestSchema.validate(payload);
    expect(error).toBeDefined();
  });

  it('rejects empty assets array', () => {
    const payload = validPortfolioPayload();
    payload.assets = [];
    const { error } = portfolioRequestSchema.validate(payload);
    expect(error).toBeDefined();
  });

  it('defaults options.groupBy to none', () => {
    const { value } = portfolioRequestSchema.validate(validPortfolioPayload());
    expect(value.options.groupBy).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// Webhook Schemas
// ---------------------------------------------------------------------------
describe('Webhook Create Schema', () => {
  it('accepts a valid payload', () => {
    const { error } = webhookCreateSchema.validate(validWebhookPayload());
    expect(error).toBeUndefined();
  });

  it('rejects HTTP (non-HTTPS) URLs', () => {
    const { error } = webhookCreateSchema.validate({
      ...validWebhookPayload(),
      url: 'http://insecure.example.com/hook',
    });
    expect(error).toBeDefined();
  });

  it('rejects empty events array', () => {
    const { error } = webhookCreateSchema.validate({
      ...validWebhookPayload(),
      events: [],
    });
    expect(error).toBeDefined();
  });

  it('rejects invalid event names', () => {
    const { error } = webhookCreateSchema.validate({
      ...validWebhookPayload(),
      events: ['invalid.event'],
    });
    expect(error).toBeDefined();
  });
});

describe('Webhook Update Schema', () => {
  it('accepts partial update with just active flag', () => {
    const { error } = webhookUpdateSchema.validate({ active: false });
    expect(error).toBeUndefined();
  });

  it('rejects empty object', () => {
    const { error } = webhookUpdateSchema.validate({});
    expect(error).toBeDefined();
  });
});
