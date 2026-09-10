// @ts-check
/**
 * /v1/jobs — enqueue, list, read, and download what a job produced.
 */

'use strict';

const { Router } = require('express');
const Joi = require('joi');
const apiKeyAuth = require('../auth/api-key');
const validate = require('./validate');
const handle = require('./async-handler');
const { defaultLimiter } = require('./rate-limit');
const { sendList, paged } = require('./pagination');
const { doc } = require('./openapi-hints');
const { sendDocument } = require('../reporting/pdf-response');
const queue = require('../jobs/queue');
const registry = require('../jobs/registry');

const router = Router();

const enqueueSchema = Joi.object({
  type: Joi.string().min(1).max(64).required().description('A job type from GET /v1/jobs/types.'),
  payload: Joi.object().unknown(true).default({}).description('The handler\'s input — for a report job, the body the synchronous route takes.'),
});

router.post('/jobs', apiKeyAuth, defaultLimiter, validate({ body: enqueueSchema }),
  doc({ summary: 'Enqueue a job', status: 202, description: 'Answers 202 with the job. In inline mode the job has already run; in postgres mode poll GET /v1/jobs/{jobId}.', response: { type: 'object', properties: { job: { $ref: '#/components/schemas/Job' }, mode: { type: 'string', enum: ['postgres', 'inline'] } } } }),
  handle(async (req, res) => {
    const job = await queue.enqueue({
      orgId: req.apiKey.orgId, type: req.body.type, payload: req.body.payload,
      requestId: req.requestId, actor: req.actor ? req.actor.id : null,
    });
    res.status(202).json({ job: queue.publicJob(job), mode: queue.mode() });
  }));

router.get('/jobs/types', apiKeyAuth, defaultLimiter,
  doc({ summary: 'The job types this deployment runs', response: { type: 'object', properties: { types: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, description: { type: 'string' }, scope: { type: 'string' } } } }, mode: { type: 'string' } } } }),
  (_req, res) => { res.json({ types: registry.types(), mode: queue.mode() }); });

router.get('/jobs', apiKeyAuth, defaultLimiter, paged('status', 'type'),
  doc({ summary: 'List this organisation\'s jobs, newest first', response: { type: 'object', properties: { jobs: { type: 'array', items: { $ref: '#/components/schemas/Job' } } } } }),
  handle(async (req, res) => {
    const jobs = await queue.list(req.apiKey.orgId, { status: req.query.status, type: req.query.type });
    sendList(req, res, 'jobs', jobs.map(queue.publicJob));
  }));

router.get('/jobs/:jobId', apiKeyAuth, defaultLimiter,
  doc({ summary: 'One job', response: { type: 'object', properties: { job: { $ref: '#/components/schemas/Job' } } } }),
  handle(async (req, res) => {
    const job = await queue.get(req.apiKey.orgId, req.params.jobId);
    if (!job) return res.status(404).json({ error: 'NOT_FOUND', message: `No job ${req.params.jobId}.` });
    res.json({ job: queue.publicJob(job) });
  }));

router.get('/jobs/:jobId/artifact', apiKeyAuth, defaultLimiter,
  doc({ summary: 'Download what the job produced', produces: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] }),
  handle(async (req, res) => {
    const job = await queue.get(req.apiKey.orgId, req.params.jobId);
    if (!job) return res.status(404).json({ error: 'NOT_FOUND', message: `No job ${req.params.jobId}.` });
    if (job.status === 'queued' || job.status === 'running') {
      return res.status(409).json({ error: 'JOB_NOT_FINISHED', message: `Job ${job.jobId} is ${job.status}.`, remedy: 'Poll GET /v1/jobs/{jobId} until status is succeeded.' });
    }
    const art = await queue.artifact(req.apiKey.orgId, req.params.jobId);
    if (!art) return res.status(404).json({ error: 'NO_ARTIFACT', message: `Job ${job.jobId} produced no document.`, remedy: job.status === 'failed' ? 'See job.error.' : 'Its result is on GET /v1/jobs/{jobId}.' });
    return sendDocument(res, art.buffer, { filename: art.filename, contentType: art.contentType });
  }));

module.exports = router;
