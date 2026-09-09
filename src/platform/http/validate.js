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
 * @returns {Function} Express middleware
 *
 * Usage:
 *   const validate = require('./middleware/validate');
 *   router.post('/assess', validate({ body: assessSchema }), handler);
 */
function validate(schema) {
  return (req, res, next) => {
    const errors = [];

    for (const [source, sourceSchema] of Object.entries(schema)) {
      if (!req[source]) continue;

      const { error, value } = sourceSchema.validate(req[source], {
        abortEarly: false,
        stripUnknown: true,
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
}

// ---------------------------------------------------------------------------
// Common Schemas (reusable across routes)
// ---------------------------------------------------------------------------

const schemas = {
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
