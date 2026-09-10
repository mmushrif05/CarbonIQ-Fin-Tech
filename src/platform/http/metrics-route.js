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
const { doc, body, str, num, obj } = require('./openapi-hints');

const router = Router();

router.get('/metrics', apiKeyAuth,
  doc({ summary: "This process's counters — JSON or Prometheus text",
    produces: ['text/plain'],
    description: 'One process\'s view, and the payload says so: the platform log drain is the '
      + 'cross-instance one. Requests are counted by route pattern rather than by path, or a '
      + 'busy id would become its own series.',
    response: body({
      scope: str, routes: obj, store: obj, uptimeSeconds: num, note: str,
    }) }),
  (req, res) => {
  const wantsText = req.query.format === 'prometheus' || req.accepts(['json', 'text']) === 'text';
  if (wantsText) {
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return res.send(metrics.prometheus());
  }
  return res.json(metrics.snapshot());
});

module.exports = router;
