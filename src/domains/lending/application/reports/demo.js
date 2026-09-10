// @ts-check
/**
 * The sample portfolio a report without one is built on, stamped as such.
 */

'use strict';

// ---------------------------------------------------------------------------
// Demo Portfolio Data (used when no real portfolio is provided)
// ---------------------------------------------------------------------------

function _demoPortfolio(period) {
  const yr = parseInt(period, 10);
  return {
    totalProjects: 87,
    coverage_pct: 94.2,
    totalEmissions_tCO2e: 48230,
    weightedDQ: 2.4,
    totalPortfolioValue_M: 1560,
    taxonomyDist: { green: 36, transition: 38, brown: 13 },
    dqDistribution: { '1': 8, '2': 31, '3': 29, '4': 14, '5': 5 },
    assetClasses: [
      { class: 'Commercial',      projects: 34, outstandingLoan_M: 680, emissions_tCO2e: 22400, intensity_tCO2e_M: 32.9 },
      { class: 'Residential',     projects: 28, outstandingLoan_M: 420, emissions_tCO2e: 14200, intensity_tCO2e_M: 33.8 },
      { class: 'Industrial',      projects: 15, outstandingLoan_M: 310, emissions_tCO2e: 8100,  intensity_tCO2e_M: 26.1 },
      { class: 'Infrastructure',  projects: 10, outstandingLoan_M: 150, emissions_tCO2e: 3530,  intensity_tCO2e_M: 23.5 },
    ],
    yoy: {
      prev_tCO2e: 42100,
      current_tCO2e: 48230,
      change_pct: '+14.6%',
      explanation: `Increase driven by 21% growth in portfolio size from ${yr - 1}. Carbon intensity (tCO2e/$M) improved by 3.1%.`,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _humaniseKey(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
}

module.exports = { _demoPortfolio, _humaniseKey };
