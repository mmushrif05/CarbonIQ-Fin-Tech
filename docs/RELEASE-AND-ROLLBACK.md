# Releasing, and getting back

Gap H0.6 of `docs/HANDOVER-GAP-ANALYSIS.md`. Until this document existed there
were no tags, no version history and no written way back from a bad deploy —
the only recovery path was Netlify's "publish deploy" button, which nobody had
written down and which does not undo a migration.

---

## What a release is

`main` is always deployable. Netlify builds every push to `main` and publishes
it. A **release** is a tag on a commit that has been deployed and observed:

```bash
npm version minor -m "Release v%s"     # bumps package.json, commits, tags
git push --follow-tags origin main
```

Semantic versioning, with the middle number carrying ordinary feature work and
the last one carrying fixes. The major number stays at 0 until the API contract
in `docs/API-CONTRACT.md` is frozen for v1 consumers.

Tag the commit **after** the deploy is confirmed green, not before. A tag is a
statement that a version ran, not that it built.

---

## Rolling back

Two things can be wrong, and they roll back separately. Establish which before
touching anything:

```bash
curl -s https://carboniqfintech.netlify.app/health | jq '{commit, storage, configured}'
```

### 1. The code is bad, the schema is unchanged

The usual case. Roll the site back without touching the database.

- **Netlify → Deploys → the last good deploy → Publish deploy.** This is
  instant and does not rebuild, so it cannot fail on a dependency.
- Then reverse the cause in git so the next push does not re-deploy it:

```bash
git revert --no-edit <bad-sha>     # a revert, never a force-push to main
git push origin main
```

Confirm with `/health` that `commit` is the version you expect. "The fix did
not work" and "the fix has not deployed" look identical from a browser, which
is why that field exists.

### 2. A migration is also involved

Migrations are forward-only in effect even though every one carries a `down`
section. Rolling a schema back **while the old code is live** is the dangerous
order. Do it in this sequence:

```bash
# 1. Put the previous build back first, so nothing is writing the new shape.
#    (Netlify → Publish deploy)

# 2. Only then reverse the schema, one migration at a time.
npm run db:status          # what is applied, pending, drifted
npm run db:rollback        # reverses the last applied migration
npm run db:status          # confirm

# 3. Verify the audit chain is intact after any schema change.
npm run db:verify-audit
```

A migration that has been live long enough for the new shape to be written is
**not** safely reversible by `db:rollback` alone — the down section drops the
column, and the data in it goes with it. In that case take a backup first:

```bash
npm run db:backup          # pg_dump archive, proved readable before it is kept
```

and treat the recovery as a restore rather than a rollback.

### 3. The deploy is fine and the configuration is not

`/health` reports `configured.problems` — the names of variables a production
deployment cannot run safely with. It never reports their values. Fix the
variable in the Netlify environment for the right context and redeploy; there
is nothing to roll back.

---

## Recovery objectives

Not yet measured, and therefore not stated. `docs/DATA-LAYER.md` records the
same position for the backup path. Do not quote an RPO or an RTO to a client
until a restore has been rehearsed against a real database and timed. That
rehearsal is gap H1.10 and is outstanding.

---

## What must be true before a release

The `gate` job in `.github/workflows/fintech-ci.yml` is the single status that
covers every check — two Node versions, PostgreSQL, lint, type check, the
dependency audit and the browser tests. It must be **required** on `main` in
GitHub's branch protection settings, which is an account-level action no code
change can perform:

> Settings → Branches → Add branch ruleset → target `main` →
> Require status checks to pass → add **gate** →
> Require a pull request before merging.

Until that rule exists, a red build still deploys, because Netlify builds from
`main` on push independently of CI.
