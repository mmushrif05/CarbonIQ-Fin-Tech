/**
 * Error reporting must be inert unless configured, and must never carry a
 * credential when it is.
 *
 * The second of those is the one worth a test: this application handles an
 * insurer's book, and an error report that quietly forwarded the API key
 * header would turn the safety net into the leak. The header list is
 * asserted against the scrubber's actual behaviour rather than by reading
 * the constant back.
 */

'use strict';

const PATH = '../services/observability';

/** A fresh module registry per case — init() is deliberately once-only. */
function freshWith(env) {
  jest.resetModules();
  const saved = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; process.env[k] = env[k]; }
  if (env.SENTRY_DSN === undefined) delete process.env.SENTRY_DSN;
  const mod = require(PATH);
  return { mod, restore: () => { for (const k of Object.keys(saved)) {
    if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  } } };
}

describe('Error reporting is off unless a DSN is configured', () => {
  test('init() returns false and nothing is enabled without SENTRY_DSN', () => {
    const { mod, restore } = freshWith({ SENTRY_DSN: undefined });
    expect(mod.init()).toBe(false);
    expect(mod.isEnabled()).toBe(false);
    restore();
  });

  test('captureError is a no-op when not initialised', () => {
    const { mod, restore } = freshWith({ SENTRY_DSN: undefined });
    expect(mod.captureError(new Error('boom'), { method: 'GET', path: '/x' }, 500)).toBeNull();
    restore();
  });

  test('the application still starts with no DSN', () => {
    const { mod, restore } = freshWith({ SENTRY_DSN: undefined });
    expect(() => mod.init()).not.toThrow();
    restore();
  });
});

describe('Only what the application did not choose is an incident', () => {
  const { init: _i, isIncident } = require(PATH);

  test('a 5xx is an incident', () => {
    expect(isIncident(new Error('unexpected'), 500)).toBe(true);
    expect(isIncident(new Error('upstream'), 502)).toBe(true);
  });

  test('a deliberate 4xx answer is not', () => {
    expect(isIncident(new Error('bad key'), 401)).toBe(false);
    expect(isIncident(new Error('not found'), 404)).toBe(false);
    expect(isIncident(new Error('rate limited'), 429)).toBe(false);
  });

  test('a validation failure is never an incident, whatever the status', () => {
    const joi = Object.assign(new Error('invalid'), { isJoi: true });
    expect(isIncident(joi, 400)).toBe(false);
    expect(isIncident(joi, 500)).toBe(false);
  });
});

describe('No credential leaves the process in an error report', () => {
  /* The scrubber is exercised through init(), with the SDK stubbed so the
     configured beforeSend can be run against a representative event. */
  test('beforeSend strips every credential-bearing header and the body', () => {
    jest.resetModules();
    let captured = null;
    jest.doMock('@sentry/node', () => ({
      init: opts => { captured = opts; },
      withScope: fn => fn({ setTag() {}, setContext() {} }),
      captureException: () => 'evt_1'
    }));

    process.env.SENTRY_DSN = 'https://public@o1.ingest.us.sentry.io/2';
    const mod = require(PATH);
    expect(mod.init()).toBe(true);
    expect(captured).toBeTruthy();

    // Errors only, and never personal data.
    expect(captured.tracesSampleRate).toBe(0);
    expect(captured.sendDefaultPii).toBe(false);

    const event = {
      request: {
        headers: {
          'x-api-key': 'ck_test_shouldneverleave',
          'Authorization': 'Bearer shouldneverleave',
          'Cookie': 'session=shouldneverleave',
          'content-type': 'application/json'
        },
        data: { premium: 24448.16, insured: 'a real client name' }
      }
    };
    const out = captured.beforeSend(event);
    const serialised = JSON.stringify(out);

    expect(serialised).not.toContain('shouldneverleave');
    expect(serialised).not.toContain('a real client name');
    expect(out.request.headers['content-type']).toBe('application/json');
    expect(out.request.data).toBeUndefined();

    delete process.env.SENTRY_DSN;
    jest.dontMock('@sentry/node');
    jest.resetModules();
  });

  test('a scrubber that throws still returns the event rather than dropping it', () => {
    jest.resetModules();
    let captured = null;
    jest.doMock('@sentry/node', () => ({ init: o => { captured = o; }, withScope: f => f({ setTag(){}, setContext(){} }), captureException: () => 'e' }));
    process.env.SENTRY_DSN = 'https://public@o1.ingest.us.sentry.io/2';
    require(PATH).init();

    const hostile = { request: { get headers() { throw new Error('nope'); } } };
    expect(() => captured.beforeSend(hostile)).not.toThrow();
    expect(captured.beforeSend(hostile)).toBe(hostile);

    delete process.env.SENTRY_DSN;
    jest.dontMock('@sentry/node');
    jest.resetModules();
  });
});
