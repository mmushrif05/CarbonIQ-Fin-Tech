/**
 * How Firebase credentials are read, and why the shape matters.
 *
 * AWS Lambda caps ALL environment variables for a function at 4KB combined.
 * A base64 service-account blob costs about 3.1KB of that — roughly eighty
 * per cent of the budget — for seven fields nothing reads, with base64
 * inflating the secret by a third on top. admin.credential.cert() uses
 * exactly three values, and storing those three costs about 1.9KB.
 *
 * That is not a preference: exceeding the cap fails the DEPLOY, at upload,
 * after the build has gone green, with nothing wrong in the application to
 * explain it. So both forms are tested, and so is the saving.
 */

'use strict';

const crypto = require('crypto');

const { privateKey: PEM } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
});

const ACCOUNT = {
  type: 'service_account',
  project_id: 'carboniq-fintech',
  private_key_id: 'a'.repeat(40),
  private_key: PEM,
  client_email: 'firebase-adminsdk@carboniq-fintech.iam.gserviceaccount.com',
  client_id: '109463459238882809524',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/x',
  universe_domain: 'googleapis.com'
};

/**
 * Load the bridge with a given environment and capture what it logged.
 *
 * NODE_ENV is pinned to production because config/index.js loads .env
 * through dotenv otherwise — which quietly put a developer's own Firebase
 * credentials back after this helper deleted them, so the no-credentials
 * case passed or failed depending on whose machine it ran on.
 */
function withEnv(env, fn) {
  const saved = { ...process.env };
  for (const k of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY',
    'FIREBASE_SERVICE_ACCOUNT', 'FIREBASE_DATABASE_URL']) delete process.env[k];
  process.env.NODE_ENV = 'production';
  Object.assign(process.env, env);
  jest.resetModules();

  const logs = [];
  const spies = ['warn', 'error', 'log'].map(m =>
    jest.spyOn(console, m).mockImplementation((...a) => logs.push(a.join(' '))));
  try {
    return fn(logs);
  } finally {
    spies.forEach(s => s.mockRestore());
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, saved);
    jest.resetModules();
  }
}

/* The bridge does not export its reader, so it is exercised the way the
   application does: through the module, with firebase-admin stubbed so the
   credential handed to cert() can be inspected without a network call. */
function credentialFrom(env) {
  return withEnv(env, logs => {
    let passed = null;
    jest.doMock('firebase-admin', () => ({
      apps: [],
      credential: { cert: c => { passed = c; return { _cert: true }; } },
      initializeApp: () => { throw new Error('stop before connecting'); },
      database: () => ({})
    }));
    require('../bridge/firebase').initFirebase();
    jest.dontMock('firebase-admin');
    return { passed, logs };
  });
}

describe('The split credential is preferred, and is what cert() receives', () => {
  const SPLIT = {
    FIREBASE_PROJECT_ID: ACCOUNT.project_id,
    FIREBASE_CLIENT_EMAIL: ACCOUNT.client_email,
    FIREBASE_PRIVATE_KEY: PEM,
    FIREBASE_DATABASE_URL: 'https://x.firebaseio.com/'
  };

  test('all three fields reach cert(), and nothing else does', () => {
    const { passed } = credentialFrom(SPLIT);
    expect(passed).toEqual({
      projectId: ACCOUNT.project_id,
      clientEmail: ACCOUNT.client_email,
      privateKey: PEM
    });
  });

  test('a key whose newlines were escaped for a form field is restored', () => {
    const { passed } = credentialFrom({ ...SPLIT, FIREBASE_PRIVATE_KEY: PEM.replace(/\n/g, '\\n') });
    expect(passed.privateKey).toBe(PEM);
    expect(passed.privateKey).toContain('-----BEGIN PRIVATE KEY-----\n');
  });

  test('the restored key is a usable RSA private key', () => {
    const { passed } = credentialFrom({ ...SPLIT, FIREBASE_PRIVATE_KEY: PEM.replace(/\n/g, '\\n') });
    expect(() => crypto.createPrivateKey(passed.privateKey)).not.toThrow();
  });

  test('the split form wins when both are configured', () => {
    const { passed } = credentialFrom({
      ...SPLIT,
      FIREBASE_SERVICE_ACCOUNT: Buffer.from(JSON.stringify(
        { ...ACCOUNT, project_id: 'the-blob-one' })).toString('base64')
    });
    expect(passed.projectId).toBe('carboniq-fintech');
  });
});

describe('The base64 form still works, so an existing deployment is not broken', () => {
  test('a base64 service account is decoded and used', () => {
    const { passed } = credentialFrom({
      FIREBASE_SERVICE_ACCOUNT: Buffer.from(JSON.stringify(ACCOUNT)).toString('base64'),
      FIREBASE_DATABASE_URL: 'https://x.firebaseio.com/'
    });
    expect(passed.project_id).toBe(ACCOUNT.project_id);
  });
});

describe('A misconfiguration says which field is missing', () => {
  test('two of the three fields is an error naming the third, not silence', () => {
    const { passed, logs } = credentialFrom({
      FIREBASE_PROJECT_ID: ACCOUNT.project_id,
      FIREBASE_CLIENT_EMAIL: ACCOUNT.client_email,
      FIREBASE_DATABASE_URL: 'https://x.firebaseio.com/'
    });
    expect(passed).toBeNull();
    expect(logs.join('\n')).toContain('FIREBASE_PRIVATE_KEY');
  });

  test('no credentials at all warns rather than throwing', () => {
    const { passed, logs } = credentialFrom({});
    expect(passed).toBeNull();
    expect(logs.join('\n')).toMatch(/No credentials/i);
  });
});

describe('The split form is what keeps the function inside the 4KB cap', () => {
  const bytes = o => Object.entries(o)
    .reduce((n, [k, v]) => n + Buffer.byteLength(`${k}=${v}`, 'utf8'), 0);

  test('three fields cost at least 1KB less than the base64 blob', () => {
    const split = bytes({
      FIREBASE_PROJECT_ID: ACCOUNT.project_id,
      FIREBASE_CLIENT_EMAIL: ACCOUNT.client_email,
      FIREBASE_PRIVATE_KEY: PEM.replace(/\n/g, '\\n')
    });
    const blob = bytes({
      FIREBASE_SERVICE_ACCOUNT: Buffer.from(JSON.stringify(ACCOUNT)).toString('base64')
    });

    expect(blob).toBeGreaterThan(3000);
    expect(split).toBeLessThan(2100);
    expect(blob - split).toBeGreaterThan(1000);
  });

  test('the blob alone would consume most of the 4096-byte budget', () => {
    const blob = bytes({
      FIREBASE_SERVICE_ACCOUNT: Buffer.from(JSON.stringify(ACCOUNT)).toString('base64')
    });
    expect(blob / 4096).toBeGreaterThan(0.7);
  });
});
