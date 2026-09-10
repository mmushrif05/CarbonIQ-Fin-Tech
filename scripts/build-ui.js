#!/usr/bin/env node
// @ts-check
/**
 * The frontend build (gap H1) — `npm run build:ui`.
 *
 * The dashboard is a static shell that loads page fragments and modules by
 * path. This produces the directory Netlify publishes, `dist/ui`, from
 * `ui/`: every script and stylesheet minified with esbuild, with a source
 * map beside it; every other file copied as it is; and a manifest naming
 * the commit and every file with its size. Paths are preserved exactly, so
 * nothing the shell fetches moves. A module that does not parse fails the
 * build here, before it fails in a browser.
 *
 * Top-level names are kept: the modules are classic scripts that reach one
 * another through globals, and esbuild does not rename top-level symbols
 * when it is not bundling. The browser tests run against this output.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'ui');
const OUT = process.env.UI_BUILD_DIR ? path.resolve(process.env.UI_BUILD_DIR) : path.join(ROOT, 'dist', 'ui');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

async function build() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const files = walk(SRC);
  const manifest = { builtAt: new Date().toISOString(), commit: process.env.COMMIT_REF || null, files: {} };
  let minified = 0;
  for (const file of files) {
    const rel = path.relative(SRC, file);
    const dest = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const ext = path.extname(file);
    /* A vendored library arrives minified; it is copied, not minified twice. */
    const vendored = rel.split(path.sep)[0] === 'vendor';
    if ((ext === '.js' || ext === '.css') && !vendored) {
      const source = fs.readFileSync(file, 'utf8');
      const result = await esbuild.transform(source, {
        loader: ext === '.js' ? 'js' : 'css',
        minify: true,
        sourcemap: true,
        sourcefile: rel,
        target: ['es2020'],
        legalComments: 'none',
      });
      const code = `${result.code}\n//# sourceMappingURL=${path.basename(rel)}.map\n`;
      fs.writeFileSync(dest, ext === '.js' ? code : `${result.code}\n/*# sourceMappingURL=${path.basename(rel)}.map */\n`);
      fs.writeFileSync(`${dest}.map`, result.map);
      manifest.files[rel] = { bytes: Buffer.byteLength(code), sourceBytes: Buffer.byteLength(source), minified: true };
      minified += 1;
    } else {
      fs.copyFileSync(file, dest);
      manifest.files[rel] = { bytes: fs.statSync(file).size, minified: false };
    }
  }
  fs.writeFileSync(path.join(OUT, 'build-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const before = Object.values(manifest.files).reduce((n, f) => n + (f.sourceBytes || f.bytes), 0);
  const after = Object.values(manifest.files).reduce((n, f) => n + f.bytes, 0);
  process.stdout.write(`Built ${path.relative(ROOT, OUT)} — ${files.length} files, ${minified} minified, ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB\n`);
}

build().catch(err => { process.stderr.write(`build failed: ${err.message}\n`); process.exit(1); });
