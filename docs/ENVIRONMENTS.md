# Environments — production, staging, preview, local

Phase E5 of `docs/ENTERPRISE-READINESS.md` (gaps I3, I4). Which contexts
exist, what each is for, what it is held to, and how a change moves
between them.

## The four

| Context | Branch | URL | Store | Held to |
|---|---|---|---|---|
| **production** | `main` | https://carboniqfintech.netlify.app | the production PostgreSQL | `config.validate()` refuses an unsafe variable; `/health` lists problems |
| **staging** | `staging` | `https://staging--carboniqfintech.netlify.app` | its own PostgreSQL, never production's | the same refusals as production — `NODE_ENV=staging` is production-shaped |
| **deploy preview** | any pull request | `https://deploy-preview-<n>--carboniqfintech.netlify.app` | whatever the preview context is given; without a `DATABASE_URL` it refuses writes | production's feature flags, so a preview behaves like the site it is reviewing |
| **local** | a checkout | `http://localhost:3001` | memory, or a local PostgreSQL | nothing refused; `DEV_API_KEY` allowed |

`netlify.toml` carries the flags and the non-secret variables per context.
Secrets — `DATABASE_URL`, `UI_API_KEY`, `API_KEY_SALT`, `SENTRY_DSN`,
`JOBS_TOKEN`, `ANTHROPIC_API_KEY` — are set per context in the site's
environment variables, never in the file. Staging has its own values for
every one of them: a staging that shares production's database is
production with a different name.

## Enabling staging

Once, on the site:

1. Netlify → the site → **Site configuration → Build & deploy → Branches and
   deploy contexts** → branch deploys: **Let me add individual branches** →
   add `staging`.
2. **Environment variables**: for each secret above, add a value scoped to
   the `staging` branch context.
3. Create the branch: `git checkout -b staging main && git push -u origin staging`.
4. `GET https://staging--carboniqfintech.netlify.app/health` →
   `build.context: "branch-deploy"`, `build.branch: "staging"`, and
   `configured.problems` empty.

## How a change moves

```
feature branch ──PR──▶ staging ──PR──▶ main
      │                   │              │
   deploy preview    staging deploy   production deploy
```

- A pull request opens a **deploy preview** and runs CI. The `gate` job is
  green only when every job is: the suite on the memory store on two Node
  versions, the same suite on PostgreSQL with the scale test, lint, the
  type check, the dependency audit at the high level, the built frontend
  driven in a browser, and the conformance evidence — each matrix rule's
  own proving test re-run under coverage, so a rule cannot claim code no
  test reaches (`docs/CONFORMANCE-EVIDENCE.md`).
- Merging to `staging` deploys staging. It is the place to run a client's
  book through the real store before production sees the change, and to
  point an integration team at a contract before it is final.
- Merging `staging` to `main` deploys production.

## The deploy gate

Netlify deploys `main` on push. The gate is therefore a rule on the
repository, not on the platform: **require the `gate` status check before
merging to `main`** (GitHub → Settings → Branches → Branch protection rule
for `main` → Require status checks to pass → `gate`). With that rule a
change that fails any job cannot reach `main`, and so cannot deploy. The
same rule on `staging` keeps the staging site green.

`npm audit` is no longer `continue-on-error`: a high or critical finding
fails the build. `npm audit fix` cleared the two critical and eleven high
findings the tree carried; nine moderate remain in transitive
dependencies and are tracked by Dependabot's weekly pull requests
(`.github/dependabot.yml`).

## Two things the production runtime will not do

Both were found on the live site, both cost a working day, and neither is
visible from the code.

**The function environment may not exceed 4 KB.** Netlify Functions are AWS
Lambdas, and Lambda refuses to create a function whose configured environment
— the operator's variables and the ones Netlify sets beside them — is larger
than 4,096 bytes. The deploy fails at function creation and the site carries
on serving the previous build, so the symptom is that a merged change does
not appear. `config.validate()` now estimates it and `/health`
`configured.warnings` names the largest variables before a deploy hits the
ceiling. A warning, never a refusal: the first version refused on it, counted
the runtime's own variables, and took every route down. `docs/DATA-LAYER.md`
carries the full account and what to move.

**Netlify Blobs does not resolve in this function runtime, so do not select
it.** `STORAGE_BACKEND=blobs` is a legitimate setting and the adapter is
sound, but on this site it does not reach a store. The evidence: a healthy
deploy with all three functions created, `STORAGE_BACKEND=blobs` set on the
production context, and every write still refused — `blob-store.js`
`isAvailable()` resolving false, which is what it is built to do rather than
assume a store it cannot reach. The mechanism was not established; what is
established is that the setting does not produce a working store here.

That is a second reason for the rule `auto` already follows: **the store is
PostgreSQL, provisioned by the operator, and `DATABASE_URL` is what a
deployment needs.** Blobs is not a shortcut around provisioning one.

## What each context answers on /health

`build.context` says which context is running; `build.branch` which
branch; `build.commit` which commit. `configured.problems` lists, by
variable name, anything a production-shaped context cannot run safely
with. `storage.mode` and `jobs.mode` say which store and which queue. A
staging that reads `storage.mode: "memory"` has not been given its
database.
