// @ts-check
/**
 * Validation happens in one place, and the router can see it.
 *
 * It used to happen in four: the `validate()` middleware in most routes,
 * an inline `schema.validate()` inside three handlers, Joi inside `domain/`
 * for the whole of GCF — which had no `interface/schemas/` directory at all —
 * and nothing whatsoever in three more.
 *
 * That is not a tidiness complaint. **The OpenAPI document is generated from
 * the router**, and it can only read a schema that is in the route's own
 * chain. Validation the router cannot see is a request body the contract
 * cannot describe, so 15 of 59 write operations shipped as operations a bank
 * generating a client had to guess at. Unifying the placement is what makes
 * the contract able to describe them.
 *
 * A route that genuinely takes no body says so with `emptyBody`, because from
 * a generated document "no schema" and "no body" look identical, and the first
 * sends a client author hunting through source for fields that do not exist.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

process.env.NODE_ENV = 'test';
const app = require('../src/server');

/** Every route Express registered, with the names of its middleware. */
function routes() {
  const found = [];
  const walk = (layer, prefix) => {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) {
        found.push({
          method: method.toUpperCase(),
          path: prefix + layer.route.path,
          middleware: layer.route.stack.map(s => s.name),
        });
      }
      return;
    }
    if (!layer.handle || !layer.handle.stack) return;
    const src = layer.regexp && layer.regexp.source;
    const seg = src
      ? src.replace('^\\/', '').replace('\\/?(?=\\/|$)', '')
        .replace(/\\\\\//g, '/').replace(/[\^$?()=]/g, '')
      : '';
    for (const child of layer.handle.stack) walk(child, prefix + (seg ? `/${seg}` : ''));
  };
  for (const layer of app._router.stack) walk(layer, '');
  return found;
}

const WRITE_METHODS = ['POST', 'PUT', 'PATCH'];

describe('Every write carries a schema the router can read', () => {
  test('no POST, PUT or PATCH is registered without validate()', () => {
    const missing = routes()
      .filter(r => WRITE_METHODS.includes(r.method))
      .filter(r => !r.middleware.includes('validate'))
      .map(r => `${r.method} ${r.path}`);
    expect(missing).toEqual([]);
  });

  test('there are enough of them for that to mean something', () => {
    const writes = routes().filter(r => WRITE_METHODS.includes(r.method));
    expect(writes.length).toBeGreaterThan(50);
  });

  test('validate runs after authenticate, never before it', () => {
    /* Otherwise a caller with no credential is told their body is malformed
       instead of that they are not signed in — a 400 where a 401 belongs. */
    const wrong = routes()
      .filter(r => r.middleware.includes('validate') && r.middleware.includes('authenticate'))
      .filter(r => r.middleware.indexOf('validate') < r.middleware.indexOf('authenticate'))
      .map(r => `${r.method} ${r.path}`);
    expect(wrong).toEqual([]);
  });
});

describe('Validation is not written a second way', () => {
  const routeFiles = (() => {
    const out = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.js') && /[/\\]routes[/\\]/.test(full)) out.push(full);
      }
    };
    walk(path.join(ROOT, 'src'));
    return out;
  })();

  test('there are route files to check', () => {
    expect(routeFiles.length).toBeGreaterThan(10);
  });

  test('no handler calls a Joi schema directly', () => {
    /* `someSchema.validate(req.body)` is the shape that hides a contract from
       the generator. `config.validate()` is not one of these and is excluded
       by the `Schema` in the name it has to match. */
    const offenders = [];
    for (const file of routeFiles) {
      const src = fs.readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      if (/\b\w*[Ss]chema\.validate\s*\(/.test(src)) offenders.push(path.relative(ROOT, file));
    }
    expect(offenders).toEqual([]);
  });

  test('every domain that validates has an interface/schemas directory', () => {
    /* GCF was the exception: its Joi lived in `domain/`, applied by the
       handler. The schema still lives there — the period importer has to hold
       every record to it and a domain may not import an interface — but it is
       *applied* from the boundary now, which is the direction the architecture
       allows. */
    const domains = fs.readdirSync(path.join(ROOT, 'src/domains'), { withFileTypes: true })
      .filter(d => d.isDirectory()).map(d => d.name);
    const withRoutes = domains.filter(d =>
      fs.existsSync(path.join(ROOT, 'src/domains', d, 'interface/routes')));
    expect(withRoutes.length).toBeGreaterThan(4);
    for (const d of withRoutes) {
      expect({ domain: d, hasSchemas: fs.existsSync(path.join(ROOT, 'src/domains', d, 'interface/schemas')) })
        .toEqual({ domain: d, hasSchemas: true });
    }
  });

  test('no route file keeps its own async handler', () => {
    /* Four did, each with its own `fail()`; the error handler already knows
       `statusCode`, `code` and `remedy`. */
    for (const file of routeFiles) {
      expect({ file: path.relative(ROOT, file),
        private: /const handle = \(fn\)/.test(fs.readFileSync(file, 'utf8')) })
        .toEqual({ file: path.relative(ROOT, file), private: false });
    }
  });
});

describe('The two routes that must not have their body touched', () => {
  const validate = require('../src/platform/http/validate');

  test('a hashed payload survives validation byte for byte', () => {
    const { gcfImportSchema } = require('../src/domains/gcf/interface/schemas/gcf');
    const { certificateVerifySchema } = require('../src/domains/taxonomy/interface/schemas/taxonomy');

    /* The checksum covers the payload's own keys, so a stripped unknown key or
       a coerced number would make a package this system exported fail its own
       verification — an integrity failure caused by the integrity check. */
    const pkg = { format: 'carboniq.gcf.period.v1', reportingYear: 2026, orgId: null,
      sample: false, sampleNote: null, exportedAt: 't', checksum: 'abc',
      projects: [{ id: 'a', nested: { deep: [1, 2] } }], surprise: 'kept' };
    const seen = gcfImportSchema.validate(pkg, { abortEarly: false, stripUnknown: false, convert: true });
    expect(seen.error).toBeUndefined();
    expect(seen.value).toEqual(pkg);

    const cert = { certId: 'c1', hash: 'h', issuedAt: '2026-01-01', tier: 'green', extra: { a: 1 } };
    const seenCert = certificateVerifySchema.validate(cert, { abortEarly: false, stripUnknown: false, convert: true });
    expect(seenCert.error).toBeUndefined();
    expect(seenCert.value).toEqual(cert);
  });

  test('stripUnknown can be turned off, and defaults to on', () => {
    const Joi = require('joi');
    const schema = Joi.object({ known: Joi.string() });
    const run = (mw, body) => {
      const req = { body }; let status = null;
      /** @type {any} */ let payload = null;
      let passed = false;
      mw(req, { status: (s) => { status = s; return { json: (p) => { payload = p; } }; } },
        () => { passed = true; });
      return { req, status, payload, passed };
    };

    const stripping = run(validate({ body: schema }), { known: 'x', invented: 'y' });
    expect(stripping.passed).toBe(true);
    expect(stripping.req.body).toEqual({ known: 'x' });

    const strict = run(validate({ body: schema }, { stripUnknown: false }), { known: 'x', invented: 'y' });
    expect(strict.passed).toBe(false);
    expect(strict.status).toBe(400);
    expect(strict.payload).not.toBeNull();
    expect(strict.payload.details.map(d => d.field)).toContain('invented');
  });
});
