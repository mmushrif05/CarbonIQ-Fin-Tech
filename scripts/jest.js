#!/usr/bin/env node
// @ts-check
/**
 * `npm test` — the whole suite with coverage; `npm test <path>` — just that.
 *
 * `test` was `jest --coverage`, which meant `npm test tests/observability.test.js`
 * ran 22 passing tests and then exited non-zero on the *global* coverage
 * thresholds, because one file's worth of coverage cannot meet a whole tree's
 * bar. A developer hits that several times a day, and what it teaches is to
 * stop believing exit codes — which is the one habit a test suite cannot
 * afford.
 *
 * So coverage is added only when the run is the whole suite: no path pattern,
 * no `-t`, no watch. Anything narrower runs plain and its exit code means what
 * it says. An explicit `--coverage` or `--no-coverage` always wins.
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');

const argv = process.argv.slice(2);

/** A flag that takes a value, so the value after it is not a path pattern. */
const VALUED = new Set([
  '-t', '--testNamePattern', '--testPathPattern', '--testPathPatterns',
  '--reporters', '--maxWorkers', '-w', '--shard', '--selectProjects',
  '--coverageDirectory', '--coverageReporters', '--collectCoverageFrom',
  '--testTimeout', '--config', '-c', '--runTestsByPath',
]);

/** Is this run narrower than "everything"? */
function isNarrowed(args) {
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--') continue;
    if (VALUED.has(a)) { i += 1; continue; }          // its value is not a pattern
    if (a.startsWith('-')) {
      // `--watch`, `--onlyChanged`, `-t=x`, `--testNamePattern=x` all narrow it.
      if (/^--(watch|watchAll|onlyChanged|changedSince|lastCommit|findRelatedTests|listTests|shard)\b/.test(a)) return true;
      if (/^(-t|--testNamePattern|--testPathPatterns?|--runTestsByPath|--selectProjects)=/.test(a)) return true;
      continue;
    }
    return true;                                       // a bare argument is a path pattern
  }
  return false;
}

const asked = argv.some(a => a === '--coverage' || a.startsWith('--coverage=')
  || a === '--no-coverage' || a === '--collectCoverage' || a.startsWith('--collectCoverage='));

const args = [...argv];
if (!asked && !isNarrowed(argv)) args.unshift('--coverage');

const jest = path.join(__dirname, '..', 'node_modules', '.bin', 'jest');
const child = spawn(jest, args, { stdio: 'inherit' });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
