/**
 * CarbonIQ FinTech — Financial Reporting Service
 *
 * Generates four regulatory-grade report formats:
 *   1. PCAF Annual Disclosure   (PCAF Part A, Third Edition, Dec 2025)
 *   2. GRI 305 Emissions        (GRI Standards 2016)
 *   3. TCFD Climate Risk        (TCFD Recommendations)
 *   4. IFRS S2 / ISSB           (IFRS S2 Climate Disclosures 2023)
 *
 * Usage:
 *   const { generateReport, buildPDF } = require('./reports');
 *   const report = generateReport({ type: 'pcaf', period: '2025', orgName: 'OCBC Bank', ... });
 *   const pdfStream = buildPDF(report);
 */

'use strict';

const { _pcafReport, _gri305Report, _tcfdReport, _ifrsS2Report } = require('./reports/standards');
const { _slgftReport, _slgftCbslReport } = require('./reports/slgft');
const { buildPDF } = require('./reports/pdf');
const { _demoPortfolio } = require('./reports/demo');
const { _withGaps } = require('./reports/common');

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a structured report object for the requested format.
 *
 * @param {Object} opts
 * @param {'pcaf'|'gri305'|'tcfd'|'ifrs-s2'|'slgft'} opts.type
 * @param {string} opts.period          - Reporting year, e.g. "2025"
 * @param {string} opts.orgName         - Bank / organisation name
 * @param {Object} [opts.portfolioData] - Pre-computed portfolio summary (optional; demo data used if omitted)
 * @param {Object} [opts.slgftData]     - SLGFT-specific data (NDC alignment, SDG, taxonomy dist)
 * @returns {Object} Structured report data
 */
function generateReport({ type, period, orgName, portfolioData, slgftData, entityDisclosures }) {
  /* A report built without a portfolio runs on sample figures. That is fine
     for a demonstration and unacceptable in a document that cites a standard,
     so the report says which it is on its own face rather than leaving the
     reader to assume the numbers are theirs. */
  const isDemo = !portfolioData;
  const portfolio = portfolioData || _demoPortfolio(period);
  const entity = entityDisclosures || null;
  const meta = {
    generatedAt: new Date().toISOString(),
    reportingPeriod: `FY ${period}`,
    organisation: orgName || 'Your Organisation',
    reportId: `RPT-${type.toUpperCase()}-${period}-${Date.now()}`,
    dataSource: isDemo ? 'SAMPLE DATA — NOT THIS ORGANISATION\'S PORTFOLIO' : 'Measured portfolio',
    ...(isDemo ? {
      sampleDataWarning: 'No portfolio was supplied, so every figure below is '
        + 'illustrative sample data. This document must not be filed, published or '
        + 'relied upon as a disclosure.'
    } : {}),
  };

  switch (type) {
    case 'pcaf':    return _withGaps(_pcafReport(meta, portfolio, entity));
    case 'gri305':  return _withGaps(_gri305Report(meta, portfolio, entity));
    case 'tcfd':    return _withGaps(_tcfdReport(meta, portfolio, entity));
    case 'ifrs-s2':    return _withGaps(_ifrsS2Report(meta, portfolio, entity));
    // Two Sri Lanka disclosures, kept as separate ids rather than merged.
    // 'slgft-cbsl' is the CBSL Direction 05 / SLFRS S2 disclosure already in
    // use; 'slgft' is the fuller taxonomy report that also carries NDC
    // contribution, SDG alignment, DNSH and carbon-pricing exposure. Folding
    // one id into the other would silently change what an existing caller
    // receives, so both remain addressable.
    case 'slgft-cbsl': return _withGaps(_slgftCbslReport(meta, portfolio, entity));
    case 'slgft':      return _withGaps(_slgftReport(meta, portfolio, slgftData || {}, entity));
    default:           throw new Error(`Unknown report type: ${type}`);
  }
}

module.exports = { generateReport, buildPDF };
