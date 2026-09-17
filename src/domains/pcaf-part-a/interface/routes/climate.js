// @ts-check
/**
 * The SLFRS S2 climate facts the reporting entity states about itself.
 *
 *   GET  /v1/pcaf/part-a/climate/reference                the vocabularies and the items a form answers
 *   POST /v1/pcaf/part-a/settings/climate/illustrative    load the illustrative pack for a trial
 *
 * The facts themselves are read and written through `GET/PUT
 * /v1/pcaf/part-a/settings` beside the entity's boundary, because they are one
 * record about one entity and holding them in two would let the two disagree
 * about who is reporting. What lives here is the registry a form draws itself
 * from, and the one write that is not an ordinary edit.
 */

'use strict';

const { Router } = require('express');
const authenticate = require('../../../../platform/auth/authenticate');
const { defaultLimiter } = require('../../../../platform/http/rate-limit');
const validate = require('../../../../platform/http/validate');
const handle = require('../../../../platform/http/async-handler');
const referenceCache = require('../../../../platform/http/reference-cache');
const { doc, body, obj, arr, num } = require('../../../../platform/http/openapi-hints');
const register = require('../../application/register');
const climate = require('../../domain/climate');
const { noBodySchema } = require('../schemas/register');

const router = Router();

// ---------------------------------------------------------------------------

/* Reference data rather than part of `/reference`: the vocabularies change on
   their own release and a form that only needs these should not re-fetch the
   asset-class tables to get them. */
router.get('/climate/reference', authenticate, defaultLimiter, referenceCache(),
  doc({ summary: 'The vocabularies and the SLFRS S2 items the entity answers',
    description: 'One list per closed question the standard asks, and one row per fact, each naming '
      + 'the paragraph that requires it. The form, the record and the disclosure read this same '
      + 'registry, so a screen cannot offer an answer the record would refuse.',
    response: body({ pillars: arr(), items: arr(), vocabulary: obj }, ['pillars', 'items', 'vocabulary']) }),
  (_req, res) => {
    res.json({
      pillars: climate.PILLARS,
      items: climate.ITEMS,
      rowShapes: climate.ROW_SHAPES,
      vocabulary: climate.VOCABULARY,
      illustrativeItems: climate.ILLUSTRATIVE_ITEMS,
    });
  });

router.post('/settings/climate/illustrative', authenticate, defaultLimiter,
  doc({ summary: 'Load the illustrative SLFRS S2 climate facts for a trial',
    description: 'Records a complete set of illustrative governance, strategy, risk-management, '
      + 'inventory and target facts so a trial opens on a whole disclosure. Every field is then '
      + 'editable, and until a field is edited the disclosure marks it as illustrative rather than '
      + 'as a statement the entity made. Refused with 409 over facts already recorded.',
    response: body({ installed: num, settings: obj }, ['installed', 'settings']) }),
  validate({ body: noBodySchema }),
  handle(async (req, res) => {
    res.status(201).json(await register.installIllustrativeClimate(req.orgId));
  }));

module.exports = router;
