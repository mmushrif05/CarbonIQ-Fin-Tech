# Signing in

Gap H1 of `docs/HANDOVER-GAP-ANALYSIS.md`. Until this shipped, the product had
no user authentication: the dashboard's sign-in was a form that took a name, an
email and a self-selected role and wrote them to `localStorage`, every browser
was handed the same API key carrying `read write lock assess` under one
hardcoded organisation, and the name that reached `lockedBy` and the audit
chain was whatever had been typed into the box.

---

## The shape of it

There is **one door** (`src/platform/auth/authenticate.js`) and two credentials
through it.

| Credential | Who uses it | What decides its permissions |
|---|---|---|
| `Authorization: Bearer <session token>` | A person, in a browser | The role on their account |
| `X-API-Key: ck_…` | A bank's own system | The scopes issued to the key |

Both end at `admit()` in `src/platform/auth/scopes.js`, which names the actor,
puts the organisation on the request, and enforces the scope the route needs.
No route can be authenticated without being authorised, because there is only
the one exit.

**`POST /v1/auth/login` is the only route on the surface with no credential**,
because it is the request that establishes one. A test pins that list.

---

## Roles, and what they may do

A role is on the account. The scopes a request holds are derived from it by
`scopesForRoleLevel()`, which is how all 154 routes acquired role enforcement
without a decorator on any of them.

| Role | Level | Scopes |
|---|---|---|
| `admin` | 100 | read, write, lock, assess, admin |
| `credit_officer` | 80 | read, write, lock, assess |
| `esg_analyst` | 60 | read, write, lock, assess |
| `relationship_manager` | 40 | read, write, assess |
| `auditor` | 30 | read |
| `borrower` | 10 | read |

`lock` is kept apart from `write` because a lock enters an assessment into a
regulatory disclosure. `admin` was reserved until now; the user-administration
routes are the first to require it.

**A role change takes effect on the account's next request, not at its next
sign-in.** The session holds only the account id; the role is read from the
account each time. Disabling somebody ends every session they hold, at once.

---

## The first account

A deployment starts empty and there is no self-service sign-up. `POST
/v1/auth/login` on an empty deployment answers `503 NO_ACCOUNTS` naming the
command below, and `GET /health` reports `configured.accounts` as a boolean, so
"nobody has been created yet" is never mistaken for "the password is wrong".

```bash
npm run user:create -- --email you@bank.lk --org dfcc --role admin
```

The password is printed once and stored only as a scrypt hash. After that,
accounts are created from the dashboard by anyone holding `admin`.

```bash
npm run user:list                       # every account, its role and standing
npm run user:role   -- ana@bank.lk --role esg_analyst
npm run user:passwd -- ana@bank.lk      # resets, and ends every session
npm run user:disable -- ana@bank.lk     # and ends every session
npm run user:enable  -- ana@bank.lk
```

---

## Sessions are rows, not signed tokens

`src/platform/auth/sessions.js`. A signed token cannot be withdrawn, and "sign
that person out now" is a control a bank asks for; a denylist that fixes it is
a session table wearing a different name. So a session is a row and signing out
is a delete.

The client holds a random 256-bit token. What is stored is its SHA-256, so a
reader of the database cannot present anyone's session — the same rule the API
keys follow.

Two clocks, because they answer different questions:

| Clock | Default | Ends |
|---|---|---|
| Idle | 60 minutes | A session somebody walked away from |
| Absolute | 12 hours | A session alive too long, however busy |

Changing a password ends every other session the account holds, because that is
what somebody does when they think a session is not theirs.

---

## Passwords

`src/platform/auth/password.js`. scrypt from Node's standard library — memory
hard, no native dependency to build or keep patched. The stored form carries its
own parameters (`scrypt$N$r$p$salt$hash`), so raising the cost later does not
invalidate anyone's password; a hash written under weaker parameters is quietly
upgraded at the next successful sign-in.

Minimum length is 12 characters and there are no composition rules, which is
where NIST landed in 2017. Comparison is `timingSafeEqual`.

**A failed sign-in never says whether the address exists.** A missing account is
checked against a decoy hash so it costs the same time as a real one, and the
refusal is byte-identical either way. Without that, the form is an address
oracle for anyone with a list.

---

## What an integration still gets

Nothing about API keys changed except that a browser no longer receives one.
`npm run key:create`, `key:scope`, `key:rotate` and the rest work as before,
keys are still hashed with a per-deployment salt, and `X-API-Key` is still how a
loan-origination system authenticates.

Two changes worth knowing:

- **`X-Actor` is still believed and now recorded as unverified.** A bank's own
  system is the only thing that knows which of its people pressed the button, so
  the header is honoured. The audit line carries `actorVerified: false` for it
  and `true` for a name the server established, so a reader of the chain can
  tell a fact from an assertion.
- **A key issued before scopes existed is held to `read`.** It used to be waved
  through with every scope on every route, indefinitely. Set
  `ALLOW_UNSCOPED_KEYS=true` for a migration window; `config.validate()` refuses
  it in production, so the grace cannot quietly become the arrangement.

---

## Rate limiting

`src/platform/http/rate-limit-store.js`. Where PostgreSQL is the store the
counter is a row and one limit covers every instance. Where it is not, the
library's per-process store remains and `GET /health` → `rateLimits` says so,
rather than leaving a deployment to assume a guarantee it does not have.

Sign-in is limited on the address being tried as well as the caller, so a spread
of source addresses does not buy more attempts at one account.

---

## What this does not do yet

- **No password reset by email.** An administrator resets a password with
  `npm run user:passwd`. There is no mail transport in this system and adding
  one is a decision about a vendor, not a line of code.
- **No second factor.** The place it belongs is `POST /v1/auth/login`, between
  the password check and `sessions.issue()`.
- **No single sign-on.** The Firebase JWT path in `src/platform/auth/auth.js`
  still exists and still verifies signature and expiry, so a deployment that
  wants an external identity provider has somewhere to start.
- **Roles are coarse.** A `borrower` holds `read` over the organisation, which
  is right for the six roles as defined and wrong the day the product has an
  actual borrower portal. That is attribute-level authorisation and it is not
  built.
