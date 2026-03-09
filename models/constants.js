/**
 * CarbonIQ FinTech — Domain Constants
 *
 * Reference data for construction carbon calculations:
 *   - Material carbon factors (kgCO2e per unit)
 *   - Regional benchmark thresholds
 *   - Taxonomy thresholds per region
 *   - PCAF data quality definitions
 *   - Score band definitions
 */

// ---------------------------------------------------------------------------
// Default embodied carbon factors (kgCO2e per kg)
// Used when a material's EPD / custom factor is not provided.
// Sources: ICE Database v3, EC3, EPiC Database
// ---------------------------------------------------------------------------
const MATERIAL_CARBON_FACTORS = Object.freeze({
  concrete:   { factor: 0.13,  unit: 'kgCO2e/kg', source: 'ICE v3 — generic concrete' },
  steel:      { factor: 1.55,  unit: 'kgCO2e/kg', source: 'ICE v3 — generic steel' },
  timber:     { factor: -1.0,  unit: 'kgCO2e/kg', source: 'ICE v3 — softwood (biogenic credit)' },
  aluminium:  { factor: 6.67,  unit: 'kgCO2e/kg', source: 'ICE v3 — primary aluminium' },
  glass:      { factor: 1.44,  unit: 'kgCO2e/kg', source: 'ICE v3 — float glass' },
  insulation: { factor: 1.86,  unit: 'kgCO2e/kg', source: 'ICE v3 — generic insulation' },
  masonry:    { factor: 0.24,  unit: 'kgCO2e/kg', source: 'ICE v3 — clay bricks' },
  plastics:   { factor: 3.31,  unit: 'kgCO2e/kg', source: 'ICE v3 — generic plastics' },
  other:      { factor: 0.50,  unit: 'kgCO2e/kg', source: 'Conservative estimate' },
});

// ---------------------------------------------------------------------------
// Regional embodied carbon benchmarks (kgCO2e/m2)
// ---------------------------------------------------------------------------
const REGIONAL_BENCHMARKS = Object.freeze({
  GLOBAL: { excellent: 300, good: 500, average: 800, poor: 1200 },
  ASEAN:  { excellent: 350, good: 550, average: 850, poor: 1300 },
  EU:     { excellent: 250, good: 450, average: 700, poor: 1100 },
  HK:     { excellent: 280, good: 480, average: 750, poor: 1150 },
  SG:     { excellent: 300, good: 500, average: 800, poor: 1200 },
});

// ---------------------------------------------------------------------------
// Taxonomy alignment thresholds (kgCO2e/m2)
// Values represent the maximum embodied carbon intensity for alignment.
// ---------------------------------------------------------------------------
const TAXONOMY_THRESHOLDS = Object.freeze({
  ASEAN: {
    version: 3,
    residential: 500, commercial: 600, industrial: 800,
    infrastructure: 700, 'mixed-use': 550, renovation: 300, demolition: null,
  },
  EU: {
    version: 2024,
    residential: 350, commercial: 450, industrial: 600,
    infrastructure: 550, 'mixed-use': 400, renovation: 250, demolition: null,
  },
  HK: {
    version: 2024,
    residential: 400, commercial: 500, industrial: 700,
    infrastructure: 600, 'mixed-use': 450, renovation: 280, demolition: null,
  },
  SG: {
    version: 2024,
    residential: 380, commercial: 480, industrial: 650,
    infrastructure: 580, 'mixed-use': 430, renovation: 270, demolition: null,
  },
});

// ---------------------------------------------------------------------------
// PCAF Data Quality Scores
// ---------------------------------------------------------------------------
const PCAF_DATA_QUALITY = Object.freeze({
  1: { label: 'Reported', description: 'Verified emissions data from the borrower' },
  2: { label: 'Physical activity', description: 'Emissions derived from physical activity data' },
  3: { label: 'Economic activity', description: 'Emissions derived from economic data' },
  4: { label: 'Estimated', description: 'Emissions estimated from proxy data' },
  5: { label: 'Default', description: 'Emissions from sector averages or default factors' },
});

// ---------------------------------------------------------------------------
// Carbon Finance Score Bands
// ---------------------------------------------------------------------------
const SCORE_BANDS = Object.freeze({
  DARK_GREEN:  { min: 80, max: 100, label: 'Dark Green',  description: 'Exceptional — well below benchmarks' },
  GREEN:       { min: 60, max: 79,  label: 'Green',       description: 'Good — below regional average' },
  AMBER:       { min: 40, max: 59,  label: 'Amber',       description: 'Moderate — near regional average' },
  RED:         { min: 20, max: 39,  label: 'Red',          description: 'High carbon — above benchmarks' },
  DARK_RED:    { min: 0,  max: 19,  label: 'Dark Red',    description: 'Very high carbon — significantly above benchmarks' },
});

// ---------------------------------------------------------------------------
// Supported project types
// ---------------------------------------------------------------------------
const PROJECT_TYPES = Object.freeze([
  'residential', 'commercial', 'industrial', 'infrastructure',
  'mixed-use', 'renovation', 'demolition',
]);

// ---------------------------------------------------------------------------
// Supported currencies (ISO 4217 subset common in green finance)
// ---------------------------------------------------------------------------
const SUPPORTED_CURRENCIES = Object.freeze([
  'USD', 'EUR', 'GBP', 'SGD', 'HKD', 'MYR', 'THB', 'IDR',
  'PHP', 'VND', 'AUD', 'JPY', 'CNY', 'KRW', 'INR',
]);

module.exports = {
  MATERIAL_CARBON_FACTORS,
  REGIONAL_BENCHMARKS,
  TAXONOMY_THRESHOLDS,
  PCAF_DATA_QUALITY,
  SCORE_BANDS,
  PROJECT_TYPES,
  SUPPORTED_CURRENCIES,
};
