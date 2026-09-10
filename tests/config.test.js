'use strict';

const config = require('../src/platform/config');

describe('Config', () => {
  it('loads default values in test environment', () => {
    expect(config.env).toBe('test');
    expect(config.port).toBe(3099);
    expect(config.version).toBeDefined();
  });

  it('has frozen config object', () => {
    /* In strict mode a write to a frozen object throws rather than being
       silently ignored, and the suite is strict now — which is the stronger
       assertion, because "the value did not change" is also true of a write
       that never happened. */
    expect(() => { config.env = 'production'; }).toThrow(TypeError);
    expect(config.env).toBe('test');
  });

  it('loads feature flags', () => {
    expect(typeof config.features.covenantEngine).toBe('boolean');
    expect(typeof config.features.portfolioAggregation).toBe('boolean');
    expect(typeof config.features.taxonomyChecker).toBe('boolean');
  });

  it('loads PCAF defaults', () => {
    expect(config.pcaf.version).toBe('3.0');
    expect(config.pcaf.defaultAttribution).toBe(1.0);
  });
});

describe("The function environment has a ceiling, and it is reported before a deploy hits it", () => {
  /*
   * Netlify Functions are AWS Lambdas, and Lambda refuses to create a function
   * whose configured environment exceeds 4 KB. There is no warning and no
   * partial application.
   *
   * This deployment hit it. One base64 service account was using roughly
   * two-thirds of the budget, and the deploy that added a 32-character token
   * was the one that failed — with a message naming a number and no variable.
   * Nothing in the codebase mentioned the limit, so four merges went undeployed
   * while the cause was hunted.
   *
   * Then the first version of this check took the site down. It summed the
   * whole of process.env inside the running function — the runtime's own
   * credentials and paths included, which Lambda does not count — passed the
   * warning line on an ordinary deployment, and was treated as a refusal.
   * Every route answered 503. The tests below hold both halves of the fix: the
   * runtime's own variables are outside the estimate, and the estimate is a
   * warning that `ok` never reads.
   */
  const config = require('../src/platform/config');

  /* What a Lambda actually carries before the operator has set anything: the
     shape of the runtime's own environment, values of the real lengths. */
  const RUNTIME = {
    AWS_ACCESS_KEY_ID: 'A'.repeat(20),
    AWS_SECRET_ACCESS_KEY: 'S'.repeat(40),
    AWS_SESSION_TOKEN: 'T'.repeat(920),
    AWS_LAMBDA_FUNCTION_NAME: 'fintech-api',
    AWS_LAMBDA_FUNCTION_VERSION: '$LATEST',
    AWS_LAMBDA_FUNCTION_MEMORY_SIZE: '1024',
    AWS_LAMBDA_LOG_GROUP_NAME: '/aws/lambda/fintech-api',
    AWS_LAMBDA_LOG_STREAM_NAME: '2026/09/10/[$LATEST]' + 'f'.repeat(32),
    AWS_LAMBDA_RUNTIME_API: '127.0.0.1:9001',
    AWS_LAMBDA_INITIALIZATION_TYPE: 'on-demand',
    AWS_REGION: 'us-east-2',
    AWS_DEFAULT_REGION: 'us-east-2',
    AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x',
    AWS_XRAY_DAEMON_ADDRESS: '169.254.79.129:2000',
    AWS_XRAY_CONTEXT_MISSING: 'LOG_ERROR',
    _AWS_XRAY_DAEMON_ADDRESS: '169.254.79.129',
    _AWS_XRAY_DAEMON_PORT: '2000',
    _X_AMZN_TRACE_ID: 'Root=1-' + 'a'.repeat(50),
    _HANDLER: 'fintech-api.handler',
    LAMBDA_TASK_ROOT: '/var/task',
    LAMBDA_RUNTIME_DIR: '/var/runtime',
    PATH: '/var/lang/bin:/usr/local/bin:/usr/bin/:/bin:/opt/bin',
    LD_LIBRARY_PATH: '/var/lang/lib:/lib64:/usr/lib64:/var/runtime:/var/runtime/lib:/var/task:/var/task/lib:/opt/lib',
    NODE_PATH: '/opt/nodejs/node22/node_modules:/opt/nodejs/node_modules:/var/runtime/node_modules:/var/runtime:/var/task',
    NODE_EXTRA_CA_CERTS: '/var/runtime/ca-cert.pem',
    LANG: 'en_US.UTF-8',
    TZ: ':UTC',
    PWD: '/var/task',
    SHLVL: '0',
  };

  /* An ordinary operator set, values of the real lengths. */
  const OPERATOR = {
    /* The suite's own environment carries a local bypass and pins the store
       to memory; both are problems on a production context, so both are
       lifted for the measurement. */
    DEV_API_KEY: undefined,
    STORAGE_BACKEND: undefined,
    NETLIFY: 'true',
    SITE_ID: 'e98911b9-5fce-4637-bed1-2716364c0209',
    SITE_NAME: 'carboniqfintech',
    URL: 'https://carboniqfintech.netlify.app',
    DEPLOY_ID: '6'.repeat(24),
    CONTEXT: 'production',
    COMMIT_REF: 'a'.repeat(40),
    BRANCH: 'main',
    NODE_ENV: 'production',
    API_KEY_SALT: 'b'.repeat(64),
    DATA_ENCRYPTION_KEY: 'c'.repeat(64),
    JWT_SECRET: 'd'.repeat(64),
    UI_API_KEY: 'ck_test_' + 'e'.repeat(32),
    ANTHROPIC_API_KEY: 'sk-ant-api03-' + 'f'.repeat(95),
    DATABASE_URL: 'postgresql://user:' + 'p'.repeat(20) + '@ep-name-123456.us-east-2.aws.neon.tech/neondb?sslmode=require',
    ADMIN_BOOTSTRAP_TOKEN: 'g'.repeat(32),
    FIREBASE_API_KEY: 'h'.repeat(39),
    FIREBASE_DATABASE_URL: 'https://carboniq-default-rtdb.firebaseio.com',
  };

  test('the size is measured across keys, values and a separator each', () => {
    const size = config.environmentSize({ AB: 'cd' });
    expect(size.bytes).toBe(5);
    expect(size.count).toBe(1);
    expect(size.limit).toBe(4096);
  });

  test('multi-byte values are counted in bytes, not characters', () => {
    /* A UTF-8 value costs Lambda its bytes. Counting characters would report a
       budget that is not the one being spent. */
    expect(config.environmentSize({ A: 'éé' }).bytes).toBe(1 + 4 + 1);
  });

  test('the largest are named, biggest first, so the answer is the first line', () => {
    const size = config.environmentSize({ SMALL: 'a', BIG: 'x'.repeat(3000), MID: 'y'.repeat(200) });
    expect(size.largest.map(l => l.variable)).toEqual(['BIG', 'MID', 'SMALL']);
    expect(size.largest[0].bytes).toBe(3004);
  });

  test("the runtime's own variables are outside the estimate, because Lambda does not count them", () => {
    /* The session token alone is close to a kilobyte. Counting it is how the
       first version reported a full budget on an empty one. */
    const size = config.environmentSize(RUNTIME);
    expect(size.bytes).toBe(0);
    expect(size.count).toBe(0);
    expect(size.excluded).toBe(Object.keys(RUNTIME).length);
  });

  test('an ordinary deployment on a Lambda produces no warning and no problem', () => {
    /* The regression. This is the environment the site was actually running
       in when every route answered 503. */
    const size = config.environmentSize({ ...RUNTIME, ...OPERATOR });
    expect(size.bytes).toBeLessThan(config.LAMBDA_ENV_WARN_BYTES);
    withEnv({ ...RUNTIME, ...OPERATOR }, () => {
      const { ok, problems, warnings } = config.validate({ env: 'production', environment: defined({ ...RUNTIME, ...OPERATOR }) });
      expect(problems.filter(p => /ceiling/.test(p.problem))).toEqual([]);
      expect(warnings.filter(p => /ceiling/.test(p.problem))).toEqual([]);
      expect(ok).toBe(true);
    });
  });

  test('a crowded environment is a named warning on a serverless runtime — and never a problem', () => {
    const crowded = { ...RUNTIME, ...OPERATOR, HUGE: 'x'.repeat(4000) };
    withEnv(crowded, () => {
      const { ok, problems, warnings } = config.validate({ env: 'production', environment: defined(crowded) });
      /* The estimate is a warning: the function serves past it and /health
         lists it. A refusal on an estimate is a site that is down on a guess. */
      expect(ok).toBe(true);
      expect(problems.find(p => p.variable === 'HUGE')).toBeUndefined();
      const found = warnings.find(p => p.variable === 'HUGE');
      expect(found).toBeTruthy();
      expect(found.problem).toMatch(/4096-byte ceiling/);
      expect(found.problem).toMatch(/may fail at function creation/);
      expect(found.remedy).toMatch(/Scope the largest to Builds only/);
    });
  });

  test('and it is silent where the limit does not apply', () => {
    /* A server this product runs on a machine has no such ceiling; warning
       there is noise, and a warning that fires on nothing is one people learn
       to skip. */
    withEnv({ NETLIFY: undefined, AWS_LAMBDA_FUNCTION_NAME: undefined, LAMBDA_TASK_ROOT: undefined, HUGE_LOCAL: 'x'.repeat(8000) }, () => {
      const { problems, warnings } = config.validate({ env: 'production' });
      expect([...problems, ...warnings].filter(p => /ceiling/.test(p.problem))).toEqual([]);
    });
  });

  test('no value can reach the report — names and byte counts only', () => {
    const leaky = { ...RUNTIME, ...OPERATOR, A_CREDENTIAL: `secret-${'z'.repeat(4000)}` };
    withEnv(leaky, () => {
      const { warnings } = config.validate({ env: 'production', environment: defined(leaky) });
      const printed = JSON.stringify(warnings);
      expect(printed).toContain('A_CREDENTIAL');
      /* The name, never the value. /health prints this block. */
      expect(printed).not.toContain('zzzz');
      expect(printed).not.toContain('secret-');
    });
  });

  test('a real problem still refuses, beside a warning', () => {
    /* The two lists are independent: a warning does not hide a problem and a
       problem does not promote a warning. */
    const both = { ...RUNTIME, ...OPERATOR, DEV_API_KEY: 'dev', HUGE: 'x'.repeat(4000) };
    withEnv(both, () => {
      const { ok, problems, warnings } = config.validate({ env: 'production', environment: defined(both) });
      expect(ok).toBe(false);
      expect(problems.map(p => p.variable)).toContain('DEV_API_KEY');
      expect(problems.map(p => p.variable)).not.toContain('HUGE');
      expect(warnings.map(p => p.variable)).toContain('HUGE');
    });
  });

  /** The same map with the deliberately-unset keys removed. */
  function defined(vars) {
    return Object.fromEntries(Object.entries(vars).filter(([, v]) => v !== undefined));
  }

  /** Set these variables for the call, then put every one back exactly. */
  function withEnv(vars, fn) {
    const restore = {};
    for (const k of Object.keys(vars)) restore[k] = process.env[k];
    try {
      for (const [k, v] of Object.entries(vars)) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
      fn();
    } finally {
      for (const [k, v] of Object.entries(restore)) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
    }
  }
});
