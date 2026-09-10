/**
 * The job handlers — a composition root.
 *
 * The platform's queue (`src/platform/jobs/`) knows nothing about the
 * engines; this file, like `src/server.js`, may import the domains and
 * register what each job type does. Every handler calls the same function
 * the synchronous route calls, so a document produced by a job is the
 * document the route would have produced — one engine, one report,
 * whichever door it came through.
 *
 * A handler resolves to `{ result }` for a JSON answer or `{ artifact:
 * { buffer, contentType, filename } }` for a document; either is read back
 * by job id.
 */

'use strict';

const registry = require('./platform/jobs/registry');
const { toBuffer, PDF, DOCX } = require('./platform/reporting/pdf-response');

const invalid = (error) => {
  const e = new Error(error.details.map(d => d.message).join('; '));
  e.statusCode = 400; e.code = 'VALIDATION_ERROR'; e.details = error.details;
  return e;
};

const validated = (schema, payload) => {
  const { error, value } = schema.validate(payload, { abortEarly: false, stripUnknown: true, convert: true });
  if (error) throw invalid(error);
  return value;
};

/* PCAF Part C — the assessment report for one policy, as POST /v1/pcaf/part-c/report. */
registry.register('partc.report', async (payload, ctx) => {
  const route = require('./domains/pcaf-part-c/interface/routes/pcaf-partc');
  const { buildPartCPDF, buildPartCDOCX } = require('./domains/pcaf-part-c/reporting/partc-reports');
  const body = validated(route.reportRequestSchema, payload);
  const { report, safeName } = await route.reportFor(ctx.orgId, body);
  if (body.format === 'json') return { result: { report } };
  if (body.format === 'docx') return { artifact: { buffer: await buildPartCDOCX(report), contentType: DOCX, filename: `${safeName}-pcaf-part-c.docx` } };
  return { artifact: { buffer: await toBuffer(buildPartCPDF(report)), contentType: PDF, filename: `${safeName}-pcaf-part-c.pdf` } };
}, { description: 'PCAF Part C assessment report for one policy. Payload: the body of POST /v1/pcaf/part-c/report (format json | pdf | docx).' });

/* PCAF Part C — the annual disclosure for a reporting year, as GET /v1/partc/disclosure/:year. */
registry.register('partc.disclosure', async (payload, ctx) => {
  const disclosure = require('./domains/pcaf-part-c/application/partc-disclosure');
  const Joi = require('joi');
  const body = validated(Joi.object({
    year: Joi.alternatives().try(Joi.number().integer().min(2000).max(2100), Joi.string().pattern(/^\d{4}$/)).required(),
    format: Joi.string().valid('json', 'pdf', 'docx').default('pdf'),
    auditTrail: Joi.boolean().default(true),
  }), payload);
  const d = await disclosure.buildAnnualDisclosure(ctx.orgId, String(body.year), { includeAuditTrail: body.auditTrail });
  const stem = `${String(d.meta.insurer || 'insurer').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-iae-fy${d.meta.reportingYear}`;
  if (body.format === 'json') return { result: { disclosure: d } };
  if (body.format === 'docx') return { artifact: { buffer: await disclosure.buildDisclosureDOCX(d), contentType: DOCX, filename: `${stem}.docx` } };
  return { artifact: { buffer: await toBuffer(disclosure.buildDisclosurePDF(d)), contentType: PDF, filename: `${stem}.pdf` } };
}, { description: 'The annual PCAF Part C disclosure for a reporting year, from locked assessments only. Payload: { year, format: json | pdf | docx, auditTrail }.' });

/* Lending — a PCAF, GRI 305, TCFD, IFRS S2 or SLGFT report, as POST /v1/reports/generate. */
registry.register('lending.report', async (payload) => {
  const { reportGenerateSchema } = require('./domains/lending/interface/schemas/reports');
  const { generateReport, buildPDF } = require('./domains/lending/application/reports');
  const value = validated(reportGenerateSchema, payload);
  const { type, period, format, orgName, portfolioData, slgftData } = value;
  const report = generateReport({ type, period, orgName, portfolioData, slgftData });
  if (format === 'pdf') return { artifact: { buffer: await toBuffer(buildPDF(report)), contentType: PDF, filename: `CarbonIQ-${type.toUpperCase()}-${period}.pdf` } };
  return { result: { report } };
}, { description: 'A portfolio-level report (pcaf, gri305, tcfd, ifrs-s2, slgft). Payload: the body of POST /v1/reports/generate.' });

/* Lending — document extraction, as POST /v1/extract. Reads every page; the one that least belongs in a request. */
registry.register('extract.document', async (payload) => {
  const { extractRequestSchema } = require('./domains/lending/interface/schemas/extract');
  const { extractFromRequest } = require('./domains/lending/application/extract');
  const { content, format, pdfBase64, fileId, pageHint, projectName } = validated(extractRequestSchema, payload);
  const result = await extractFromRequest({ content, format, pdfBase64, fileId, pageHint });
  return { result: { projectName: projectName || null, materials: result.materials, summary: result.summary, model: result.model, tokensUsed: result.tokensUsed } };
}, { description: 'Extract bill-of-quantities materials from text, CSV, JSON or a PDF. Payload: the body of POST /v1/extract.' });

/* Lending — the portfolio roll-up over a set of projects, as GET /v1/portfolio. */
registry.register('portfolio.aggregate', async (payload) => {
  const { aggregateForProjects } = require('./domains/lending/interface/routes/portfolio');
  const Joi = require('joi');
  const { projectIds } = validated(Joi.object({ projectIds: Joi.array().items(Joi.string().min(1)).min(1).max(10000).required() }), payload);
  return { result: await aggregateForProjects(projectIds) };
}, { description: 'Portfolio carbon roll-up over a list of project ids — the 10,000-exposure run that does not fit in a request. Payload: { projectIds }.' });

module.exports = { types: registry.types };
