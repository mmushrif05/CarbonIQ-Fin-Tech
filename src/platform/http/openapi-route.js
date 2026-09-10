// @ts-check
/**
 * GET /v1/openapi.json — the contract, from the router that answers it.
 * No credential: it is the document a client is generated from, and it
 * describes nothing a reader of docs/API-SCOPES.md does not already see.
 */

'use strict';

const { Router } = require('express');
const { buildSpec } = require('./openapi');
const { doc, body, str, obj } = require('./openapi-hints');

const router = Router();
let cached = null;

router.get('/openapi.json',
  doc({ summary: 'The OpenAPI 3.1 document, generated from the router',
    description: 'Never hand-written: every operation is a route Express registered, its '
      + 'request schema is the one `validate()` holds it to, and its scope is what the scope '
      + 'resolver returns. A test fails the build when the committed file and the router '
      + 'disagree.',
    response: body({ openapi: str, info: obj, paths: obj, components: obj },
      ['openapi', 'info', 'paths']) }),
  (req, res) => {
  if (!cached) cached = buildSpec(req.app);
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json(cached);
});

module.exports = router;
module.exports._reset = () => { cached = null; };
