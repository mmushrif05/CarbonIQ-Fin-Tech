/**
 * CarbonIQ FinTech — Request Validation Middleware
 *
 * Generic middleware factory that validates req.body against a Joi schema.
 * Returns 400 with structured error details on validation failure.
 */

const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,     // Report all errors, not just the first
      stripUnknown: true,    // Remove unknown fields for safety
      convert: true,         // Coerce types where possible
    });

    if (error) {
      const details = error.details.map(d => ({
        field: d.path.join('.'),
        message: d.message,
        type: d.type,
      }));

      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: `Request validation failed: ${details.length} error(s)`,
        details,
      });
    }

    // Replace body with validated & sanitized data
    req.body = value;
    next();
  };
};

module.exports = validate;
