// @ts-check
/**
 * GET /v1/openapi.json — the contract, from the router that answers it.
 * No credential: it is the document a client is generated from, and it
 * describes nothing a reader of docs/API-SCOPES.md does not already see.
 */

'use strict';

const { Router } = require('express');
const { buildSpec } = require('./openapi');

const router = Router();
let cached = null;

router.get('/openapi.json', (req, res) => {
  if (!cached) cached = buildSpec(req.app);
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json(cached);
});

module.exports = router;
module.exports._reset = () => { cached = null; };
