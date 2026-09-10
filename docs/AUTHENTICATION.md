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
| `viewer` | 20 | read |
| `borrower` | 10 | read |

`viewer` is the preview visitor (below). It is a role of its own rather than a
reuse of `auditor` because the two make different claims: an auditor is a named
person a bank appointed to read its real book, and a preview visitor is someone
who typed an address into a public form. Labelling the second as the first
would put *Auditor* beside a marketing address on the Accounts screen.

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

Where there is a shell beside the database:

```bash
npm run user:create -- --email you@bank.lk --org dfcc --role admin --own-password
```

The password is printed once and stored only as a scrypt hash.

**Where there is no shell, there is `POST /v1/auth/bootstrap`.** A serverless
deployment has no terminal beside its database, so the command above was not
open to the person setting one up and the first administrator could not be
created at all. The route closes that, and it is bounded three ways:

| Condition | Why |
|---|---|
| The deployment holds **no accounts at all** | Not "no administrators", not "none in this organisation". One account anywhere closes the window for good, so the route cannot add a second administrator to a live deployment. |
| `ADMIN_BOOTSTRAP_TOKEN` is set | A bootstrap route that works without one is an open door on every deployment nobody has set up yet, which is exactly the state it exists to serve. Compared in constant time. |
| It can persist | An account nothing kept is worse than none. |

`GET /v1/auth/bootstrap` answers whether the window is open and, where it is
not, which condition failed — so an operator is told rather than guessing from
a refusal. Neither answer ever carries the token, and `/health` reports
`configured.bootstrap` as a boolean beside `configured.accounts`. Once the
window has closed, the route answers **410 Gone** rather than 403: a 403
invites someone to go looking for a credential that would open it, and there is
not one. The sign-in screen offers the form only where the server says the
window is open.

After the first administrator, accounts are issued from the Accounts screen or
the API by anyone holding `admin`.

```bash
npm run user:list                       # every account, its role, standing and window
npm run user:role   -- ana@bank.lk --role esg_analyst
npm run user:passwd -- ana@bank.lk      # resets, and ends every session
npm run user:trial  -- guest@customer.lk --until 2026-03-31
npm run user:disable -- ana@bank.lk     # and ends every session
npm run user:enable  -- ana@bank.lk
```

---

## Preview access — the sample book, opened by an address

`POST /v1/auth/preview` takes an email address and nothing else, and answers
with a session. That sounds like an open door and it is not one: what comes
back holds `read`, in an organisation whose only records are a sample book.

**There is nothing to authenticate.** The address is recorded, not believed.
That is why the route carries no credential — the same reason `POST
/v1/auth/login` does not, arrived at from the other direction — and why it can
grant strictly less than a sign-in grants somebody who already has an account.

### One shared account, one register row per address

The obvious design is an account per visitor, and it is wrong twice. A public
form that writes a row into `users` for anyone who types into it is an
unbounded write on the table holding every real person; and `users` keys on the
address, so the first time somebody at a bank that already has an account typed
their own address into the preview form the route would have to either refuse —
announcing to an anonymous caller that the address is registered, which is
precisely the oracle the sign-in route goes to lengths to avoid — or touch
their real account.

So every visitor is admitted on one shared account (`preview@carboniq.invalid`,
role `viewer`, organisation `preview`) and each gets their own session row,
which is what expires and can be revoked. Who asked lives in `preview_signups`
(migration `0007`), which is the register a product team reads. The two facts
are kept apart deliberately: removing an account must not erase the fact that
the question was asked.

The cost is worth stating. An audit line for a preview read names the preview
account rather than the visitor. That is accurate rather than lossy — the
preview account is the authority the request carried — and it cannot mislead
anyone about a book, because the only book a preview session can reach is the
sample one.

### Why the isolation holds

Not a check that refuses; a partition that is empty. Every read at the storage
seam takes the organisation as its second argument and is partitioned on it, so
an organisation whose only records are the sample book can only ever return the
sample book. A record written into another organisation is invisible from a
preview session with no rule firing, and `tests/preview-access.test.js` proves
exactly that by writing one.

`scopesForRoleLevel(20)` resolves to `['read']`, so a preview session cannot
write, cannot lock and cannot run an agent — the last of which also means a
public form cannot spend the deployment's AI budget.

### The register

`GET /v1/auth/preview/signups` requires the **`admin`** scope — one bar above
the `read` every other list on the surface needs, because it is the most
personal thing this deployment holds. It answers newest first: the address,
when it first asked, when it last did, and how many times. A returning address
is one row with a count rather than four rows, because *asked once in March*
and *has come back four times this week* are different facts about the same
address and only the second is worth acting on.

No IP address is kept. The register holds what a visitor chose to give.

### The sample book, and the switch

The capital book and the GCF pipeline already fall back to the baselines
shipped in `data/` when an organisation has recorded nothing, so they need no
seeding. Part C has no such baseline, so its demo book is installed into the
preview organisation on the first admission, once. That install is sequentially
idempotent; two visitors pressing the button in the same instant on a
deployment that has never been previewed could both pass the check and seed
twice, which would duplicate the sample book rather than do anything unsafe.
The seam publishes no lock to close it and this is recorded rather than left to
be found.

`PREVIEW_ACCESS=off` closes the door; `GET /v1/auth/preview` then says so with
the remedy, and the sign-in screen offers no panel. The default is on, which is
the less cautious of the two defaults and is deliberate: what the route can do
is bounded by construction, so the usual reason to default a public door shut
does not apply.

---

## Trial access — a window, not a role and not a flag

An account may carry `accessEndsAt`: an instant after which it can no longer
sign in. That is what a trial is, and it is deliberately a third thing rather
than a reuse of either of the two that already exist.

| | What it answers | Who decides it |
|---|---|---|
| **Role** | what this account may do | an administrator, at any time |
| **Standing** (`active`) | whether somebody switched it off | an administrator, at a moment |
| **Access window** (`accessEndsAt`) | until when | a date agreed in advance, which then passes on its own |

Folding the window into the role would mean a trial customer could not hold the
same role as a paying one, and on the day they convert their permissions would
change for a reason nobody recorded. Folding it into `active` would tell a
customer whose trial ran out that their account "has been disabled" — which
sends them to the wrong person and gets them the wrong answer.

So the two refusals are separate and both are named:

| | Code | Status |
|---|---|---|
| Somebody switched the account off | `ACCOUNT_DISABLED` | 403 |
| A date agreed in advance has passed | `ACCESS_ENDED` | 403 |

Both are reachable **only after the password has verified**, so neither tells an
attacker which addresses exist; a wrong password on an ended account is still
`401 SIGN_IN_FAILED`. The generic answer is kept for the case that needs it and
dropped for the case where it would only confuse the customer it is shown to.

A bare date means *through the end of that day* — `2026-03-31` becomes
`2026-03-31T23:59:59.999Z` — because "the trial runs to the 31st" means through
the 31st, and reading it as midnight cuts a customer off a day early.

**A session never outlives the window it was issued under.** `sessions.issue()`
caps the absolute clock at `accessEndsAt`, so a twelve-hour session opened an
hour before a trial closes ends when the trial does rather than eleven hours
later. And the window is re-read from the account on every request, exactly as
the role is, so an administrator who ends a trial has ended it now rather than
at that customer's next sign-in — the session stops working on its next call
and `ACCESS_ENDED` says why.

**Removing the window converts the account.** `accessEndsAt: null` leaves the
same id, the same history and everything it recorded; there is no second
account and no migration.

---

## An issued password is the administrator's until it is replaced

An account created by an administrator carries `mustChangePassword`. Until the
account holder replaces the password, the request is refused at the door with
`403 PASSWORD_CHANGE_REQUIRED` on **every route except three**:

```
GET  /v1/auth/me
POST /v1/auth/password
POST /v1/auth/logout
```

The password is one an administrator typed: they know it, it may have travelled
by email, and until it is replaced it is not evidence of who is at the keyboard.
Advisory enforcement — a banner asking nicely — would leave every other route
open, which is the whole surface.

`POST /v1/auth/password` is the moment it becomes theirs, so it is the moment
the flag is cleared and not a moment sooner. An administrator resetting a
password sets it again, because a reset is another temporary password.
`--own-password` on the CLI, and `mustChangePassword: false` on the API, are for
the case where the person typing the password is the person who will use it.

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
  `npm run user:passwd` or from the Accounts screen, and reads the new one out
  once. There is no mail transport in this system and adding one is a decision
  about a vendor, not a line of code.
- **No notice before a trial ends.** The days remaining are on the account and
  on the Accounts screen, and the refusal on the day names the date — but
  nothing reaches the customer beforehand, for the same reason: there is no
  mail transport.
- **No second factor.** The place it belongs is `POST /v1/auth/login`, between
  the password check and `sessions.issue()`.
- **No single sign-on.** The Firebase JWT path in `src/platform/auth/auth.js`
  still exists and still verifies signature and expiry, so a deployment that
  wants an external identity provider has somewhere to start.
- **Roles are coarse.** A `borrower` holds `read` over the organisation, which
  is right for the six roles as defined and wrong the day the product has an
  actual borrower portal. That is attribute-level authorisation and it is not
  built.
