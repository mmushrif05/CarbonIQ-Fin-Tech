# Security

CarbonIQ FinTech holds a bank's or an insurer's book and produces figures that
reach a regulatory disclosure. A vulnerability here is a disclosure risk as
well as a data one, so please tell us before you tell anyone else.

## Reporting a vulnerability

Email **security@datumsolutions.lk** with:

- what you found and where (a file and line, or a request that shows it),
- what an attacker could do with it,
- anything you needed in order to reach it — a credential, a role, a
  particular deployment.

We acknowledge within **two working days** and give you a first assessment
within **ten**. If we disagree that something is a vulnerability we will say
so and why, rather than going quiet.

Please do not open a public issue for a suspected vulnerability, and please do
not test against a deployment you do not own.

## What is in scope

Anything in this repository, and the production deployment at
`https://carboniqfintech.netlify.app`. In particular:

- authentication and session handling (`src/platform/auth/`);
- the scope model — a route that can be reached without the scope
  `src/platform/auth/scopes.js` resolves for it;
- anything that would let one organisation read or change another's records;
- anything that would let a figure enter a disclosure without passing through
  the engine, or a locked assessment change without a recorded restatement;
- the audit chain (`audit_events`) — any way to write, alter or break it.

## What is not

- Findings that require a credential you were given for a trial, used as
  intended.
- Rate limiting on a demonstration deployment.
- Missing hardening headers on the API when the same header is set on the
  published frontend, which is what a browser loads.
- Reports from an automated scanner with no demonstrated impact.

## Credentials in this repository

There are none, and there should never be. `.env` is not committed and
Netlify's secret scan runs on every deploy. If you find a live credential in
the history, that is a valid report — say where it is rather than pasting it.

## Our own practice

- `npm audit --audit-level=high` fails the build; Dependabot opens a pull
  request weekly (`.github/dependabot.yml`).
- `config.validate()` refuses to start a production deployment with a default
  salt, a development bypass key, or a store that cannot persist
  (`src/platform/config/index.js`).
- Every response is logged with its request id, actor and organisation, and
  keys, tokens and service accounts are redacted by name
  (`docs/OBSERVABILITY.md`).
