// @ts-check
/**
 * The entity's own facts, the disclosure built from them, and the period
 * package that carries a year out and back.
 *
 * A pipeline of financed projects is not the bank's inventory, so the
 * inventory lines are reported absent with the clause that requires them.
 */

'use strict';

const { Router } = require('express');
const authenticate = require('../../../../../platform/auth/authenticate');
const { doc, body, str, num, bool, obj, orNull, arr } = require('../../../../../platform/http/openapi-hints');
const { defaultLimiter } = require('../../../../../platform/http/rate-limit');
const validate = require('../../../../../platform/http/validate');
const { gcfEntitySchema, gcfImportSchema } = require('../../schemas/gcf');
const store = require('../../../infrastructure/store');
const reporting = require('../../../application/reporting');
const partcStore = require('../../../../../platform/database/store');
const handle = require('../../../../../platform/http/async-handler');

const router = Router();

router.get('/entity', authenticate, defaultLimiter,
  doc({ summary: 'The facts only the reporting entity can state',
    response: body({ entity: orNull(obj), recorded: bool, note: orNull(str) }, ['recorded']) }),
  handle(async (req, res) => {
  const entity = await store.entityDisclosures(req.orgId);
  res.json({
    entity: entity || null,
    recorded: Boolean(entity),
    note: entity ? null : 'No entity-level disclosures recorded. Every item that depends on them '
      + 'is reported absent in the disclosure, with the clause that requires it.',
  });
}));

router.put('/entity', authenticate, defaultLimiter,
  validate({ body: gcfEntitySchema }, { stripUnknown: false }),
  doc({ summary: "Record the entity's own disclosures",
    description: 'Nothing here is filled in on the entity\'s behalf. What is not recorded is '
      + 'reported absent in the disclosure with the clause that requires it.',
    response: body({ entity: obj, storage: obj }, ['entity']) }), handle(async (req, res) => {
  const saved = await store.setEntityDisclosures(req.orgId, req.body, {
    by: (req.actor && req.actor.label) || req.orgId,
  });
  res.json({ entity: saved, storage: partcStore.capability() });
}));

/**
 * The disclosure.
 *
 * Entity-level facts — board oversight, targets, the entity's own inventory —
 * cannot be computed from a pipeline. They are supplied by the entity or
 * reported absent with the clause that requires them, and the report says on
 * its face that it is one input to an SLFRS S2 disclosure rather than the
 * disclosure itself.
 */
router.get('/report', authenticate, defaultLimiter,
  doc({ summary: 'SLFRS S1/S2 and GRI lines, with what it could not state',
    description: 'A pipeline of financed projects is not the bank\'s inventory, so the '
      + 'inventory lines are reported absent with the clause that requires them and where the '
      + 'figure actually comes from. The checklist is answered from the report, so it can fail.',
    query: { year: 'The reporting year. Defaults to the current one.',
      bau: 'Cumulative BAU tonnage, if the share of the national target is wanted.' },
    response: body({ report: obj, source: str }, ['report']) }),
  handle(async (req, res) => {
  const year = req.query.year === undefined ? undefined : Number(req.query.year);
  if (year !== undefined && !Number.isInteger(year)) {
    return res.status(400).json({
      error: 'INVALID_YEAR',
      message: 'year must be a four-digit reporting year.',
    });
  }
  const bau = req.query.bau === undefined || req.query.bau === '' ? undefined : Number(req.query.bau);
  if (bau !== undefined && !Number.isFinite(bau)) {
    return res.status(400).json({
      error: 'INVALID_BAU',
      message: 'bau must be the absolute business-as-usual emissions for 2026-2035 in tCO2e.',
    });
  }
  const { projects, source, sample } = await store.list(req.orgId);
  const settings = await store.entityDisclosures(req.orgId);
  res.json({
    report: reporting.buildDisclosure(projects, {
      reportingYear: year,
      entityDisclosures: settings,
      bauCumulative_tCO2e: bau,
      sample,
      sampleNote: store.seedMeta().sampleNote,
    }),
    source,
  });
}));

/** A period, exported whole, with a checksum over its canonical form. */
router.get('/export', authenticate, defaultLimiter,
  doc({ summary: 'A period package, checksummed over its own canonical form',
    description: 'The export timestamp sits outside the hash, so two exports of identical '
      + 'records checksum identically and a changed checksum means the records changed.',
    response: body({
      format: str, reportingYear: num, orgId: orNull(str), sample: bool,
      sampleNote: orNull(str), exportedAt: str, projects: arr(),
      checksum: str, checksumNote: str,
    }, ['format', 'projects', 'checksum']) }),
  handle(async (req, res) => {
  const { projects, sample } = await store.list(req.orgId);
  res.json(reporting.exportPeriod(projects, {
    reportingYear: req.query.year === undefined ? undefined : Number(req.query.year),
    orgId: req.orgId,
    sample,
    sampleNote: store.seedMeta().sampleNote,
  }));
}));

/**
 * Import a period package.
 *
 * Verified before anything is written, and refused whole on any failure —
 * half an imported period is a position nobody can reconcile.
 */
router.post('/import', authenticate, defaultLimiter,
  validate({ body: gcfImportSchema }, { stripUnknown: false }),
  doc({ summary: 'Verify and import a period package', status: 201,
    description: 'Verified before anything is written and refused whole on any failure — half '
      + 'an imported period is a position nobody can reconcile. Every record still has to '
      + 'satisfy the schema: a transfer format is not an exemption.',
    response: body({
      imported: num, reportingYear: num, checksum: str, verified: bool, storage: obj,
    }, ['imported', 'verified']) }),
  handle(async (req, res) => {
  const pkg = reporting.importPeriod(req.body);
  const written = [];
  for (const p of pkg.projects) {
    written.push(await store.put(req.orgId, p, { by: (req.actor && req.actor.label) || req.orgId }));
  }
  res.status(201).json({
    imported: written.length,
    reportingYear: pkg.reportingYear,
    checksum: pkg.checksum,
    verified: true,
    storage: partcStore.capability(),
  });
}));


/** The gate. Runs before any ranking, and its output is three sets. */

module.exports = router;
