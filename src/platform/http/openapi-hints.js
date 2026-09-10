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

/** `{ [key]: Item[] , ...extra }` — the shape a list route answers. */
function listOf(key, itemSchema, extra = {}) {
  return { type: 'object', required: [key], properties: { [key]: { type: 'array', items: itemSchema }, ...extra } };
}

module.exports = { doc, recordOf, listOf, registeredComponents };
