// @ts-check
/**
 * The consolidated Part A routes — the bank's whole financed-emissions
 * position for a reporting year, the one document filed from it, and the
 * exposure register as a data annex a verifier can open in a spreadsheet.
 *
 * All three are reads: every figure is one a class's own roll-up returned,
 * and nothing here stores, recomputes or issues an id. A year holding no
 * exposures in any class is a 409 on the document, because an empty
 * disclosure would read as "we financed nothing carbon-intensive", which is a
 * different claim from "we have not measured yet"; the position itself answers
 * for an empty year, since "which classes are recorded" is a question with an
 * answer even when the answer is none.
 */

'use strict';

const { Router } = require('express');
const authenticate = require('../../../../platform/auth/authenticate');
const { doc, body, obj, arr, str } = require('../../../../platform/http/openapi-hints');
const validate = require('../../../../platform/http/validate');
const { defaultLimiter } = require('../../../../platform/http/rate-limit');
const handle = require('../../../../platform/http/async-handler');
const { sendPdf, sendDocx } = require('../../../../platform/reporting/pdf-response');
const { disclosureQuerySchema } = require('../schemas/register');

const consolidated = require('../../application/parta-consolidated');
const R = require('../../reporting/consolidated/report');

const router = Router();

router.get('/financed-emissions/:year', authenticate, defaultLimiter,
  doc({ summary: 'The whole Part A position for a reporting year — every asset class side by side',
    description: 'Each class’s own reporting-year roll-up laid beside the others: recorded classes with '
      + 'their headline on the boundary their section reports, scope 3 apart, one data-quality score '
      + 'per class never averaged across them, coverage summed only across classes in the book’s '
      + 'currency, and every class not reported with its reason (Chapter 6, p.162). Also lists what '
      + 'the disclosure still needs from the reporting entity. A read; nothing stored.',
    response: body({ reportingYear: str, classes: arr(), totals: obj, coverage: obj, dataQuality: obj, outstandingItems: arr() },
      ['reportingYear', 'classes', 'totals', 'coverage']) }),
  handle(async (req, res) => {
    res.json(await consolidated.position(req.orgId, req.params.year));
  }));

router.get('/financed-emissions/:year/disclosure', authenticate, defaultLimiter,
  validate({ query: disclosureQuerySchema }),
  doc({ summary: 'The consolidated PCAF Part A financed-emissions disclosure — JSON, PDF or Word',
    produces: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    description: 'The document a bank files: one entity, one book, every asset class reported or named '
      + 'with its reason, an exposure register across classes as the audit trail, the regulatory '
      + 'mapping, and a checklist answered from the facts. A year with no exposures in any class is a '
      + '409. The entity-inventory item is No by design: financed emissions are Category 15 of the '
      + 'entity’s inventory, not the inventory.',
    response: body({ report: obj }, ['report']) }),
  handle(async (req, res) => {
    const built = await consolidated.annualDisclosure(req.orgId, req.params.year, {
      insurer: req.query.insurer, currency: req.query.currency, country: req.query.country,
    });
    const format = req.query.format || 'json';
    if (format === 'docx') return sendDocx(res, await R.disclosureDOCX(built.input), `${built.safeName}.docx`, 'disclosure');
    if (format === 'pdf') return sendPdf(res, R.disclosurePDF(built.input), `${built.safeName}.pdf`, 'disclosure');
    return res.json({ report: { cover: built.model.cover, checklist: built.model.checklist, facts: built.facts } });
  }));

router.get('/financed-emissions/:year/register.csv', authenticate, defaultLimiter,
  doc({ summary: 'The exposure register across classes, as CSV — the data annex',
    produces: ['text/csv'],
    description: 'One row per exposure of every recorded class, the columns the audit-trail annex prints, '
      + 'so a verifier can sample in a spreadsheet. The same stored projections the totals were rolled '
      + 'up from; nothing recomputed.',
    response: body({ csv: str }, []) }),
  handle(async (req, res) => {
    const rows = await consolidated.registerRows(req.orgId, req.params.year);
    res.type('text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="part-a-register-${String(req.params.year).replace(/[^0-9]/g, '')}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(consolidated.csv(rows));
  }));

module.exports = router;
