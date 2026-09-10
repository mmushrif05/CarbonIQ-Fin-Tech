#!/usr/bin/env node
// @ts-check
/**
 * Bring up (or point at) the PostgreSQL the second suite runs on.
 *
 * `package.json` defaulted `TEST_DATABASE_URL` to port 54329, and that port
 * appeared in exactly one file in the repository: `package.json`. No compose
 * service, no provisioning script, no mention in any doc — so
 * `npm run test:postgres` failed with a raw ECONNREFUSED stack trace and
 * everyone ran the memory suite instead, learning about foreign-key failures
 * from CI. The first PostgreSQL run this project ever did failed 27 tests for
 * exactly that reason.
 *
 *   npm run db:test-up     start it (Docker) and migrate every worker schema
 *   npm run db:test-down   stop and remove it
 *   npm run db:test-status what is listening, and what the suite will use
 *
 * A database you already have is fine: set TEST_DATABASE_URL and skip this.
 */

'use strict';

const { spawnSync } = require('child_process');
const net = require('net');

const NAME = 'carboniq-test-db';
const PORT = Number(process.env.TEST_DB_PORT || 54329);
const URL = process.env.TEST_DATABASE_URL
  || `postgresql://carboniq:carboniq@127.0.0.1:${PORT}/carboniq_test`;

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });

/** Is something accepting connections on the port? */
function listening(port) {
  return new Promise(resolve => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const done = ok => { socket.destroy(); resolve(ok); };
    socket.setTimeout(700);
    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));
  });
}

function haveDocker() {
  const r = run('docker', ['info'], { stdio: 'ignore' });
  return r.status === 0;
}

async function waitReady(seconds = 40) {
  for (let i = 0; i < seconds * 2; i += 1) {
    if (await listening(PORT)) {
      const r = run('docker', ['exec', NAME, 'pg_isready', '-U', 'carboniq', '-d', 'carboniq_test']);
      if (r.status === 0) return true;
    }
    await new Promise(r2 => { setTimeout(r2, 500); });
  }
  return false;
}

async function up() {
  if (await listening(PORT)) {
    process.stdout.write(`Something is already listening on ${PORT}; using it.\n`);
  } else {
    if (!haveDocker()) {
      process.stderr.write(
        'Docker is not available, and nothing is listening on '
        + `${PORT}.\n\nEither start Docker, or point the suite at a PostgreSQL you have:\n`
        + `  TEST_DATABASE_URL=postgresql://user:pass@host:5432/db npm run test:postgres\n`);
      process.exitCode = 1;
      return;
    }
    run('docker', ['rm', '-f', NAME], { stdio: 'ignore' });
    const r = run('docker', ['run', '-d', '--name', NAME,
      '-e', 'POSTGRES_USER=carboniq', '-e', 'POSTGRES_PASSWORD=carboniq',
      '-e', 'POSTGRES_DB=carboniq_test',
      '-p', `${PORT}:5432`, 'postgres:16']);
    if (r.status !== 0) {
      process.stderr.write(`Could not start the container:\n${r.stderr}`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`Started ${NAME} on ${PORT}. Waiting for it…\n`);
    if (!await waitReady()) {
      process.stderr.write('It did not become ready. `docker logs carboniq-test-db` has the reason.\n');
      process.exitCode = 1;
      return;
    }
  }

  process.env.DATABASE_URL = URL;
  await require('./db-migrate-lib')(URL);
  process.stdout.write(`\nReady.\n  TEST_DATABASE_URL=${URL}\n  npm run test:postgres\n`);
}

function down() {
  run('docker', ['rm', '-f', NAME], { stdio: 'inherit' });
}

async function status() {
  const up_ = await listening(PORT);
  process.stdout.write(`port ${PORT}: ${up_ ? 'listening' : 'nothing there'}\n`);
  process.stdout.write(`the suite will use: ${URL}\n`);
  if (!up_) process.stdout.write('start it with: npm run db:test-up\n');
}

const cmd = process.argv[2] || 'up';
if (cmd === 'down') down();
else if (cmd === 'status') status();
else up();
