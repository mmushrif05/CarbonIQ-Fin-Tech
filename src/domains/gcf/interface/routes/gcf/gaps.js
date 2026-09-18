// @ts-check
/**
 * The gap register — what is blocking each project and who holds the key,
 * composed for the whole pipeline. A read; stores nothing.
 */

'use strict';

const { Router } = require('express');
const authenticate = require('../../../../../platform/auth/authenticate');
const { doc, body, str, bool, obj, orNull, arr } = require('../../../../../platform/http/openapi-hints');
const { defaultLimiter } = require('../../../../../platform/http/rate-limit');
const store = require('../../../infrastructure/store');
const gaps = require('../../../domain/gaps');
const reporting = require('../../../application/reporting');
const handle = require('../../../../../platform/http/async-handler');

const router = Router();

router.get('/gaps', authenticate, defaultLimiter,
  doc({ summary: 'The gap register — what is blocking each project, and who holds the key',
    description: 'Every open item across the pipeline, read off the engines that raise them — what the '
      + 'stage needs, what the six criteria lack, whether the assessment is signed, what the assessor '
      + 'returned, and what the disclosure could not state — each with its clause, its remedy and an '
      + 'owner from a closed vocabulary. By owner and by project, furthest along first. Nothing is '
      + 'judged afresh, and a gap does not stop a stage move. A read; stores nothing.',
    response: body({ register: obj, source: str, sample: bool, sampleNote: orNull(str), owners: arr() }, ['register', 'source']) }),
  handle(async (req, res) => {
  const { projects, source, sample, meta } = await store.list(req.orgId);
  const settings = await store.entityDisclosures(req.orgId);
  const entityGaps = reporting.buildDisclosure(projects, {
    entityDisclosures: settings, sample, sampleNote: meta.sampleNote,
  }).gaps;
  res.json({
    register: gaps.register(projects, { entityGaps }),
    source,
    sample,
    sampleNote: sample ? meta.sampleNote : null,
  });
}));

module.exports = router;
