// @ts-check
/**
 * Joi → JSON Schema (the dialect OpenAPI 3.1 speaks).
 *
 * The validation schemas are the contract: what `validate()` accepts is what
 * the API accepts, and the OpenAPI document must say the same thing or it
 * is a second copy that drifts. So the document is generated from
 * `schema.describe()` — Joi's own structured description of a schema — and
 * nothing is written twice. The subset converted is the subset the tree
 * uses; a construct this converter does not know becomes a permissive
 * schema rather than a wrong one, and the test that holds the document to
 * the router says which constructs appear.
 */

'use strict';

function rule(d, name) {
  return (d.rules || []).find(r => r.name === name);
}

function stringSchema(d) {
  const out = { type: 'string' };
  for (const r of d.rules || []) {
    const a = r.args || {};
    if (r.name === 'min') out.minLength = a.limit;
    else if (r.name === 'max') out.maxLength = a.limit;
    else if (r.name === 'length') { out.minLength = a.limit; out.maxLength = a.limit; }
    else if (r.name === 'email') out.format = 'email';
    else if (r.name === 'uri') out.format = 'uri';
    else if (r.name === 'isoDate') out.format = 'date-time';
    else if (r.name === 'guid') out.format = 'uuid';
    else if (r.name === 'pattern' && a.regex) {
      const src = String(a.regex);
      const m = /^\/(.*)\/[a-z]*$/.exec(src);
      out.pattern = m ? m[1] : src;
    }
  }
  return out;
}

function numberSchema(d) {
  const out = { type: rule(d, 'integer') ? 'integer' : 'number' };
  for (const r of d.rules || []) {
    const a = r.args || {};
    if (r.name === 'min') out.minimum = a.limit;
    else if (r.name === 'max') out.maximum = a.limit;
    else if (r.name === 'greater') out.exclusiveMinimum = a.limit;
    else if (r.name === 'less') out.exclusiveMaximum = a.limit;
    else if (r.name === 'sign' && a.sign === 'positive') out.exclusiveMinimum = 0;
    else if (r.name === 'sign' && a.sign === 'negative') out.exclusiveMaximum = 0;
  }
  return out;
}

function arraySchema(d) {
  const out = { type: 'array' };
  const items = (d.items || []).map(fromDescription).filter(s => Object.keys(s).length);
  if (items.length === 1) out.items = items[0];
  else if (items.length > 1) out.items = { anyOf: items };
  for (const r of d.rules || []) {
    const a = r.args || {};
    if (r.name === 'min') out.minItems = a.limit;
    else if (r.name === 'max') out.maxItems = a.limit;
    else if (r.name === 'length') { out.minItems = a.limit; out.maxItems = a.limit; }
    else if (r.name === 'unique') out.uniqueItems = true;
  }
  return out;
}

function objectSchema(d) {
  const out = { type: 'object' };
  const props = {};
  const required = [];
  for (const [key, sub] of Object.entries(d.keys || {})) {
    const flags = (sub && sub.flags) || {};
    if (flags.presence === 'forbidden') continue;
    props[key] = fromDescription(sub);
    if (flags.presence === 'required') required.push(key);
  }
  if (Object.keys(props).length) out.properties = props;
  if (required.length) out.required = required;
  if (d.flags && d.flags.unknown === true) out.additionalProperties = true;
  return out;
}

function alternativesSchema(d) {
  const options = [];
  for (const m of d.matches || []) {
    if (m.schema) options.push(fromDescription(m.schema));
    else {
      if (m.then) options.push(fromDescription(m.then));
      if (m.otherwise) options.push(fromDescription(m.otherwise));
    }
  }
  const real = options.filter(s => Object.keys(s).length);
  return real.length ? { anyOf: real } : {};
}

/** A JSON Schema for one `schema.describe()` node. */
function fromDescription(d) {
  if (!d || typeof d !== 'object') return {};
  const flags = d.flags || {};
  let out;
  switch (d.type) {
    case 'object': out = objectSchema(d); break;
    case 'array': out = arraySchema(d); break;
    case 'string': out = stringSchema(d); break;
    case 'number': out = numberSchema(d); break;
    case 'boolean': out = { type: 'boolean' }; break;
    case 'date': out = { type: 'string', format: 'date-time' }; break;
    case 'alternatives': out = alternativesSchema(d); break;
    default: out = {};
  }
  const allow = Array.isArray(d.allow) ? d.allow : [];
  if (flags.only && allow.length) {
    const values = allow.filter(v => v !== null);
    if (values.length) out.enum = values;
  }
  if (allow.includes(null)) {
    if (typeof out.type === 'string') out.type = [out.type, 'null'];
    else if (!out.type && !out.anyOf) out.type = 'null';
    else if (out.anyOf) out.anyOf = [...out.anyOf, { type: 'null' }];
  }
  if (flags.description) out.description = flags.description;
  if (flags.default !== undefined && flags.default !== null && typeof flags.default !== 'function' && typeof flags.default !== 'object') out.default = flags.default;
  if (d.examples && d.examples.length) out.examples = d.examples;
  return out;
}

/** The JSON Schema for a Joi schema. */
function convert(joiSchema) {
  if (!joiSchema || typeof joiSchema.describe !== 'function') return {};
  return fromDescription(joiSchema.describe());
}

module.exports = { convert, fromDescription };
