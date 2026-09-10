// @ts-check
/**
 * CarbonIQ FinTech — Request Validation Middleware
 *
 * Uses Joi for schema validation on request body, params, and query.
 * Returns structured error responses with field-level details.
 */

const Joi = require('joi');

/**
 * Creates a validation middleware for the given schema.
 *
 * @param {Object} schema - Joi schema object with optional keys: body, params, query
 * @param {{stripUnknown?: boolean}} [options]
 *   `stripUnknown` defaults to true, which is right for most routes: a caller
 *   sending a field this version does not know gets the request honoured
 *   rather than refused, and the field ignored.
 *
 *   Two kinds of route must say otherwise, and both are here.
 *
 *   A route that **stores a record** sets it false, so an unknown field is
 *   refused instead of dropped: silently discarding a field is how a caller
 *   comes to believe something they invented is being honoured, and on a
 *   record store that belief survives into a report.
 *
 *   A route that receives a **hashed payload** — a period package, an issued
 *   certificate — also sets it false, for the opposite reason: the checksum
 *   covers the payload's own keys, so stripping one would make a document this
 *   system issued fail its own verification. Those schemas admit unknown keys
 *   explicitly, so nothing is stripped and nothing is refused.
 *
 * @returns {Function} Express middleware
 *
 * Usage:
 *   const validate = require('./middleware/validate');
 *   router.post('/assess', validate({ body: assessSchema }), handler);
 */
function validate(schema, options = {}) {
  const stripUnknown = options.stripUnknown !== false;
  const middleware = (req, res, next) => {
    const errors = [];

    for (const [source, sourceSchema] of Object.entries(schema)) {
      if (!req[source]) continue;

      const { error, value } = sourceSchema.validate(req[source], {
        abortEarly: false,
        stripUnknown,
        convert: true
      });

      if (error) {
        for (const detail of error.details) {
          errors.push({
            source,
            field: detail.path.join('.'),
            message: detail.message,
            type: detail.type
          });
        }
      } else {
        // Replace with validated (and stripped) values
        req[source] = value;
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        details: errors
      });
    }

    next();
  };
  /* The schema stays on the middleware, so the OpenAPI generator can read
     the request contract off the router — one source, no second copy. */
  middleware.schema = schema;
  Object.defineProperty(middleware, 'name', { value: 'validate' });
  return middleware;
}

// ---------------------------------------------------------------------------
// Common Schemas (reusable across routes)
// ---------------------------------------------------------------------------

const schemas = {
  /**
   * A write that takes no body.
   *
   * Attached so the contract says so. From a generated document, "this
   * operation has no request schema" and "this operation takes no body" look
   * identical, and the first sends a client author looking through source for
   * fields that do not exist. It also refuses a body sent by mistake rather
   * than accepting and ignoring it, which is how a caller comes to believe a
   * field they invented is being honoured.
   */
  emptyBody: Joi.object({}).unknown(false),

  projectId: Joi.object({
    projectId: Joi.string().required().min(1).max(128)
  }),

  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  }),

  covenantCheck: Joi.object({
    metric: Joi.string().valid(
      'total_tco2e', 'tco2e_per_m2', 'epd_coverage',
      'reduction_pct', 'material_substitution_rate'
    ).required(),
    operator: Joi.string().valid('lt', 'lte', 'gt', 'gte', 'eq', 'between').required(),
    threshold: Joi.number().required(),
    upperThreshold: Joi.number().when('operator', { is: 'between', then: Joi.required(), otherwise: Joi.optional() }),
    buildingArea_m2: Joi.number().positive().optional()
  }),

  webhookRegister: Joi.object({
    url: Joi.string().uri({ scheme: ['https'] }).required(),
    events: Joi.array().items(
      Joi.string().valid(
        'covenant.breach', 'covenant.warning',
        'assessment.complete', 'score.change',
        'taxonomy.change', 'verification.complete'
      )
    ).min(1).required(),
    secret: Joi.string().min(16).max(256).optional()
  })
};

module.exports = validate;
module.exports.schemas = schemas;
