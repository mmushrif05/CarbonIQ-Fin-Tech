// @ts-check
/**
 * The GCF pipeline's request schemas.
 *
 * GCF was the one domain with no `interface/schemas/` directory at all: its
 * Joi lived in `domain/record.js` and was applied by the handler calling
 * `record.validate()` itself. That is not simply a placement preference —
 * validation the router cannot see is validation the OpenAPI generator cannot
 * read, so every GCF write shipped as an operation with no documented request
 * body, and a bank generating a client got a POST it had to guess at.
 *
 * **The record schema still lives in `domain/`, and that is correct.** The
 * period importer has to hold every record to the schema on the way in — a
 * transfer format is not an exemption — and a domain module may not import an
 * `interface/`. So the schema is declared once in the domain and *applied* at
 * the boundary from here, which the architecture allows in this direction and
 * only this one. One schema, two callers, no second copy to drift.
 */

'use strict';

const Joi = require('joi');
const record = require('../../domain/record');

/** A candidate on the way in. The domain's own schema, applied at the door. */
const gcfProjectSchema = record.projectSchema;

/** The facts only the reporting entity can state. */
const gcfEntitySchema = record.entitySchema;

/**
 * Copying the shipped illustrative pipeline into an organisation to edit.
 * It takes no body; the schema exists so the operation documents that rather
 * than leaving a reader to wonder what it wants.
 */
const gcfAdoptSchema = Joi.object({}).unknown(false);

/**
 * A period package on the way back in.
 *
 * **This schema must not change the payload, and that is not a style
 * preference.** The package carries a SHA-256 over its own canonical form, and
 * the importer recomputes that hash over every key except `exportedAt`,
 * `checksum` and `checksumNote`. So a schema that stripped an unrecognised key
 * — which `validate()` does by default — or coerced `"2026"` to `2026` would
 * alter what is hashed, and a package that left here intact would be refused
 * on the way back with a checksum mismatch: an integrity failure caused by the
 * integrity check.
 *
 * It therefore admits unknown keys at every level and types nothing inside
 * `projects`. What it checks is that the envelope is an envelope, so a caller
 * posting the wrong document gets told which field is missing instead of a
 * checksum error that reads like corruption. **The contents are still fully
 * validated** — the importer holds every record to the domain schema, because
 * a transfer format is not an exemption from the rules the records are held
 * to, and it refuses the package whole on any failure.
 */
const gcfImportSchema = Joi.object({
  format: Joi.string().max(80).required(),
  checksum: Joi.string().max(128).required(),
  projects: Joi.array().items(Joi.any()).required(),
  reportingYear: Joi.any().optional(),
  orgId: Joi.any().optional(),
  sample: Joi.any().optional(),
  sampleNote: Joi.any().optional(),
  exportedAt: Joi.any().optional(),
  checksumNote: Joi.any().optional(),
}).unknown(true);

module.exports = { gcfProjectSchema, gcfEntitySchema, gcfAdoptSchema, gcfImportSchema };
