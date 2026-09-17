// @ts-check
/**
 * Joi validation for the PCAF Part A exposure register.
 *
 * One register, several classes: the body is the class's own engine schema
 * with the register's fields in front of it — which asset class's engine
 * should run, the reporting year the row belongs to, and the identifiers and
 * counterparty the register is browsed by. `assetClass` decides which shape
 * applies, so a §5.4 property keyed with a floor area and a §5.2 loan keyed
 * with a company value are each held to their own schema and neither is
 * refused for a field the other needs. `engineInputOf()` in the service
 * strips `assetClass` before an engine sees it, because the engine schemas
 * are closed and a field the caller was right to send would otherwise be a
 * named 400.
 *
 * Everything else stays where it is. The engine refuses what the standard
 * refuses, with the clause and the remedy; restating those rules here would
 * be a second place to keep in step and would answer with a generic message.
 */

'use strict';

const Joi = require('joi');
const { exposureSchema } = require('./business-loans');
const { realEstateRequestSchema } = require('./real-estate');
const { assessRequestSchema } = require('./pcaf-parta');
const { listedEquitySchema } = require('./listed-equity');
const { motorVehiclesRequestSchema } = require('./motor-vehicles');
const { climateSchema, exposureClimateSchema } = require('./climate');
const { facilitySchema } = require('./facility');

const reportingYear = Joi.number().integer().min(2000).max(2100).required();

/* The register's own fields on an engine schema that does not carry them. */
const registerFields = {
  /* The bank's own climate classification, on every class: S2 asks for the
     share of the *book* vulnerable or aligned, so a block that only some
     classes could carry would answer for only some of the book. */
  climate: exposureClimateSchema,
  /* The facility behind a loan — the commitment, the drawn amount, the dates
     and the repayment profile. On every loan class and not on §5.1: a share
     or a bond is held, not drawn down. Stripped before the engine like the
     climate block; the register reads it after the adapter. */
  facility: facilitySchema.optional(),
  identifiers: Joi.object({
    id: Joi.string().max(120).optional(),
    accountNumber: Joi.string().max(80).optional(),
  }).unknown(false).optional(),
  counterparty: Joi.object({
    name: Joi.string().max(200).optional(),
    sector: Joi.string().max(120).optional(),
  }).unknown(false).optional(),
};

/* §5.2 — `assetClass` is optional and defaults in the service rather than
   here: a default written in two places is a default that can disagree with
   itself. */
const businessLoansRegisterSchema = exposureSchema.append({
  assetClass: Joi.string().valid('business-loans-unlisted-equity').optional(),
  reportingYear,
  climate: registerFields.climate,
  facility: registerFields.facility,
});

/* §5.4 / §5.5 — the class is the register's `assetClass`; the engine's own
   `class` field may be sent but need not be, and the service refuses the two
   disagreeing. */
const realEstateRegisterSchema = realEstateRequestSchema
  .fork('class', s => s.optional())
  .append({
    assetClass: Joi.string().valid('commercial-real-estate', 'mortgages').required(),
    reportingYear,
    ...registerFields,
  });

/* §5.3 — the engine takes the counterparty as a name; the register's
   `identifiers` ride beside it. */
const projectFinanceRegisterSchema = assessRequestSchema
  .fork('reportingYear', () => reportingYear)
  .fork('assetClass', s => s.valid('project-finance').required())
  .append({ identifiers: registerFields.identifiers, climate: registerFields.climate, facility: registerFields.facility })
  .unknown(false);

/* §5.6 */
const motorVehiclesRegisterSchema = motorVehiclesRequestSchema.append({
  assetClass: Joi.string().valid('motor-vehicle-loans').required(),
  reportingYear,
  ...registerFields,
});

/* §5.1 */
const listedEquityRegisterSchema = listedEquitySchema.append({
  assetClass: Joi.string().valid('listed-equity-corporate-bonds').required(),
  reportingYear,
  climate: registerFields.climate,
});

const registerExposureSchema = Joi.alternatives().conditional('.assetClass', {
  switch: [
    { is: 'commercial-real-estate', then: realEstateRegisterSchema },
    { is: 'mortgages', then: realEstateRegisterSchema },
    { is: 'project-finance', then: projectFinanceRegisterSchema },
    { is: 'listed-equity-corporate-bonds', then: listedEquityRegisterSchema },
    { is: 'motor-vehicle-loans', then: motorVehiclesRegisterSchema },
  ],
  otherwise: businessLoansRegisterSchema,
});

const bookSchema = Joi.object({
  reportingYear: Joi.number().integer().min(2000).max(2100).required(),
  /* Positive, and the service says why: a book of zero has no coverage rather
     than full coverage. */
  totalLoansAndInvestments: Joi.number().positive().required(),
  currency: Joi.string().max(10).optional(),
  statedBy: Joi.string().max(200).optional(),
  note: Joi.string().max(2000).optional(),
}).unknown(false);

const positionQuerySchema = Joi.object({
  improvementTarget: Joi.number().integer().min(1).max(5).optional(),
  assetClass: Joi.string().max(60).optional(),
}).unknown(true);

/**
 * The reporting entity's recalculation protocol (Chapter 6). Every field is
 * optional so a caller can set one without restating the rest; `baseYear`
 * accepts null, because clearing a base year back to unstated is a legitimate
 * act and different from leaving it unchanged.
 */
const personSchema = Joi.object({
  name: Joi.string().trim().max(200).required(),
  role: Joi.string().trim().allow('').max(200).optional(),
  date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional().description('YYYY-MM-DD'),
}).allow(null);

const settingsSchema = Joi.object({
  baseYear: Joi.number().integer().min(2000).max(2100).allow(null),
  significanceThresholdPct: Joi.number().min(0).max(100)
    .description('Movement in a reported figure that triggers a recalculation, per the GHG Protocol Scope 3 Standard'),
  recalculationTriggers: Joi.array().items(Joi.string().trim().max(300)).max(20),
  recalculationPolicy: Joi.string().allow('').max(4000),

  /* The reporting entity and its boundary — facts only the entity can state,
     printed on the face of every Part A document and answered by its checklist. */
  reportingEntity: Joi.string().trim().max(200).allow(null).description('The legal name of the reporting financial institution'),
  consolidationApproach: Joi.string().valid('operational_control', 'financial_control', 'equity_share').allow(null)
    .description('The GHG Protocol consolidation approach the inventory boundary follows'),
  boundaryNote: Joi.string().allow('').max(2000).description('What the organisational boundary includes and excludes'),
  fiscalYearEnd: Joi.string().pattern(/^\d{2}-\d{2}$/).allow(null).description('MM-DD; the position is taken at this date in the reporting year'),
  gwpBasis: Joi.string().trim().max(120).allow(null).description('The IPCC assessment report and horizon the CO2e rests on, e.g. "IPCC AR6, 100-year"'),
  preparedBy: personSchema.allow(null).description('Who prepared the disclosure; null clears it'),
  approvedBy: personSchema.allow(null).description('Who approved the disclosure, and on what date; null clears it'),
  assetClassesNotReported: Joi.array().items(Joi.object({
    assetClass: Joi.string().max(60).required(),
    reason: Joi.string().trim().max(500).required(),
  })).max(12).description('Part A asset classes the entity does not report, each with its reason (Chapter 6, p.162)'),

  /* The SLFRS S2 facts about the entity itself. Built from the item registry
     rather than restated here, so the route accepts exactly what the record
     holds. Merged path by path: sending one pillar leaves the rest standing. */
  climate: climateSchema.description('The entity\'s own SLFRS S2 governance, strategy, risk-management, inventory and target facts'),
}).unknown(false);

/**
 * A recomputation takes no body: the input is the one already held, which is
 * what makes it a recomputation rather than a change. Closed rather than
 * absent, so a caller that sends a body is told it was not used instead of
 * assuming it was.
 */
const noBodySchema = Joi.object({}).unknown(false);

const reportRequestSchema = Joi.object({
  format: Joi.string().valid('json', 'pdf', 'docx').default('json'),
  insurer: Joi.string().max(200).optional(),
}).unknown(false);

const disclosureQuerySchema = Joi.object({
  format: Joi.string().valid('json', 'pdf', 'docx').default('json'),
  insurer: Joi.string().max(200).optional(),
  currency: Joi.string().max(10).optional(),
  country: Joi.string().length(2).optional(),
}).unknown(false);


/* A review move. The service decides whether the move is allowed from where
   the exposure stands; the schema only closes the vocabulary. */
const statusChangeSchema = Joi.object({
  status: Joi.string().valid('recorded', 'under_review', 'approved').required()
    .description('Where the exposure moves to — one step at a time'),
  reason: Joi.string().trim().max(1000).optional()
    .description('Required when reopening an approved exposure; recorded on its trail'),
}).unknown(false);

module.exports = { registerExposureSchema, bookSchema, positionQuerySchema, noBodySchema, reportRequestSchema, disclosureQuerySchema, settingsSchema, statusChangeSchema };
