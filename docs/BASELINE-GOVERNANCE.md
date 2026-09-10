# Baseline governance

**PCAF sets the method. It does not set Sri Lanka's baseline.**

Someone credible and in-region has to, and that position is only worth
something if the figure cannot be moved quietly. If one institution can change
its number without a recorded reason, every number in the market becomes
negotiable — so baseline governance is a market-integrity rule here, not a
feature, and this document is the rule.

## What a baseline is

A **governed value for a metric, scoped and versioned.** Bands for a carbon
intensity screen; a grid emission factor; a data-quality ambition. The metric
decides the shape of the values and what in the product reads it, and the
vocabulary is closed (`src/domains/baseline/domain/metrics.js`) — a metric
nobody reads yet is declared **provisioned** and says so, rather than being
invented into the seed with numbers no one can defend.

The rule that decides whether a figure belongs here at all:

> Where a published standard sets the figure, the standard's value wins and
> this holds only the citation. Where no standard sets one, the figure is
> regional judgement, and this is where it lives.

The Sri Lanka construction bands are the second kind. The taxonomy held in
this repository sets **no absolute kgCO2e/m² figure anywhere** — its
construction criteria are relative (M6.1 ≥30% PED reduction, M6.3 ≥10% below a
nearly zero-energy benchmark) or certification-based (M6.2 Green SL Gold or
Platinum). The bands are this product's own screen, which is exactly why they
have to be governed rather than hardcoded.

## The four rules

**A baseline is scoped, and the scopes nest.** `global` → `country` →
`organisation`. The most specific released baseline wins, and the resolution
always says which one it was. A country figure is the market's: every
institution on the deployment resolves against it. An organisation's own is
that institution's, and beats the country figure for that institution alone.

**A baseline says whether it is real.** The shipped seed
(`data/baselines/seed.json`) is `provisional` — enough for the product to run
and be demonstrated before an operator has released anything, and marked on
its face wherever it is read. A released baseline is not provisional. **The two
are never merged**: a released figure replaces the seed entirely for that
metric and scope, the same discipline the capital book and the GCF pipeline
already follow.

**A released baseline is immutable.** Editing one in place rewrites what
somebody was told and leaves no trace. A change is a **new version** that
supersedes the old one, carrying the previous values, the movement and a
reason. Where the movement reaches the threshold (5% by default) it is a
**restatement** and the reason is required rather than optional. This is the
Part C locked-assessment path, applied where a baseline is set.

**Absence is an answer.** Where no baseline exists for a country, the
resolution says so and names what it would need. Nothing is assumed in its
place: a number invented to fill the gap would be quoted as regional judgement,
which is the one thing this registry exists to make trustworthy.

## Who may govern what

| Act | Scope required | Why |
|---|---|---|
| Read the table, read what is in force | `read` | |
| Record a draft for **your own** organisation | `write` | your own figure |
| Release or supersede **your own** | `lock` | it enters a disclosure |
| Record, release or supersede a **country or global** baseline | `lock` **and** `admin` | it is the market's figure |

A tenant able to move the country band would move it for every institution on
the deployment. The handler asks the same resolver the route's own scope check
uses, so the two can never mean different things by *admin*.

## The lifecycle

```
draft ──release──▶ released ──supersede──▶ draft (v+1) ──release──▶ released
                       │                                                │
                       └──────────── superseded ◀───────────────────────┘
```

Releasing the next version supersedes the last one **in one transaction**, and
a unique index on PostgreSQL says the same thing a second time: a moment in
which a baseline has two released versions, or none, is a moment nobody can
reconcile a quoted figure against.

Every record carries a SHA-256 over what it says — the values, the scope, the
version, the source. Not to prove an operator honest to themselves, but so a
figure quoted in a disclosure can be traced to the exact version that produced
it and shown not to have moved since.

## The pledge

An organisation-scoped baseline carries the institution's own pledge: the
reduction it committed to, the base year, the target year, **who stated it**
and **where a reader can find it**. It is `declared` throughout — never
computed, never inferred from a trajectory. A target this product chose would
not be a commitment, and printing one as though it were is the failure
`src/shared/report-integrity.js` exists to prevent.

What *is* computed is the position: where the book stands against the pledge
today, how far is left, and the direction of travel. That is labelled
`measured`, and it says plainly when it cannot be worked out. It is
deliberately **not** a forecast — a straight line drawn through two points and
printed beside a commitment reads as a plan.

## What reads it

| Reader | Metric | Effect |
|---|---|---|
| `GET /v1/taxonomy` | `construction_intensity_kgCO2e_m2` | the green / transition / not-aligned band |
| `POST /v1/ndc-sdg/certificate` | same | the tier printed on a Green Loan Certificate |
| `GET /v1/ndc-sdg/framework` | same | the screen reported beside the framework |
| Dashboard | same | the line naming what the screened figures rest on |

**These three used to disagree.** 520/780 screened the taxonomy endpoint while
600/900 assigned the certificate tier, so a building at 560 kgCO2e/m² was Green
from one and Transition from the other — two answers to one question about what
a bank may call a green loan. There is one screen now, and every reader
resolves it from here.

Changing the bands does **not** invalidate a certificate already issued: the
audit hash covers the tier that was assigned, not the rule that assigned it.
What changes is the tier a new certificate carries, which is the correction.

## Running it

```bash
# What is in force, and why that one
GET  /v1/baselines/effective?country=LK

# The master table, every version
GET  /v1/baselines

# Record, release, restate
POST /v1/baselines
POST /v1/baselines/:id/release
POST /v1/baselines/:id/supersede    # reason required above the threshold

# The organisation's own commitment, and where it stands
PUT  /v1/baselines/pledge
GET  /v1/baselines/pledge?metric=…&currentValue=…
```

The screen is **Baselines** in the sidebar. `tests/baseline-registry.test.js`
holds the governance rules; `tests/baselines-ui.test.js` holds the screen.
