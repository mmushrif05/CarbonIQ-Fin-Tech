// @ts-check
/**
 * OpenAPI 3.1 from the router (gaps F1, F4).
 *
 * The document is generated, never written: every operation comes from the
 * route Express registered, its request contract from the `validate()`
 * schema in that route's chain, its scope from `scopes.js`, its paging from
 * the `paged()` marker, its caching from `referenceCache()`, and its words
 * from `doc()`. There is no second copy to drift, and
 * `tests/api-contract.test.js` holds `docs/openapi.json` to what this
 * produces and validates live responses against it.
 *
 * Two media types on every operation: `application/json` is the shape the
 * route has always answered; `application/vnd.carboniq.v1+json` is the
 * same body inside the envelope `{ data, meta, error }`. A client picks one
 * with `Accept`.
 */

'use strict';

const config = require('../config');
const { requiredScopeFor } = require('../auth/scopes');
const { layerPath } = require('../auth/scopes-doc');
const { convert } = require('./joi-to-schema');
const { MAX_LIMIT, DEFAULT_LIMIT } = require('./pagination');
const { VND } = require('./envelope');
const { registeredComponents } = require('./openapi-hints');

const SITE = 'https://carboniqfintech.netlify.app';

const SCHEMAS = {
  Error: {
    type: 'object',
    description: 'Every error the API answers, in the shape it has always had.',
    required: ['error', 'message'],
    properties: {
      error: { type: 'string', description: 'A stable code, e.g. VALIDATION_ERROR, SCOPE_REQUIRED, NOT_FOUND, INTERNAL_ERROR.' },
      message: { type: 'string' },
      remedy: { type: 'string', description: 'What to do about it, where there is something to do.' },
      details: { type: 'array', items: { type: 'object' }, description: 'Field-level detail on a validation error.' },
      requestId: { type: 'string', description: 'The correlation id; quote it when asking for help.' },
      eventId: { type: 'string', description: 'The error report id, on a 500.' },
    },
    additionalProperties: true,
  },
  Page: {
    type: 'object',
    description: 'Present when the caller asked for a page with limit or cursor.',
    required: ['limit', 'nextCursor', 'hasMore'],
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT },
      nextCursor: { type: ['string', 'null'], description: 'Opaque. Pass it back as `cursor` for the next page; null on the last page.' },
      hasMore: { type: 'boolean' },
      total: { type: 'integer', description: 'Items in the whole list, where the store can say.' },
    },
  },
  Meta: {
    type: 'object',
    required: ['requestId', 'timestamp'],
    properties: {
      requestId: { type: ['string', 'null'] },
      timestamp: { type: 'string', format: 'date-time' },
      release: { type: ['string', 'null'], description: 'The running commit.' },
      page: { $ref: '#/components/schemas/Page' },
    },
  },
  EnvelopeError: {
    type: 'object',
    required: ['data', 'meta', 'error'],
    properties: {
      data: { type: 'null' },
      meta: { $ref: '#/components/schemas/Meta' },
      error: {
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: { type: 'string' }, message: { type: ['string', 'null'] }, remedy: { type: 'string' },
          details: { type: 'array', items: { type: 'object' } }, requestId: { type: ['string', 'null'] }, eventId: { type: 'string' },
        },
        additionalProperties: true,
      },
    },
  },
  Job: {
    type: 'object',
    required: ['jobId', 'type', 'status', 'createdAt'],
    properties: {
      jobId: { type: 'string' },
      type: { type: 'string' },
      status: { type: 'string', enum: ['queued', 'running', 'succeeded', 'failed'] },
      attempts: { type: 'integer' },
      maxAttempts: { type: 'integer' },
      result: { type: ['object', 'null'], additionalProperties: true },
      error: { type: ['object', 'null'], properties: { message: { type: 'string' }, kind: { type: 'string' } }, additionalProperties: true },
      artifact: { type: ['object', 'null'], properties: { contentType: { type: 'string' }, filename: { type: 'string' }, bytes: { type: 'integer' }, url: { type: 'string' } } },
      requestId: { type: ['string', 'null'] },
      createdAt: { type: 'string', format: 'date-time' },
      startedAt: { type: ['string', 'null'], format: 'date-time' },
      finishedAt: { type: ['string', 'null'], format: 'date-time' },
    },
  },
};

const PARAMETERS = {
  limit: { name: 'limit', in: 'query', description: `Ask for a page of at most this many items (1–${MAX_LIMIT}; ${DEFAULT_LIMIT} when only cursor is given). Without it the whole list is answered.`, schema: { type: 'integer', minimum: 1, maximum: MAX_LIMIT } },
  cursor: { name: 'cursor', in: 'query', description: 'The `page.nextCursor` of the previous page. Opaque.', schema: { type: 'string' } },
  envelope: { name: 'envelope', in: 'query', description: 'Set to 1 to receive the envelope; the same as `Accept: ' + VND + '`.', schema: { type: 'string', enum: ['1'] } },
};

const HEADERS = {
  XRequestID: { description: 'The correlation id for this request; sent back when the caller supplied one.', schema: { type: 'string' } },
  XApiEnvelope: { description: '`legacy` for the shape the route has always answered, `v1` for the envelope.', schema: { type: 'string', enum: ['legacy', 'v1'] } },
  XKeyScopes: { description: 'The scopes the key holds, or `unscoped` for a key issued before scopes existed.', schema: { type: 'string' } },
};

const envelopeOf = data => ({
  type: 'object', required: ['data', 'meta', 'error'],
  properties: { data, meta: { $ref: '#/components/schemas/Meta' }, error: { type: 'null' } },
});

const isJoi = s => s && typeof s.describe === 'function' && typeof s.validate === 'function';
const toSchema = s => (isJoi(s) ? convert(s) : (s && typeof s === 'object' ? s : { type: 'object' }));

function operationId(method, path, taken) {
  const words = path.replace(/^\/v1\/?/, '').split('/').filter(Boolean).map(seg => {
    if (seg.startsWith(':')) return 'By' + seg.slice(1).replace(/^\w/, c => c.toUpperCase());
    return seg.split(/[-.]/).map((w, i) => (i === 0 ? w : w.replace(/^\w/, c => c.toUpperCase()))).join('');
  });
  let id = method.toLowerCase() + (words.length ? words.map(w => w.replace(/^\w/, c => c.toUpperCase())).join('') : 'Root');
  id = id.replace(/[^A-Za-z0-9]/g, '');
  let candidate = id, n = 2;
  while (taken.has(candidate)) candidate = `${id}${n++}`;
  taken.add(candidate);
  return candidate;
}

function tagOf(path) {
  if (path === '/health') return 'health';
  const seg = path.replace(/^\/v1\/?/, '').split('/')[0];
  return seg ? seg.replace(/^:/, '') : 'api';
}

/** Every route Express registered, with the markers in its chain. */
function collect(app) {
  const rows = [];
  const walk = (stack, prefix) => {
    for (const layer of stack) {
      if (layer.route) {
        const full = `${prefix}${layer.route.path}`.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1') || '/';
        const chain = layer.route.stack;
        const authNames = chain.map(l => l.name).filter(n => ['apiKeyAuth', 'auth', 'dualAuth'].includes(n));
        const validateLayer = chain.find(l => l.name === 'validate' && l.handle && l.handle.schema);
        const pagedLayer = chain.find(l => l.name === 'paged');
        const docLayer = chain.find(l => l.name === 'apiDoc');
        const cacheLayer = chain.find(l => l.name === 'referenceCache');
        for (const method of Object.keys(layer.route.methods)) {
          if (method === '_all') continue;
          rows.push({
            method: method.toUpperCase(), path: full, auth: authNames,
            validate: validateLayer ? validateLayer.handle.schema : null,
            paged: pagedLayer ? pagedLayer.handle.filters : null,
            hints: docLayer ? docLayer.handle.hints : {},
            cached: cacheLayer ? cacheLayer.handle.maxAge : null,
          });
        }
      } else if (layer.handle && layer.handle.stack) {
        walk(layer.handle.stack, `${prefix}${layerPath(layer)}`);
      }
    }
  };
  walk(app._router.stack, '');
  return rows.filter(r => r.path.startsWith('/v1') || r.path === '/health');
}

function parametersFor(row) {
  const params = [];
  const seen = new Set();
  const add = p => { const k = `${p.in}:${p.name}`; if (!seen.has(k)) { seen.add(k); params.push(p); } };
  const pathParamSchemas = row.validate && row.validate.params ? (toSchema(row.validate.params).properties || {}) : {};
  for (const m of row.path.matchAll(/:([A-Za-z0-9_]+)/g)) {
    add({ name: m[1], in: 'path', required: true, schema: pathParamSchemas[m[1]] || { type: 'string' } });
  }
  if (row.validate && row.validate.query) {
    const q = toSchema(row.validate.query);
    for (const [name, schema] of Object.entries(q.properties || {})) {
      add({ name, in: 'query', required: (q.required || []).includes(name), schema, ...(schema.description ? { description: schema.description } : {}) });
    }
  }
  for (const [name, spec] of Object.entries(row.hints.query || {})) {
    if (typeof spec === 'string') add({ name, in: 'query', description: spec, schema: { type: 'string' } });
    else add({ name, in: 'query', ...(spec.description ? { description: spec.description } : {}), schema: toSchema(spec.schema || spec) });
  }
  if (row.paged) {
    add({ $ref: '#/components/parameters/limit', in: 'query', name: 'limit' });
    add({ $ref: '#/components/parameters/cursor', in: 'query', name: 'cursor' });
    for (const f of row.paged) add({ name: f, in: 'query', description: `Filter by ${f}.`, schema: { type: 'string' } });
  }
  add({ $ref: '#/components/parameters/envelope', in: 'query', name: 'envelope' });
  return params.map(p => (p.$ref ? { $ref: p.$ref } : p));
}

const ERR_CONTENT = { 'application/json': { schema: { $ref: '#/components/schemas/Error' } }, [VND]: { schema: { $ref: '#/components/schemas/EnvelopeError' } } };
const RESPONSES = {
  BadRequest: { description: 'The request did not validate; `details` names the fields.', content: ERR_CONTENT },
  Unauthorized: { description: 'No credential, or one that is invalid, revoked or expired.', content: ERR_CONTENT },
  Forbidden: { description: 'The credential does not hold the scope this operation requires (`x-scope`); the body names the scope required and the scopes held.', content: ERR_CONTENT },
  RateLimited: { description: 'Rate limit reached for this key.', content: ERR_CONTENT },
  NotModified: { description: 'Not modified — the client\'s If-None-Match matched. Reference data; the operation says how long it may be cached.' },
  Default: { description: 'An error, in the shape every error takes.', content: ERR_CONTENT },
};

function responsesFor(row, dataSchema) {
  const okStatus = String(row.hints.status || (row.method === 'DELETE' && !row.hints.response ? 204 : '2XX'));
  const data = row.paged
    ? { allOf: [dataSchema, { type: 'object', properties: { page: { $ref: '#/components/schemas/Page' } } }] }
    : dataSchema;
  const headers = { 'X-Request-ID': { $ref: '#/components/headers/XRequestID' }, 'X-Api-Envelope': { $ref: '#/components/headers/XApiEnvelope' } };
  if (row.auth.length) headers['X-Key-Scopes'] = { $ref: '#/components/headers/XKeyScopes' };
  const ok = { description: row.hints.responseDescription || 'Success', headers };
  if (okStatus !== '204') {
    ok.content = { 'application/json': { schema: data }, [VND]: { schema: envelopeOf(data) } };
    for (const type of row.hints.produces || []) ok.content[type] = { schema: { type: 'string', format: 'binary' } };
  }
  /** @type {Record<string, any>} */
  const responses = { [okStatus]: ok };
  if (row.cached) responses['304'] = { $ref: '#/components/responses/NotModified' };
  if (row.validate || row.paged) responses['400'] = { $ref: '#/components/responses/BadRequest' };
  if (row.auth.length) {
    responses['401'] = { $ref: '#/components/responses/Unauthorized' };
    responses['403'] = { $ref: '#/components/responses/Forbidden' };
    responses['429'] = { $ref: '#/components/responses/RateLimited' };
  }
  responses.default = { $ref: '#/components/responses/Default' };
  return responses;
}

/** The OpenAPI 3.1 document for the running application. */
function buildSpec(app) {
  const rows = collect(app);
  const taken = new Set();
  const paths = {};
  const tags = new Set();
  for (const row of rows.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))) {
    const scope = requiredScopeFor(row.method, row.path).scope;
    row.scope = scope;
    const oaPath = row.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
    const tag = tagOf(row.path);
    tags.add(tag);
    const dataSchema = row.hints.response ? toSchema(row.hints.response) : { type: 'object', additionalProperties: true };
    const op = {
      operationId: operationId(row.method, row.path, taken),
      tags: [tag],
      summary: row.hints.summary || `${row.method} ${row.path}`,
      description: [row.hints.description, row.auth.length ? `Requires the \`${scope}\` scope.` : 'No credential required.', row.cached ? `Reference data: cacheable for ${row.cached}s, answers 304 to a matching If-None-Match.` : null].filter(Boolean).join(' '),
      'x-scope': scope,
      parameters: parametersFor(row),
    };
    if (row.paged) op['x-paged'] = true;
    const bodySchema = (row.validate && row.validate.body) || row.hints.body;
    if (bodySchema && ['POST', 'PUT', 'PATCH'].includes(row.method)) {
      op.requestBody = { required: true, content: { 'application/json': { schema: toSchema(bodySchema) } } };
    }
    op.responses = responsesFor(row, dataSchema);
    if (row.auth.length) {
      op.security = [];
      if (row.auth.includes('apiKeyAuth') || row.auth.includes('dualAuth')) op.security.push({ ApiKeyAuth: [] });
      if (row.auth.includes('auth') || row.auth.includes('dualAuth')) op.security.push({ BearerAuth: [] });
    } else {
      op.security = [];
    }
    paths[oaPath] = paths[oaPath] || {};
    paths[oaPath][row.method.toLowerCase()] = op;
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'CarbonIQ FinTech API',
      version: config.version,
      summary: 'The bank-facing layer for construction carbon intelligence: PCAF Part C insurance-associated emissions, the capital book, the GCF pipeline, taxonomy alignment and covenants.',
      description: [
        'Generated from the running router by `npm run docs:openapi`; `tests/api-contract.test.js` fails the build when it drifts from the code.',
        '',
        '**Authentication.** Send the key in `X-API-Key`. Name the person acting in `X-Actor`. Every operation states the scope it requires (`x-scope`); a refusal is `403 SCOPE_REQUIRED` naming the scope required and the scopes held.',
        '',
        `**Two shapes.** \`application/json\` is the shape each route has always answered. \`${VND}\` is the same body inside \`{ data, meta, error }\`; ask for it with \`Accept\`, \`X-Envelope: 1\` or \`?envelope=1\`. Every response says which in \`X-Api-Envelope\`. The legacy shape stays for the whole of v1; the envelope becomes the default in v2 — see docs/API-CONTRACT.md.`,
        '',
        '**Paging.** A list answers whole until asked for a page with `limit`; a page carries `page.nextCursor` to pass back as `cursor`.',
        '',
        '**Errors.** One shape, always: `{ error, message, remedy?, details?, requestId }`. Quote `requestId` when asking for help; it finds the log line, the audit row and the error report.',
      ].join('\n'),
      contact: { name: 'Datum Solutions', url: SITE },
      'x-envelope-media-type': VND,
    },
    servers: [{ url: SITE, description: 'Production' }, { url: 'http://localhost:3001', description: 'Local development' }],
    tags: [...tags].sort().map(name => ({ name })),
    paths,
    components: { securitySchemes: {
      ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key', description: 'An organisation key issued with `npm run key:create`. Add `X-Actor` to name the person.' },
      BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'A signed-in user of the dashboard.' },
    }, schemas: { ...SCHEMAS, ...registeredComponents() }, responses: RESPONSES, parameters: PARAMETERS, headers: HEADERS },
  };
}

module.exports = { buildSpec, collect, SCHEMAS, RESPONSES, envelopeOf };
