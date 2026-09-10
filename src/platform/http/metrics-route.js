// @ts-check
/**
 * GET /v1/metrics — what this process has done since it started.
 *
 * JSON by default; the Prometheus text exposition with `?format=prometheus`
 * or `Accept: text/plain`, for a scraper. The figures are this instance's
 * only, and the payload says so; the cross-instance view is the log drain.
 */

'use strict';

const { Router } = require('express');
const apiKeyAuth = require('../auth/api-key');
const metrics = require('../observability/metrics');

const router = Router();

router.get('/metrics', apiKeyAuth, (req, res) => {
  const wantsText = req.query.format === 'prometheus' || req.accepts(['json', 'text']) === 'text';
  if (wantsText) {
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return res.send(metrics.prometheus());
  }
  return res.json(metrics.snapshot());
});

module.exports = router;
