'use strict';

/**
 * The Netlify function, driven as Lambda drives it.
 *
 * Every unit test passed while the live site answered 503 on every route.
 * `config.validate()` had a new check that measured the whole of process.env
 * inside the running function — the Lambda runtime's own credentials and
 * paths included, which do not count against the ceiling it was measuring —
 * and the adapter treated the finding as a refusal. No test loaded the
 * adapter under the environment a function actually has, so nothing could
 * have seen it. This one does.
 */

const RUNTIME = {
  NETLIFY: 'true',
  AWS_LAMBDA_FUNCTION_NAME: 'fintech-api',
  AWS_ACCESS_KEY_ID: 'A'.repeat(20),
  AWS_SECRET_ACCESS_KEY: 'S'.repeat(40),
  AWS_SESSION_TOKEN: 'T'.repeat(920),
  AWS_LAMBDA_LOG_STREAM_NAME: '2026/09/10/[$LATEST]' + 'f'.repeat(32),
  _X_AMZN_TRACE_ID: 'Root=1-' + 'a'.repeat(50),
  _HANDLER: 'fintech-api.handler',
  LAMBDA_TASK_ROOT: '/var/task',
  LAMBDA_RUNTIME_DIR: '/var/runtime',
  LD_LIBRARY_PATH: '/var/lang/lib:/lib64:/usr/lib64:/var/runtime:/var/runtime/lib:/var/task:/var/task/lib:/opt/lib',
  NODE_PATH: '/opt/nodejs/node22/node_modules:/opt/nodejs/node_modules:/var/runtime/node_modules:/var/runtime:/var/task',
};

/** Load the adapter fresh under these variables; put every one back after. */
function loadFunction(vars) {
  const restore = {};
  for (const k of Object.keys(vars)) restore[k] = process.env[k];
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  let fn;
  jest.isolateModules(() => { fn = require('../netlify/functions/fintech-api'); });
  const release = () => {
    for (const [k, v] of Object.entries(restore)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  };
  return { fn, release };
}

function invoke(fn, path, httpMethod = 'GET') {
  return fn.handler(
    { path, httpMethod, headers: { host: 'carboniqfintech.netlify.app' }, multiValueHeaders: {}, body: null, isBase64Encoded: false, queryStringParameters: null },
    { getRemainingTimeInMillis: () => 20000 }
  );
}

describe('The function serves an ordinary Lambda environment', () => {
  let loaded;
  beforeAll(() => { loaded = loadFunction(RUNTIME); });
  afterAll(() => loaded.release());

  test('a sign-in-shaped request is not refused as an unsafe deployment', async () => {
    /* The regression. The sign-in screen's first request is this one. */
    const res = await invoke(loaded.fn, '/v1/auth/bootstrap');
    const body = JSON.parse(res.body);
    expect(body.error).not.toBe('DEPLOYMENT_UNSAFE');
    expect(res.statusCode).not.toBe(503);
  });

  test('the environment-size estimate is read from the operator\'s variables, not the runtime\'s', () => {
    const config = require('../src/platform/config');
    const size = config.environmentSize();
    for (const l of size.largest) {
      expect(l.variable).not.toMatch(/^(AWS_|_AWS_|_X_AMZN_|LAMBDA_|NODE_)/);
      expect(l.variable).not.toBe('_HANDLER');
    }
  });
});

describe('A warning is served past, and a problem refuses — and they are told apart on /health', () => {
  test('a crowded environment is a warning on /health and every route still answers', async () => {
    const { fn, release } = loadFunction({ ...RUNTIME, HUGE_BUT_HARMLESS: 'x'.repeat(4000) });
    try {
      const health = JSON.parse((await invoke(fn, '/health')).body);
      expect(health.configured.warnings).toContain('HUGE_BUT_HARMLESS');
      expect(health.configured.problems).toBeUndefined();

      const res = await invoke(fn, '/v1/auth/bootstrap');
      expect(JSON.parse(res.body).error).not.toBe('DEPLOYMENT_UNSAFE');
    } finally { release(); }
  });

  test('a real problem refuses every route but /health, naming the variable and never a value', async () => {
    /* The refusal path had no test of its own either. DEV_API_KEY on a
       production context is the clearest problem there is. */
    const { fn, release } = loadFunction({
      ...RUNTIME, NODE_ENV: 'production', DEV_API_KEY: 'a-bypass-value-that-must-not-print',
      STORAGE_BACKEND: undefined, API_KEY_SALT: 'b'.repeat(64), UI_API_KEY: undefined, SENTRY_DSN: undefined,
    });
    try {
      const res = await invoke(fn, '/v1/auth/bootstrap');
      expect(res.statusCode).toBe(503);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('DEPLOYMENT_UNSAFE');
      expect(body.variables.map(v => v.variable)).toContain('DEV_API_KEY');
      expect(res.body).not.toContain('a-bypass-value');

      const health = await invoke(fn, '/health');
      expect(health.statusCode).toBe(200);
      expect(JSON.parse(health.body).configured.problems).toContain('DEV_API_KEY');
    } finally { release(); }
  });
});
