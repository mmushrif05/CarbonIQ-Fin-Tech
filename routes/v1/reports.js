/**
 * CarbonIQ FinTech — Report Generation Route
 *
 * POST /v1/reports/generate
 *   Generate a PCAF, GRI 305, TCFD, or IFRS S2 report.
 *   Returns JSON by default; pass format=pdf for a downloadable PDF.
 */

const { Router } = require('express');
const apiKeyAuth = require('../../middleware/api-key');
const { reportGenerateSchema } = require('../../schemas/reports');
const { generateReport, buildPDF } = require('../../services/reports');

const router = Router();

// ---------------------------------------------------------------------------
// POST /v1/reports/generate
// ---------------------------------------------------------------------------

router.post('/generate', apiKeyAuth, async (req, res, next) => {
  try {
    // Validate request body
    const { error, value } = reportGenerateSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: error.details.map(d => d.message).join('; '),
      });
    }

    const { type, period, format, orgName, portfolioData, slgftData } = value;

    // Build the structured report object
    const report = generateReport({ type, period, orgName, portfolioData, slgftData });

    // Return PDF binary
    if (format === 'pdf') {
      const filename = `CarbonIQ-${type.toUpperCase()}-${period}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      const pdfStream = buildPDF(report);
      pdfStream.pipe(res);
      return; // pdfStream.end() called inside buildPDF
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

router.get('/types', (_req, res) => {
  res.json({
    types: [
      {
        id: 'pcaf',
        name: 'PCAF Annual Disclosure',
        standard: 'PCAF v3 (December 2025)',
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
