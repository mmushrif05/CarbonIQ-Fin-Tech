#!/usr/bin/env node
/**
 * Stamp the build's identity into a file the function can read at runtime.
 *
 * `/health` exists partly to answer "did the fix deploy?" — because "the fix
 * did not work" and "the fix has not been deployed" look identical from a
 * browser, and the second is far more common. It read COMMIT_REF from the
 * environment to do that.
 *
 * COMMIT_REF is a *build-time* variable. It is not in the Lambda's runtime
 * environment, so the endpoint has been answering "unknown (not a Netlify
 * build)" on every production deploy — the diagnostic built to prevent a false
 * conclusion was quietly incapable of the one thing it was for.
 *
 * The build writes what it knows to disk; the function reads the file. A
 * missing file is reported as unknown rather than guessed at, which is the
 * same rule the rest of this application follows about absent facts.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const info = {
  commit: process.env.COMMIT_REF || process.env.GIT_COMMIT || null,
  branch: process.env.BRANCH || process.env.HEAD || null,
  deployId: process.env.DEPLOY_ID || null,
  context: process.env.CONTEXT || null,
  builtAt: new Date().toISOString(),
};

const out = path.join(__dirname, '..', 'build-info.json');
fs.writeFileSync(out, `${JSON.stringify(info, null, 2)}\n`);
console.log(`[build-info] ${info.commit ? info.commit.slice(0, 12) : 'no commit ref'} · ${info.context || 'no context'} → ${path.relative(process.cwd(), out)}`);
