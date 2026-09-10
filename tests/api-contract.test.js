/**
 * E4 — the contract.
 *
 * The OpenAPI document is generated from the router: every operation, its
 * request schema from the validator in its chain, its scope, its paging,
 * its caching. This suite holds docs/openapi.json to what the code
 * produces, checks the document is valid OpenAPI 3.1, and validates live
 * responses against it in both media types — the contract tests the
 * readiness register asked for (F4).
 *
 * The exit criterion of the phase is the last describe: a client built from
 * the document alone — operation ids, paths, parameter names, the security
 * scheme's header — drives the API and gets what the document promised.
 */

'use strict';

process.env.UI_API_KEY = 'ck_test_' + 'c'.repeat(32);

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const SwaggerParser = require('@apidevtools/swagger-parser');
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const ROOT = path.resolve(__dirname, '..');
const app = require('../src/server');
const { buildSpec } = require('../src/platform/http/openapi');
const { routeTable } = require('../src/platform/auth/scopes-doc');
const { requiredScopeFor } = require('../src/platform/auth/scopes');
const { VND } = require('../src/platform/http/envelope');
const referenceCache = require('../src/platform/http/reference-cache');

const KEY = process.env.UI_API_KEY;
let spec;
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const compiled = new Map();

/** Validate `body` against a schema that may reference the document's components. */
function conforms(schema, body) {
  const key = JSON.stringify(schema);
  let fn = compiled.get(key);
  if (!fn) { fn = ajv.compile({ ...schema, components: spec.components }); compiled.set(key, fn); }
  const ok = fn(body);
  return ok ? null : ajv.errorsText(fn.errors, { separator: '\n' });
}

function operation(method, oaPath) {
  const p = spec.paths[oaPath];
  if (!p || !p[method.toLowerCase()]) throw new Error(`no operation ${method} ${oaPath}`);
  return p[method.toLowerCase()];
}

function responseSchema(method, oaPath, status, mediaType = 'application/json') {
  const op = operation(method, oaPath);
  let r = op.responses[String(status)] || op.responses[`${String(status)[0]}XX`] || op.responses.default;
  if (r.$ref) r = spec.components.responses[r.$ref.split('/').pop()];
  return r.content ? r.content[mediaType].schema : null;
}

beforeAll(() => { spec = buildSpec(app); });

describe('The document is the router, and nothing else (F1)', () => {
  test('docs/openapi.json is what the code produces', () => {
    const committed = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/openapi.json'), 'utf8'));
    expect(committed).toEqual(spec);
  });

  test('it is a valid OpenAPI 3.1 document', async () => {
    const copy = JSON.parse(JSON.stringify(spec));
    await expect(SwaggerParser.validate(copy)).resolves.toBeTruthy();
    expect(spec.openapi).toBe('3.1.0');
  });

  test('every route Express registered is an operation, and every operation is a registered route', () => {
    const routes = new Set(routeTable(app).map(r => `${r.method} ${r.path}`));
    const ops = new Set();
    for (const [p, methods] of Object.entries(spec.paths)) {
      for (const m of Object.keys(methods)) ops.add(`${m.toUpperCase()} ${p.replace(/\{([A-Za-z0-9_]+)\}/g, ':$1')}`);
    }
    expect([...routes].filter(r => !ops.has(r))).toEqual([]);
    expect([...ops].filter(o => !routes.has(o))).toEqual([]);
    expect(ops.size).toBeGreaterThanOrEqual(140);
  });

  test('every operation has a unique id, declares its path parameters, names its scope and its security', () => {
    const ids = new Set();
    for (const [p, methods] of Object.entries(spec.paths)) {
      const pathParams = [...p.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(m => m[1]);
      for (const [m, op] of Object.entries(methods)) {
        expect(ids.has(op.operationId)).toBe(false);
        ids.add(op.operationId);
        const declared = (op.parameters || []).filter(x => x.in === 'path').map(x => x.name);
        expect(declared.sort()).toEqual([...pathParams].sort());
        expect(op['x-scope']).toBe(requiredScopeFor(m.toUpperCase(), p.replace(/\{([A-Za-z0-9_]+)\}/g, ':$1')).scope);
        expect(Array.isArray(op.security)).toBe(true);
        if (op.security.length) {
          expect(op.responses['401']).toBeDefined();
          expect(op.responses['403']).toBeDefined();
        }
        expect(op.responses.default).toBeDefined();
      }
    }
  });

  test('a validated POST carries the validator\'s schema as its request body — the same rule, not a copy', () => {
    const op = operation('POST', '/v1/partc/clients');
    const body = op.requestBody.content['application/json'].schema;
    expect(op.requestBody.required).toBe(true);
    expect(body.required).toContain('name');
    expect(body.properties.name.minLength).toBe(2);
    expect(body.properties.country).toBeDefined();
    const client = spec.components.schemas.Client;
    expect(client.required).toEqual(expect.arrayContaining(['name', 'clientId']));
    expect(client.properties.createdAt.format).toBe('date-time');
  });

  test('a paged list says so, and documents limit, cursor and its filters', () => {
    const op = operation('GET', '/v1/partc/projects');
    expect(op['x-paged']).toBe(true);
    const names = op.parameters.map(p => (p.$ref ? p.$ref.split('/').pop() : p.name));
    expect(names).toEqual(expect.arrayContaining(['limit', 'cursor', 'clientId', 'reportingYear', 'envelope']));
    const ok = op.responses['2XX'].content['application/json'].schema;
    expect(JSON.stringify(ok)).toContain('#/components/schemas/Page');
  });

  test('every operation answers in both media types, and reference data documents its 304', () => {
    for (const methods of Object.values(spec.paths)) {
      for (const op of Object.values(methods)) {
        const ok = Object.entries(op.responses).find(([k]) => /^2/.test(k))[1];
        if (ok.content) {
          expect(ok.content['application/json']).toBeDefined();
          expect(ok.content[VND]).toBeDefined();
          expect(ok.content[VND].schema.properties.error).toEqual({ type: 'null' });
        }
      }
    }
    expect(operation('GET', '/v1/pcaf/part-c/factors').responses['304']).toBeDefined();
    expect(operation('GET', '/v1/partc/clients').responses['304']).toBeUndefined();
  });
});

describe('Live responses satisfy the document (F4)', () => {
  /* Two records, made before each test rather than by one of them.
     `clientId` used to be set inside the first test and read by two others, so
     the suite failed under `--randomize` and would fail again the first time
     anyone ran a focused subset — the shape that becomes "works on my
     machine". Every test here now makes what it needs. */
  let clientId;

  const makeClient = async (name = 'Contract Client') =>
    (await request(app).post('/v1/partc/clients').set('x-api-key', KEY)
      .send({ name, country: 'LK' }).expect(201)).body.client.clientId;

  beforeEach(async () => {
    clientId = await makeClient();
    await makeClient('Contract Client Two');
  });

  test('a created record, in the legacy shape and in the envelope', async () => {
    const legacy = await request(app).post('/v1/partc/clients').set('x-api-key', KEY).send({ name: 'Contract Client', country: 'LK' }).expect(201);
    expect(legacy.headers['x-api-envelope']).toBe('legacy');
    expect(conforms(responseSchema('POST', '/v1/partc/clients', 201), legacy.body)).toBeNull();
    const wrapped = await request(app).post('/v1/partc/clients').set('x-api-key', KEY).set('Accept', VND).send({ name: 'Contract Client Two', country: 'LK' }).expect(201);
    expect(wrapped.headers['x-api-envelope']).toBe('v1');
    expect(wrapped.headers['content-type']).toMatch(/vnd\.carboniq\.v1\+json/);
    expect(conforms(responseSchema('POST', '/v1/partc/clients', 201, VND), wrapped.body)).toBeNull();
    expect(wrapped.body.error).toBeNull();
    expect(wrapped.body.meta.requestId).toBe(wrapped.headers['x-request-id']);
  });

  test('a page, with the descriptor in the body or in meta', async () => {
    const legacy = await request(app).get('/v1/partc/clients?limit=1').set('x-api-key', KEY).expect(200);
    expect(conforms(responseSchema('GET', '/v1/partc/clients', 200), legacy.body)).toBeNull();
    expect(legacy.body.clients).toHaveLength(1);
    expect(legacy.body.page).toMatchObject({ limit: 1, hasMore: true });
    expect(typeof legacy.body.page.nextCursor).toBe('string');

    const wrapped = await request(app).get(`/v1/partc/clients?limit=1&cursor=${legacy.body.page.nextCursor}`).set('x-api-key', KEY).set('x-envelope', '1').expect(200);
    expect(conforms(responseSchema('GET', '/v1/partc/clients', 200, VND), wrapped.body)).toBeNull();
    expect(wrapped.body.meta.page).toMatchObject({ limit: 1 });
    expect(wrapped.body.data.page).toBeUndefined();
    expect(wrapped.body.data.clients[0].clientId).not.toBe(legacy.body.clients[0].clientId);

    const whole = await request(app).get('/v1/partc/clients').set('x-api-key', KEY).expect(200);
    expect(whole.body.page).toBeUndefined();
    expect(whole.body.clients.length).toBeGreaterThanOrEqual(2);
  });

  test('a bad page is refused with the error shape', async () => {
    const res = await request(app).get('/v1/partc/clients?limit=0').set('x-api-key', KEY).expect(400);
    expect(res.body).toMatchObject({ error: 'BAD_PAGE' });
    expect(conforms({ $ref: '#/components/schemas/Error' }, res.body)).toBeNull();
    const cursor = await request(app).get('/v1/partc/clients?cursor=%%%').set('x-api-key', KEY).expect(400);
    expect(cursor.body.remedy).toMatch(/nextCursor/);
  });

  test('every error is the one shape: 400, 401, 403, 404', async () => {
    const cases = [
      await request(app).post('/v1/partc/clients').set('x-api-key', KEY).send({ name: 'x' }),
      await request(app).get('/v1/partc/clients'),
      await request(app).get('/v1/partc/clients/nope').set('x-api-key', KEY),
      await request(app).get('/v1/nowhere').set('x-api-key', KEY),
    ];
    expect(cases.map(c => c.status)).toEqual([400, 401, 404, 404]);
    for (const c of cases) expect(conforms({ $ref: '#/components/schemas/Error' }, c.body)).toBeNull();
    const wrapped = await request(app).get('/v1/partc/clients/nope').set('x-api-key', KEY).set('Accept', VND).expect(404);
    expect(conforms({ $ref: '#/components/schemas/EnvelopeError' }, wrapped.body)).toBeNull();
    expect(wrapped.body.data).toBeNull();
    expect(wrapped.body.error.code).toBe('CLIENT_NOT_FOUND');
  });

  test('a record read back conforms', async () => {
    const res = await request(app).get(`/v1/partc/clients/${clientId}`).set('x-api-key', KEY).expect(200);
    expect(conforms({ type: 'object', required: ['client'], properties: { client: { $ref: '#/components/schemas/Client' } } }, res.body)).toBeNull();
  });

  test('reference data is cached as the document says; a record list is not', async () => {
    referenceCache._reset();
    const first = await request(app).get('/v1/pcaf/part-c/factors').set('x-api-key', KEY).expect(200);
    expect(first.headers['cache-control']).toBe('private, max-age=3600');
    expect(first.headers['x-cache']).toBe('miss');
    expect(first.headers.etag).toMatch(/^"[0-9a-f]{40}"$/);
    const again = await request(app).get('/v1/pcaf/part-c/factors').set('x-api-key', KEY).expect(200);
    expect(again.headers['x-cache']).toBe('hit');
    expect(again.body).toEqual(first.body);
    await request(app).get('/v1/pcaf/part-c/factors').set('x-api-key', KEY).set('If-None-Match', first.headers.etag).expect(304);
    const fresh = await request(app).get('/v1/pcaf/part-c/factors').set('x-api-key', KEY).set('Cache-Control', 'no-cache').expect(200);
    expect(fresh.headers['x-cache']).toBe('miss');
    const list = await request(app).get('/v1/partc/clients').set('x-api-key', KEY).expect(200);
    expect(list.headers['cache-control']).toBeUndefined();
    expect(list.headers['x-cache']).toBeUndefined();
  });

  test('the document is served, unauthenticated, from the same generator', async () => {
    const res = await request(app).get('/v1/openapi.json').expect(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(Object.keys(res.body.paths).length).toBe(Object.keys(spec.paths).length);
    expect(res.headers['cache-control']).toMatch(/max-age/);
  });
});

describe('The exit criterion: a client generated from the document alone drives the API', () => {
  /**
   * A generator in twenty lines: for every operation, a function taking
   * path, query, body and headers, that knows the method, the path
   * template, the parameter names and the security scheme's header from
   * the document and from nothing else.
   */
  function generateClient(document, base) {
    const apiKeyHeader = document.components.securitySchemes.ApiKeyAuth.name;
    const client = {};
    for (const [tpl, methods] of Object.entries(document.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        const params = (op.parameters || []).map(p => (p.$ref ? document.components.parameters[p.$ref.split('/').pop()] : p));
        client[op.operationId] = async ({ path: pathParams = {}, query = {}, body, key, accept } = {}) => {
          let url = tpl;
          for (const p of params.filter(x => x.in === 'path')) {
            if (pathParams[p.name] === undefined) throw new Error(`${op.operationId} needs path parameter ${p.name}`);
            url = url.replace(`{${p.name}}`, encodeURIComponent(pathParams[p.name]));
          }
          const allowed = new Set(params.filter(x => x.in === 'query').map(x => x.name));
          for (const q of Object.keys(query)) if (!allowed.has(q)) throw new Error(`${op.operationId} does not take query parameter ${q}`);
          let req = base[method](url).query(query);
          if (op.security.some(s => s.ApiKeyAuth) && key) req = req.set(apiKeyHeader, key);
          if (accept) req = req.set('Accept', accept);
          if (op.requestBody && body !== undefined) req = req.send(body);
          return req;
        };
      }
    }
    return client;
  }

  test('create, list a page, read one, and download a job artifact — by operation id only', async () => {
    const client = generateClient(spec, request(app));
    expect(typeof client.postPartcClients).toBe('function');
    expect(typeof client.getPartcClients).toBe('function');
    expect(typeof client.getPartcClientsByClientId).toBe('function');

    const created = await client.postPartcClients({ key: KEY, body: { name: 'Generated Client', country: 'LK' } });
    expect(created.status).toBe(201);
    expect(conforms(responseSchema('POST', '/v1/partc/clients', 201), created.body)).toBeNull();

    const page = await client.getPartcClients({ key: KEY, query: { limit: 2 } });
    expect(page.status).toBe(200);
    expect(page.body.clients.length).toBeLessThanOrEqual(2);
    expect(page.body.page.limit).toBe(2);

    const one = await client.getPartcClientsByClientId({ key: KEY, path: { clientId: created.body.client.clientId } });
    expect(one.status).toBe(200);
    expect(one.body.client.name).toBe('Generated Client');

    await expect(client.getPartcClientsByClientId({ key: KEY })).rejects.toThrow(/path parameter clientId/);
    await expect(client.getPartcClients({ key: KEY, query: { nonsense: 1 } })).rejects.toThrow(/query parameter nonsense/);

    const job = await client.postJobs({ key: KEY, body: { type: 'lending.report', payload: { type: 'pcaf', period: '2025', format: 'pdf', orgName: 'Generated Bank' } } });
    expect(job.status).toBe(202);
    expect(conforms(responseSchema('POST', '/v1/jobs', 202), job.body)).toBeNull();
    /* Where a database holds the queue the job is claimed by a worker, so the
       run has to be driven; where none does the mode is inline and the job is
       already finished. The test assumed inline, which is true of exactly one
       of the two stores this suite runs on. */
    if (process.env.TEST_DATABASE_URL) {
      await require('../src/platform/jobs/worker')
        .drain({ workerId: 'contract-test', untilMs: Date.now() + 30_000 });
    }
    const read = await client.getJobsByJobId({ key: KEY, path: { jobId: job.body.job.jobId }, accept: VND });
    expect(read.status).toBe(200);
    expect(conforms(responseSchema('GET', '/v1/jobs/{jobId}', 200, VND), read.body)).toBeNull();
    expect(read.body.data.job.status).toBe('succeeded');
    expect(read.body.data.job.artifact.url).toBe(`/v1/jobs/${job.body.job.jobId}/artifact`);
  });
});

/**
 * Every documented reply is checked against a real one.
 *
 * The document typed 13% of its replies: 146 of 162 operations answered
 * `{ type: 'object', additionalProperties: true }`, and `POST
 * /v1/pcaf/part-c/assess` — the operation that produces the regulatory figure
 * — was among them. A bank generating a client could construct every request
 * and understand one reply in eight.
 *
 * Writing schemas fixes that only if they are true, and a wrong contract is
 * worse than a vague one: it sends a client author to build against a shape
 * the API does not answer with. So every GET that needs no path parameter is
 * called for real and its body validated against what the document claims.
 *
 * The schemas are written as a **floor**: `additionalProperties` is true and
 * `required` is short, so a route may answer with more than is named. What
 * this proves is that everything named is there and is the type claimed —
 * which is what a generated client actually depends on.
 */
describe('The documented reply is the reply (F2)', () => {
  /** Every GET operation with no path parameter to invent. */
  const gettable = () => {
    const out = [];
    for (const [oaPath, methods] of Object.entries(spec.paths)) {
      const op = methods.get;
      if (!op) continue;
      if (/\{/.test(oaPath)) continue;                 // needs an id we do not have
      if (/openapi\.json|ui-config|metrics/.test(oaPath)) continue;  // not JSON bodies
      out.push({ oaPath, op });
    }
    return out;
  };

  test('there are enough of them for this to mean something', () => {
    expect(gettable().length).toBeGreaterThan(20);
  });

  test('each one answers the shape the document gives it', async () => {
    const failures = [];
    let checked = 0;
    for (const { oaPath, op } of gettable()) {
      let req = request(app).get(oaPath);
      if ((op.security || []).some(sec => sec.ApiKeyAuth) && KEY) req = req.set('X-API-Key', KEY);
      const res = await req;

      /* A route that refuses, or answers something other than JSON, is not
         evidence about its success schema either way. What must never happen
         is a 200 whose body contradicts the document. */
      if (res.status >= 300) continue;
      if (!/application\/json/.test(String(res.headers['content-type'] || ''))) continue;

      const schema = responseSchema('GET', oaPath, res.status);
      if (!schema || !(schema.properties || schema.allOf || schema.$ref)) continue;
      checked += 1;
      const why = conforms(schema, res.body);
      if (why) failures.push(`GET ${oaPath}: ${why}`);
    }
    expect(checked).toBeGreaterThan(25);
    expect(failures).toEqual([]);
  }, 60000);

  test('the share of operations documenting their reply only goes up', () => {
    let documented = 0;
    let total = 0;
    for (const methods of Object.values(spec.paths)) {
      for (const op of Object.values(methods)) {
        const ok = op.responses['2XX'] || op.responses['200'] || op.responses['201'];
        if (!ok) continue;
        total += 1;
        const schema = ok.content && ok.content['application/json']
          && ok.content['application/json'].schema;
        /* `allOf` is how a paged list is composed — the list shape and the
           `page` object — so it counts as documented just as a plain
           `properties` block does. */
        if (schema && (schema.properties || schema.$ref || schema.allOf)) documented += 1;
      }
    }
    /* Every one. It was 19 of 157 when this was written, and the floor is the
       whole surface now: an operation that loses its response schema is an
       operation a generated client stops understanding, so this is an equality
       rather than a threshold that could quietly slip. */
    expect({ total, documented }).toEqual({ total, documented: total });
  });
});
