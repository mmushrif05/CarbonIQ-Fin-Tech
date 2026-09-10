#!/usr/bin/env node
// @ts-check
/**
 * The accounts that can sign in.
 *
 * A deployment starts with nobody in it, and there is no self-service sign-up
 * — this is a bank's internal instrument, so the first administrator is
 * created by whoever has the database, and everyone after that is created
 * from the dashboard. That is what this command is for.
 *
 *   npm run user:create -- --email ana@bank.lk --org dfcc --role admin
 *   npm run user:list
 *   npm run user:list -- --org dfcc
 *   npm run user:role   -- ana@bank.lk --role esg_analyst
 *   npm run user:passwd -- ana@bank.lk
 *   npm run user:disable -- ana@bank.lk
 *   npm run user:enable  -- ana@bank.lk
 *
 * A password may be given with --password, and is otherwise generated and
 * printed once. It is never stored in the clear and cannot be read back.
 */

'use strict';

require('dotenv').config();

const crypto = require('crypto');
const users = require('../src/platform/auth/users');
const sessions = require('../src/platform/auth/sessions');
const store = require('../src/platform/database/store');
const { ROLES } = require('../src/shared/policies');

const argv = process.argv.slice(2);
const command = argv[0];

/** `--flag value` and `--flag=value`, plus the first bare word as a subject. */
function parse(args) {
  const flags = {};
  const bare = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a.startsWith('--')) {
      const [name, inline] = a.slice(2).split('=');
      if (inline !== undefined) flags[name] = inline;
      else if (args[i + 1] && !args[i + 1].startsWith('--')) { flags[name] = args[i + 1]; i += 1; }
      else flags[name] = true;
    } else bare.push(a);
  }
  return { flags, bare };
}

/** Long enough that generating one is never the weak link. */
const generatePassword = () => crypto.randomBytes(18).toString('base64url');

const HELP = `
Accounts that can sign in to CarbonIQ.

  create   --email <address> --org <org-id> [--role <role>] [--name "Full Name"] [--password <secret>]
           [--until <YYYY-MM-DD>]  an access window — this is what a trial is
           [--own-password]        the account holder chose this password, so it need not be replaced
  list     [--org <org-id>]
  role     <email> --role <role>
  passwd   <email> [--password <secret>]
  trial    <email> --until <YYYY-MM-DD>   an access window: signs in normally until then, and not after
  trial    <email> --end                  close the window now, and end every session
  trial    <email> --open                 remove the window — a trial becomes an ordinary account
  disable  <email>
  enable   <email>

Roles: ${Object.keys(ROLES).join(', ')}
A role decides the scopes every request from that account holds.
`;

function reportStorage() {
  const cap = store.capability();
  if (cap.writable) return true;
  console.error(`\nThis deployment cannot persist anything (storage: ${cap.mode} — ${cap.reason}).`);
  console.error('Set DATABASE_URL to the database the accounts should live in, then run this again.\n');
  return false;
}

async function findOrFail(email) {
  const user = await users.findByEmail(email);
  if (!user) {
    console.error(`No account for ${email}.`);
    process.exit(1);
  }
  return user;
}

/* An access window is its own column. It is not the standing and not the role,
   and a reader scanning this list has to be able to tell "trial ends Friday"
   from "somebody switched this off". */
const windowOf = (u) => {
  const a = u.access || { state: u.active === false ? 'disabled' : 'open' };
  if (a.state === 'open') return '           ';
  if (a.state === 'ended') return `ended ${String(a.endsAt || '').slice(0, 10)}`;
  if (a.state === 'ending') return `until ${String(a.endsAt || '').slice(0, 10)}`;
  return '           ';
};

const line = u => `${u.email.padEnd(32)} ${String(u.role).padEnd(22)} ${u.orgId.padEnd(14)} `
  + `${u.active ? 'active  ' : 'disabled'} ${windowOf(u)} `
  + `${u.lastLoginAt ? `last in ${u.lastLoginAt.slice(0, 10)}` : 'never signed in'}`;

async function main() {
  if (!command || command === 'help' || argv.includes('--help')) {
    console.log(HELP);
    return;
  }
  if (!reportStorage()) process.exit(1);

  const { flags, bare } = parse(argv.slice(1));

  if (command === 'create') {
    const secret = flags.password || generatePassword();
    const created = await users.createUser({
      orgId: flags.org,
      email: flags.email || bare[0],
      name: flags.name,
      role: flags.role || 'esg_analyst',
      password: secret,
      createdBy: /** @type {any} */ ('cli'),
      accessEndsAt: flags.until || null,
      /* The operator typed this password, so it is theirs until the account
         replaces it. `--own-password` is for the first administrator, who is
         creating their own account and has already chosen it. */
      mustChangePassword: !argv.includes('--own-password'),
    });
    console.log(`\nCreated ${created.email} — ${created.roleLabel} in ${created.orgId}`);
    if (created.accessEndsAt) {
      console.log(`  Access ends ${created.accessEndsAt} — ${created.access.daysRemaining} day(s) from now.`);
    }
    if (!flags.password) {
      console.log(`\n  Password: ${secret}`);
      console.log('\n  Shown once. It is stored only as a scrypt hash and cannot be read back.');
      console.log('  Give it to them over a channel you trust, and have them change it at first sign-in.\n');
    }
    return;
  }

  if (command === 'list') {
    const all = await users.listUsers({ orgId: flags.org || null });
    if (!all.length) {
      console.log('\nNo accounts yet. Create the first administrator:');
      console.log('  npm run user:create -- --email you@bank.lk --org <org-id> --role admin\n');
      return;
    }
    console.log(`\n${all.length} account(s):\n`);
    for (const u of all.sort((a, b) => a.email.localeCompare(b.email))) console.log(`  ${line(u)}`);
    const admins = all.filter(u => u.role === 'admin' && u.active).length;
    console.log(`\n  ${admins} active administrator(s).`);
    if (admins === 0) console.log('  Nobody can administer this deployment. Promote someone: npm run user:role -- <email> --role admin');
    console.log();
    return;
  }

  const email = bare[0] || flags.email;
  if (!email) { console.error(`"${command}" needs an email address.\n${HELP}`); process.exit(1); }

  if (command === 'role') {
    const user = await findOrFail(email);
    const updated = await users.setRole(user.id, flags.role);
    console.log(`${updated.email} is now ${updated.roleLabel}.`);
    /* A role change reaches a signed-in session on its next request, because
       the role is read from the account rather than kept in the session. */
    return;
  }

  if (command === 'passwd') {
    const user = await findOrFail(email);
    const secret = flags.password || generatePassword();
    await users.setPassword(user.id, secret, { mustChangePassword: !argv.includes('--own-password') });
    const ended = await sessions.revokeAllForUser(user.id);
    console.log(`\nPassword reset for ${user.email}. ${ended} session(s) ended.`);
    if (!flags.password) console.log(`\n  Password: ${secret}\n\n  Shown once.\n`);
    return;
  }

  if (command === 'trial') {
    const user = await findOrFail(email);
    if (!flags.until && !argv.includes('--end') && !argv.includes('--open')) {
      console.error('trial needs one of --until <YYYY-MM-DD>, --end or --open.');
      process.exit(1);
    }
    /* --end closes the window at this instant rather than deleting it: the
       date it closed is part of the account's history, and "when did their
       access stop" is a question somebody asks later. */
    const when = argv.includes('--open') ? null
      : argv.includes('--end') ? new Date().toISOString()
        : flags.until;
    const updated = await users.setAccessEndsAt(user.id, when);
    const ended = users.accessHasEnded(updated) ? await sessions.revokeAllForUser(user.id) : 0;
    if (!updated.accessEndsAt) {
      console.log(`${updated.email} has no access window — an ordinary account.`);
    } else if (users.accessHasEnded(updated)) {
      console.log(`${updated.email} access ended ${updated.accessEndsAt}.`
        + (ended ? ` ${ended} session(s) ended.` : ''));
    } else {
      console.log(`${updated.email} may sign in until ${updated.accessEndsAt}`
        + ` — ${updated.access.daysRemaining} day(s).`);
    }
    return;
  }

  if (command === 'disable' || command === 'enable') {
    const user = await findOrFail(email);
    const updated = await users.setActive(user.id, command === 'enable');
    const ended = command === 'disable' ? await sessions.revokeAllForUser(user.id) : 0;
    console.log(`${updated.email} is ${updated.active ? 'active' : 'disabled'}.`
      + (ended ? ` ${ended} session(s) ended.` : ''));
    return;
  }

  console.error(`Unknown command "${command}".\n${HELP}`);
  process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(`\n${err.code ? `${err.code}: ` : ''}${err.message}`);
    if (err.remedy) console.error(`  ${err.remedy}`);
    console.error();
    process.exit(1);
  });
