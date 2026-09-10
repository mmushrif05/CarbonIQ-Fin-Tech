// @ts-check
/**
 * `doc({...})` — a no-op middleware carrying what the generator cannot
 * infer from the router: a summary, a description, the query parameters a
 * handler reads without validating, the shape it answers with.
 *
 * It sits in the route's own chain, so the words stay beside the code they
 * describe and the OpenAPI document still has one source: the router.
 */

'use strict';

/**
 * @param {{summary?: string, description?: string, query?: object, response?: object, body?: object, status?: number, tags?: string[], produces?: string[], responseDescription?: string}} hints
 *   `query` maps a name to a JSON Schema (or a description string);
 *   `response` is the JSON Schema of the 2xx body, or `{ $ref }` to a component.
 */
function doc(hints = {}) {
  const mw = (_req, _res, next) => next();
  Object.defineProperty(mw, 'name', { value: 'apiDoc' });
  mw.hints = hints;
  return mw;
}

const { convert } = require('./joi-to-schema');

/* Named record schemas, hoisted into components so a document references
   each once rather than inlining it on every route that answers with it. */
const components = new Map();

/**
 * The JSON Schema of a stored record: the validated fields the Joi schema
 * describes, plus the identity and timestamps the service stamps on it.
 * With a `name` the schema is registered as a component and a `$ref` is
 * returned in its place.
 *
 * @param {any} joiSchema
 * @param {string} idField
 * @param {Record<string, any>} [extra] properties the service stamps on beyond the schema
 * @param {string|null} [name] register as a component under this name and return a `$ref`
 */
function recordOf(joiSchema, idField, extra = {}, name = null) {
  const base = convert(joiSchema);
  const props = { ...(base.properties || {}), [idField]: { type: 'string' }, orgId: { type: 'string' }, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' }, ...extra };
  const schema = { ...base, type: 'object', properties: props, required: [...new Set([...(base.required || []), idField])], additionalProperties: true };
  if (!name) return schema;
  components.set(name, schema);
  return { $ref: `#/components/schemas/${name}` };
}

/** The record schemas registered so far, for the generator. */
function registeredComponents() { return Object.fromEntries(components); }

/**
 * `{ [key]: Item[] , ...extra }` — the shape a list route answers.
 * @param {string} key
 * @param {any} itemSchema
 * @param {Record<string, any>} [extra]
 */
function listOf(key, itemSchema, extra = {}) {
  return { type: 'object', required: [key], properties: { [key]: { type: 'array', items: itemSchema }, ...extra } };
}

/* ---------------------------------------------------------------------------
   Response shapes.

   146 of 162 operations documented their reply as `{ type: 'object',
   additionalProperties: true }` — an object of unknown contents. A bank
   generating a client could construct every request and understand one reply
   in eight, and the operation that produces the regulatory figure was among
   the eight it could not.

   These are the pieces a response is described from. They are deliberately a
   **floor rather than a ceiling**: `body()` sets `additionalProperties: true`,
   so a route may answer with more than is named and the document stays true,
   while the fields a client actually reads are named and typed. A schema that
   claimed to be exhaustive would be wrong the first time a field was added,
   and a wrong contract is worse than a vague one.
   --------------------------------------------------------------------------- */

/** A string. */
const str = { type: 'string' };
/** A number. */
const num = { type: 'number' };
/** A boolean. */
const bool = { type: 'boolean' };
/** An ISO 8601 instant. */
const when = { type: 'string', format: 'date-time' };
/** An object whose inner shape is the engine's own, and is not restated here. */
const obj = { type: 'object', additionalProperties: true };
/**
 * A value that may legitimately be absent — absence is an answer here, and the
 * document has to be able to say so. OpenAPI 3.1 spells that as a type union,
 * not the 3.0 `nullable` keyword, which a 3.1 validator ignores.
 */
const orNull = schema => ({ ...schema, type: [schema.type, 'null'] });
/**
 * An array of `items`.
 * @param {any} [items]
 */
const arr = (items = obj) => ({ type: 'array', items });

/**
 * The object a route answers with: the fields a client reads, named and typed,
 * and room for the ones it does not.
 * @param {Record<string, any>} properties
 * @param {string[]} [required]
 */
function body(properties, required = []) {
  const schema = { type: 'object', properties, additionalProperties: true };
  return required.length ? { ...schema, required } : schema;
}

module.exports = {
  doc, recordOf, listOf, registeredComponents,
  body, str, num, bool, when, obj, orNull, arr,
};
