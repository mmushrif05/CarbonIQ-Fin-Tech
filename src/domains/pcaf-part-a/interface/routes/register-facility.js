// @ts-check
/**
 * The facility's own read: what the schedule says the balance is at a date.
 *
 *   POST /v1/pcaf/part-a/facility/schedule   { facility, asOf } → the scheduled balance
 *
 * The record form asks this before a year-end balance has been keyed — at
 * origination there is no ledger balance yet — so the browser can offer the
 * scheduled figure without computing it. A read: nothing stored, no id, the
 * same body twice the same answer. What it returns is a schedule, and the
 * exposure that takes it records the basis as such.
 */

'use strict';

const { Router } = require('express');
const authenticate = require('../../../../platform/auth/authenticate');
const { doc, body, obj } = require('../../../../platform/http/openapi-hints');
const validate = require('../../../../platform/http/validate');
const { defaultLimiter } = require('../../../../platform/http/rate-limit');
const handle = require('../../../../platform/http/async-handler');
const { scheduleRequestSchema } = require('../schemas/facility');
const { schedule } = require('../../domain/facility');

const router = Router();

router.post('/facility/schedule', authenticate, defaultLimiter,
  doc({ summary: 'The balance a facility’s repayment schedule expects at a date — a read, stores nothing',
    description: 'From the commitment, the drawn amount, the dates and the repayment profile, the balance the '
      + 'schedule expects at the position date: disbursed minus the principal repaid by then, nought before '
      + 'origination and at maturity. A convenience for the form at origination; an exposure that takes the '
      + 'figure as its year-end balance records the basis as scheduled and carries a material finding until '
      + 'the loan account’s balance replaces it (§5.2, p.56).',
    response: body({ scheduled: obj }, ['scheduled']) }),
  validate({ body: scheduleRequestSchema }),
  handle(async (req, res) => {
    res.json({ scheduled: schedule.outstandingAt(req.body.facility, req.body.asOf) });
  }));

module.exports = router;
