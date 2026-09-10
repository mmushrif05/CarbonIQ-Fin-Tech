// @ts-check
/**
 * CarbonIQ FinTech — Report Generation Route
 *
 * POST /v1/reports/generate
 *   Generate a PCAF, GRI 305, TCFD, or IFRS S2 report.
 *   Returns JSON by default; pass format=pdf for a downloadable PDF.
 */

'use strict';

const { Router } = require('express');
const authenticate = require('../../../../platform/auth/authenticate');
const { doc, body, bool, obj, arr } = require('../../../../platform/http/openapi-hints');
const referenceCache = require('../../../../platform/http/reference-cache');
const { reportGenerateSchema } = require('../schemas/reports');
const { generateReport, buildPDF } = require('../../application/reports');
const { sendPdf } = require('../../../../platform/reporting/pdf-response');
const validate = require('../../../../platform/http/validate');

const router = Router();

// ---------------------------------------------------------------------------
// POST /v1/reports/generate
// ---------------------------------------------------------------------------

router.post('/generate', authenticate, doc({ summary: 'Generate a PCAF, GRI 305, TCFD, IFRS S2 or SLGFT report — JSON or PDF', body: reportGenerateSchema, produces: ['application/pdf'],
  description: 'A report built without a portfolio is stamped SAMPLE DATA on its face, and '
    + 'every report carries a `gaps` list of what it could not state. Entity-level narrative '
    + 'comes from recorded disclosures or is reported absent with the clause that requires it.',
  response: body({ success: bool, report: obj }, ['report']) }),
  validate({ body: reportGenerateSchema }), async (req, res, next) => {
    try {
      const { type, period, format, orgName, portfolioData, slgftData } = req.body;

    // Build the structured report object
    const report = generateReport({ type, period, orgName, portfolioData, slgftData });

    // Return PDF binary
    if (format === 'pdf') {
      const filename = `CarbonIQ-${type.toUpperCase()}-${period}.pdf`;
      return sendPdf(res, buildPDF(report), filename, `${type} report`);
    }

    // Return structured JSON
    res.json({
      success: true,
      report,
    });

  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /v1/reports/types  — list available report types (no auth required)
// ---------------------------------------------------------------------------

router.get('/types', referenceCache(), doc({ summary: 'The report types this API generates',
    response: body({ types: arr() }, ['types']) }), (_req, res) => {
  res.json({
    types: [
      {
        id: 'pcaf',
        name: 'PCAF Annual Disclosure',
        standard: 'CarbonIQ attributed embodied carbon (A1-A3)',
        description: 'Portfolio-level financed emissions report with attribution factors, data quality scores, and year-on-year analysis. Required for HKMA GS-1, MAS ENRM, and ISSB S2 compliance.',
        formats: ['json', 'pdf'],
        requiredInputs: ['orgName', 'period'],
      },
      {
        id: 'gri305',
        name: 'GRI 305 Emissions',
        standard: 'GRI 305: Emissions 2016',
        description: 'Scope 1, 2 and 3 GHG emissions disclosure per GRI Standards. Covers emission intensity, reduction initiatives, and methodology documentation.',
        formats: ['json', 'pdf'],
        requiredInputs: ['orgName', 'period'],
      },
      {
        id: 'tcfd',
        name: 'TCFD Climate Risk',
        standard: 'TCFD Recommendations (2017 / 2021)',
        description: 'Four-pillar climate risk report: Governance, Strategy, Risk Management, Metrics & Targets. Includes scenario analysis and physical/transition risk assessment.',
        formats: ['json', 'pdf'],
        requiredInputs: ['orgName', 'period'],
      },
      {
        id: 'ifrs-s2',
        name: 'IFRS S2 Climate Disclosures',
        standard: 'IFRS S2 / ISSB (June 2023)',
        description: 'Climate-related financial disclosures per IFRS S2: risks & opportunities, financial effects, resilience scenarios, and transition plan milestones.',
        formats: ['json', 'pdf'],
        requiredInputs: ['orgName', 'period'],
      },
      {
        id: 'slgft-cbsl',
        name: 'SLGFT CBSL Disclosure',
        standard: 'CBSL Direction No. 05/2022 · SLFRS S2',
        description: 'Sri Lanka Green Finance Taxonomy disclosure for CBSL regulatory compliance. Covers SLFRS S2 climate reporting, CBSL Direction No. 05 green lending classification, and ESG metrics for licensed Sri Lankan banks.',
        formats: ['json', 'pdf'],
        requiredInputs: ['orgName', 'period'],
        region: 'LK',
      },
      {
        id: 'slgft',
        name: 'SLGFT CBSL Compliance Report',
        standard: 'Sri Lanka Green Finance Taxonomy v2024 · CBSL Direction No. 05 of 2022',
        description: 'CBSL-aligned Sri Lanka Green Finance Taxonomy disclosure: taxonomy distribution (Green/Transition/Not Aligned), NDC contribution, SDG alignment, DNSH compliance, and carbon pricing exposure under SLCCE.',
        formats: ['json', 'pdf'],
        requiredInputs: ['orgName', 'period'],
        optionalInputs: ['slgftData'],
        region: 'LK',
      },
    ],
  });
});

module.exports = router;
