# CLAUDE.md — CarbonIQ FinTech

## Project Overview

CarbonIQ FinTech is a **Node.js/Express REST API** that serves as the bank-facing layer for construction carbon intelligence. It bridges the CarbonIQ core engine (Carbon-Management repo, Firebase) with financial institutions to enable green loan compliance, carbon risk scoring, and regulatory reporting.

**Key integrations:** Firebase Admin (Firestore), Anthropic Claude API (`@anthropic-ai/sdk`), Netlify Functions (production deployment).

---

## Common Commands

```bash
# Development
npm run dev          # Start server with --watch (hot reload)
npm start            # Production start

# Testing
npm test             # Jest with coverage
npm run test:watch   # Jest in watch mode

# Linting
npm run lint         # ESLint check
npm run lint:fix     # ESLint auto-fix

# Setup
npm run setup:env    # Generate .env from template
npm run setup:verify # Verify environment & Firebase connection
npm run setup:seed   # Seed demo data into Firestore
npm run setup:seed-clear  # Clear seeded demo data

# API Key Management
npm run key:create   # Create a new API key
npm run key:list     # List all registered API keys
npm run key:revoke   # Revoke an API key
npm run key:register-ui  # Register the UI dashboard API key

# Docker (local dev with Firebase emulator)
docker-compose -f docker/docker-compose.yml up
```

---

## Architecture

```
server.js                   Express entry point + /health endpoint
config/                     env config, business constants, CORS policy
middleware/                 auth (JWT + API key), rate limiting, audit logging, validation
routes/v1/                  REST endpoints (score, assess, projects, pcaf, pcaf-partc, taxonomy, covenant, portfolio, webhook)
services/                   Business logic: score engine, PCAF formatter, taxonomy, covenant, portfolio, agents
services/pcaf-partc/        PCAF Part C engine — insurance-associated emissions (pure, deterministic)
services/agents/partc/      Part C agents: intake, mapping, form builder, disclosure
data/factors/               Part C seed factor tables (versioned JSON, every row carries tier + reference)
bridge/                     Firebase + CarbonIQ core engine bridge (READ-ONLY)
models/                     Data models: api-key, covenant, webhook, taxonomy
schemas/                    Joi validation schemas for all request bodies
tests/                      Jest test suites (26 tests across 6 suites)
netlify/functions/          Serverless adapter for production (serverless-http wrapper)
ui/                         Standalone HTML/CSS/JS dashboard
scripts/                    Setup, seeding, and API key management utilities
docker/                     Local dev environment with Firebase emulator
docs/                       Architecture, strategy, scaffolding, and pivot docs
```

### API Endpoints (v1)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check — no auth required |
| `POST` | `/v1/assess` | Full project carbon assessment (AI-powered) |
| `GET/POST` | `/v1/projects` | List projects / create project |
| `POST` | `/v1/score` | Carbon Finance Score (CRS 0–100) |
| `GET` | `/v1/taxonomy` | EU/ASEAN/HK taxonomy alignment check |
| `POST` | `/v1/pcaf` | PCAF v2.0 financed emissions output (A1-A3, lending) |
| `POST` | `/v1/pcaf/part-c/assess` | PCAF Part C insurance-associated emissions (A4+A5, B1/B4/B7) |
| `POST` | `/v1/pcaf/part-c/form` | Pre-filled, policy-gated client form |
| `POST` | `/v1/pcaf/part-c/report` | Disclosure report — PDF, Word or JSON |
| `POST` | `/v1/pcaf/part-c/dq-preview` | Data-quality scoring alone — nothing persisted, so the intake form can show the score move |
| `GET` | `/v1/pcaf/part-c/factors` | Factor store transparency (tier + source per row) |
| `GET` | `/v1/pcaf/part-c/conformance` | Conformance matrix — rule → implementation → proving test |
| `GET` | `/v1/pcaf/part-c/methodology` | Methodology statement — scope, equations, factors, worked example, limits (JSON, PDF or Word) |
| `POST` | `/v1/pcaf/part-c/runs/start` | Begin a run, pause for client input |
| `POST` | `/v1/pcaf/part-c/runs/:id/resume` | Supply answers, compute, complete |
| `GET/PUT` | `/v1/partc/settings` | Insurer settings — reporting year, premium basis, restatement threshold |
| `GET/POST` | `/v1/partc/clients` | Insured parties |
| `GET/POST` | `/v1/partc/projects` | Projects with their policies inline |
| `GET` | `/v1/partc/policies` | Flattened book, filterable by reporting year |
| `GET/POST` | `/v1/partc/projects/:id/boq` | BOQ revisions (R1 tender → R2 variation → R3 as-built) |
| `POST` | `/v1/partc/projects/:id/boq/compare` | Line diff, emissions delta, restatement check |
| `GET/POST` | `/v1/partc/assessments` | Assessments bound to policy, BOQ revision and year |
| `POST` | `/v1/partc/assessments/:id/status` | Lifecycle — draft, under review, locked |
| `GET` | `/v1/partc/periods/:year` | Locked totals, coverage, emissions-weighted data quality |
| `GET` | `/v1/partc/portfolio/:year` | The reporting-year position, with the DQ improvement plan and factor gaps |
| `GET` | `/v1/partc/portfolio/:year/comparatives` | This year against last, on a basis that survives a change of book |
| `GET` | `/v1/partc/portfolio/:year/restatements` | As previously reported vs as restated, with the reason |
| `GET` | `/v1/partc/disclosure/:year` | The annual disclosure — JSON, PDF or Word |
| `GET` | `/v1/partc/storage` | What this deployment can actually persist |
| `GET` | `/v1/capital/dashboard` | The anchor's position, capital, emissions, pipeline and forecast |
| `GET` | `/v1/capital/basket` | What writing a selection of pipeline projects would do |
| `POST` | `/v1/capital/compute` | The dashboard and basket from the book **as the reader adjusted it** — stores nothing |
| `GET` | `/v1/capital/book` | The effective base book, for the adjust drawer to edit against |
| `GET/POST` | `/v1/capital/portfolios` · `/investments` · `/payments` | The capital book |
| `POST/GET` | `/v1/covenant` | Green loan covenant check / full SLL suite |
| `GET` | `/v1/portfolio` | Portfolio carbon risk aggregation |
| `POST/DELETE` | `/v1/webhook` | Webhook subscription management |

---

## Authentication

Dual-mode authentication — every request must use one of:

- **JWT** — for bank analyst portals/user sessions; validated via `middleware/auth.js`
- **API Key** — for bank system integrations; SHA-256 hashed keys stored in Firestore, validated via `middleware/api-key.js`

The UI dashboard uses `UI_API_KEY` env var (format: `ck_test_` + 32 alphanumeric chars) to bypass Firebase key registration for internal calls.

**The deployment hands the browser that key (`routes/v1/ui-config.js`).** It used to be a literal in `ui/config.js`, so changing `UI_API_KEY` in Netlify left the shipped copy behind and the app's own key check rejected its own dashboard — with *"API key is invalid or has been revoked"*, which reads as a revoked key rather than a mismatched one and cost a great deal of time to see. There is now one value: an unauthenticated `GET /v1/ui-config.js` emits what the environment holds, and `index.html` loads it after `config.js`. Drift is not possible, and no per-machine Settings step is needed.

That endpoint carries no auth because it is the request that supplies the credential for every request after it, and it exposes nothing the literal did not — a browser key is readable by whoever loads the page, by construction. What changed is that it is no longer readable by whoever clones a public repository, and rotating it is an environment change rather than a commit. The value is emitted via `JSON.stringify`, so a mis-pasted variable stays inside the string literal instead of becoming executable script; the test proves it by executing the served script. A key typed into Settings is an explicit choice and still wins — which is why `reset()` **removes** the stored override rather than writing the old default back, a reset that would otherwise reintroduce the very mismatch it exists to clear.

**`GET /health` also reports `configured: { uiKey, anthropicKey, firebase }` as booleans.** "The dashboard shows 401" and "the AI does nothing" are almost always a variable never set on this context, and from a browser neither says so — the same reason `/health` reports the running commit. Names and yes/no only; a test asserts no value can reach the wire.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Purpose |
|----------|---------|
| `FIREBASE_API_KEY` | Firebase project API key |
| `FIREBASE_DATABASE_URL` | Firestore database URL |
| `FIREBASE_SERVICE_ACCOUNT` | Base64-encoded service account JSON |
| `ANTHROPIC_API_KEY` | Claude API key for AI analysis |
| `DATA_ENCRYPTION_KEY` | 64-char hex key for data encryption |
| `JWT_SECRET` | Secret for signing JWT tokens |
| `API_KEY_SALT` | 64-char hex salt for hashing API keys |
| `UI_API_KEY` | Internal dashboard key (`ck_test_` + 32 chars) |
| `NODE_ENV` | `development` or `production` |
| `FINTECH_API_PORT` | Server port (default: 3001) |
| `ANTHROPIC_MODEL` | Main agentic loop model (default: `claude-sonnet-4-6`) |
| `ANTHROPIC_VISION_MODEL` | PDF/BOQ vision model (default: `claude-opus-4-6`) |
| `ANTHROPIC_FAST_MODEL` | Screening single-call model (default: `claude-haiku-4-5`) |

**Never commit `.env` to version control.**

---

## Claude API Skills in Use

This app uses the Anthropic Claude API (`@anthropic-ai/sdk`) with the following skills active across the agentic pipeline:

| Skill | Where | Purpose |
|---|---|---|
| **Agentic tool loop** | `bridge/agent.js` `runAgent()` | Multi-turn tool-calling loop driving all 5 agents |
| **Adaptive Thinking** (`thinking: {type:'adaptive'}`) | `bridge/agent.js` `runAgent()` | Deep reasoning on PCAF attribution, multi-taxonomy analysis, covenant stress-testing |
| **Streaming** (`.stream()` + `.finalMessage()`) | `bridge/agent.js` `runAgent()` | Prevents Netlify 10s timeout; supports 32K output tokens |
| **Prompt Caching** (`cache_control: ephemeral`) | `bridge/agent.js`, `services/extract.js` | 3 breakpoints per loop iteration (tools + system + conversation history); 60–80% input cost reduction |
| **Structured Outputs** (`output_config: {format: {type:'json_object'}}`) | `services/extract.js` | Guaranteed raw JSON from BOQ extraction — no markdown fence regex hacks |
| **Files API** (`client.beta.files.upload`) | `routes/v1/extract-upload.js` | Upload BOQ PDFs once → reuse `fileId` across multiple extractions for 30 days |
| **PDF / Vision** (document blocks) | `services/extract.js` `extractMaterialsFromPdf()` | Claude reads multi-column BOQ PDF tables directly via `claude-opus-4-6` |
| **Web Search** (`web_search_20260209`) | `services/agents/underwriting.js` | Live carbon tax rates (SG/EU/MY/HK) and green bond pricing during underwriting |
| **Web Fetch** (`web_fetch_20260209`) | `services/agents/underwriting.js` | Fetch specific regulatory pages (MAS, EU ETS, PCAF) for current compliance data |
| **`pause_turn` resumption** | `bridge/agent.js` | Resumes server-side tool loops (web search / code execution) that hit the 10-iteration limit |

### Model Routing

| Agent | Model | Rationale |
|---|---|---|
| Underwriting, Covenant, Monitoring, Portfolio | `claude-opus-4-6` (via `ANTHROPIC_MODEL`) | Complex multi-regulation reasoning; adaptive thinking enabled |
| PDF BOQ extraction | `claude-opus-4-6` (via `ANTHROPIC_VISION_MODEL`) | Best multi-column table recognition |
| Screening (single-call) | `claude-haiku-4-5` (via `ANTHROPIC_FAST_MODEL`) | Pre-computed tool results embedded in prompt; speed > depth |

### Next Skills to Add

| Skill | Target | Benefit |
|---|---|---|
| **Batch API** | Portfolio agent with large asset counts | 50% cost reduction on per-asset scoring when portfolio > 10 assets |
| **Code Execution** (`code_execution_20260120`) | PCAF financial calculations | Claude runs Python (pandas/numpy) for sensitivity tables and attribution maths |
| **Structured Outputs (Zod)** | All agent outputs | Return validated typed JSON alongside markdown memos for programmatic consumption |

---

## Key Business Domain Concepts

- **CRS (Carbon Finance Score)** — 0–100 score for construction loan risk assessment; calculated in `services/score.js`
- **PCAF v2.0** — Partnership for Carbon Accounting Financials standard for financed emissions reporting; `services/pcaf.js`
- **SLL (Sustainability-Linked Loan)** — Green loan covenants per LMA/APLMA GLP 2021; `services/covenant.js`
- **Taxonomy Alignment** — EU (2024), ASEAN (v3), HK (2024) regulatory eligibility screening; `services/taxonomy.js`
- **Pareto 80%** — The core engine pre-calculates the top 20% of materials driving 80% of emissions; this API reads those results
- **Carbon Bridge** — `bridge/` is strictly READ-ONLY from the CarbonIQ core (Carbon-Management repo); never write to core engine data through this API
- **PCAF Part C (IAE)** — insurance-associated emissions for construction policies; `services/pcaf-partc/`. Entirely separate from `services/pcaf.js` (A1-A3 financed emissions for lending). The two scopes must never merge.

### PCAF Part C scope discipline

Three tiers, enforced structurally rather than by convention:

| Tier | Modules | Where it appears |
|---|---|---|
| **Mandatory** | A4 + A5 | `result.rollup.construction` — **the PCAF figure** |
| **Optional** | B1 + B4 + B7 | `result.rollup.useStage` — separate line, policy-gated, never summed with construction |
| **Beyond-PCAF** | B2 + B5 + B8 | `result.beyondPcafAnnex` — voluntary annex, never in the PCAF figure |

`services/pcaf-partc/rollup.js` deliberately does not import `beyond-pcaf.js`, so tier 3 cannot reach the roll-up through the module graph. A test asserts this.

**Policy gate:** CAR/EAR → `use_stage_years = 0` → B1/B4/B7 are zero by scope rule (PCAF Part C v2 §5.3), not by omission. IDI/Property run the use stage over the cover period. A client-entered cover period applies *within* the gate and can never override it.

**Provenance:** every engine function returns a traced value — the figure plus its equation, inputs, factors (each with a data-quality tier and named source) and assumptions. The three registers (assumptions, data gaps, audit trail) and the data-quality score are derived from that tree, so they cannot contradict the arithmetic.

**Language guard:** output claims PCAF *conformance*, never endorsement. `containsForbiddenLanguage()` blocks any report containing "PCAF approved/endorsed/certified"; a test enforces it.

**Division of labour:** Claude classifies, extracts, maps BOQ lines and writes narrative. The engine does every arithmetic operation. An LLM must never compute a figure that reaches a regulatory disclosure.

**The insurer's book (`services/partc-registry.js`):** organisation → client → project, deliberately flat — no broker, reinsurer or class-of-business level. Policies live on the project because one building typically carries CAR through construction and then IDI for ten years. The reporting year of a policy is its **inception year**. Cover basis is project-specific only; annual/blanket is deferred.

**PCAF Part A (financed emissions) — planned, not built.** `docs/PCAF-PART-A-SOURCES.md` holds the working reference: the Chapter 6 reporting requirements extracted from PCAF's **Disclosure Checklist (May 2025)** with page cites, the avoided-emissions and forward-looking-metrics supplement (Dec 2025), and a list of what is still missing. The **Third Edition (2 Dec 2025)** expands Part A from seven to ten asset classes and adds Use of Proceeds, Securitizations, Sub-Sovereign Debt and IFRS-aligned undrawn commitments; the DCL we hold predates it and still says seven. The **Third Edition is now in the repository** (`PCAF-PartA-2025-V3-15012026.pdf`) and `docs/PCAF-PART-A-BUILD-SPEC.md` holds the Chapter 5 study and the module structure. **The finding that matters most: Part A's option-to-score mapping is not uniform across asset classes** — Option 2b is score 2 in one class and score 3 in another, Option 3 is score 3 in one and score 4 in another. There is therefore no global option→score lookup; the score resolves as **(asset class, option) → score** from a table per class. Reusing Part C's `2b = 3` here would be wrong for some classes, silently. Also: the six original asset classes carry the *Built on GHG Protocol* mark, but the second- and third-edition additions **have not been reviewed by the GHG Protocol**, so a conformance statement must not blur the two. Two more things not to get wrong: Part A weights the disclosed data-quality score by **outstanding amount** (p.128) where Part C weights by **premium**, so the two engines must not share a weighting function; and avoided emissions are reported **separately** from the scope 1/2/3 inventory and never netted against it (p.126). When Part A is built it goes in `services/pcaf-parta/`, separate from `services/pcaf-partc/` — three scopes, never merged. `services/pcaf.js` currently labels attributed embodied carbon as "PCAF v3" output; once Part A exists properly that file must stop claiming to be PCAF.

**Report honesty (`services/report-integrity.js`):** a disclosure contains exactly three kinds of statement — **measured** (computed from data held here, and traceable to it), **declared** (a fact only the reporting entity can know), and **absent** (required by the standard, not available). The portfolio reports in `services/reports.js` used to emit the first and third as though they were the second: the scope 1/2/3 split was the financed-emissions total × 0.08 / 0.14 / 0.78, printed under GRI 305 and IFRS S2 §29; TCFD carried a board meeting quarterly, a three-person ESG team reporting to the CRO, a $340M pipeline and 12% of the book in flood zones; the CBSL disclosure asserted `'Compliant'` to the regulator that decides compliance; and the PCAF checklist hardcoded every item `met: true`, including the scope breakdown that was only "present" because it had been invented.

Entity-level narrative now comes from `entityDisclosures` or is reported absent with the clause that requires it. Financed emissions are **scope 3 Category 15 in full** — the old split put 85% in Category 1 and 5% in Category 15, inverting the most material line in a lender's inventory. The checklist is answered from the report rather than asserted, so it can fail. Every report carries a `gaps` list of what it could not state, and is never called complete while an item is unmet. A report built without a portfolio is stamped **SAMPLE DATA** on its face, because a document citing a standard must not let a reader assume the figures are theirs. `tests/report-integrity.test.js` sweeps the source for the removed constants rather than trusting the paths a feature test happens to walk.

**The anchor dashboard (`services/capital-*.js`, `ui/js/dashboard.js`).** The Dashboard is the capital book: portfolios, investments, payments, and the four emission lines against each. It is deliberately **not** connected to Firebase — the baseline lives in `data/capital/book.json`, deep-frozen and read once, because a demonstration book has no business depending on a network round trip and every change to it is then a reviewable commit. If an organisation has recorded anything of its own, its records win **entirely** and the baseline is not read; the two are never merged, and the payload says which is showing.

Attribution is PCAF Part A's: outstanding ÷ (project equity + debt). The stored figures are at full commitment, so `attributed = stored × (outstanding ÷ commitment)`. `services/capital-attribution.js` exists as its own module because the roll-up *and* the forecast both need it — when only the roll-up knew about attribution, the curve was drawn from unattributed figures and stopped adding up to the total printed above it, which is the one thing a curve must never do.

**The curve obeys four rules, and each is a way to draw a confident line that is wrong.** *Never net* — emissions, reduction and avoidance are three separate series drawn to the zero baseline; PCAF reports avoided emissions apart from the inventory and never against it (Part A, p.126), so there is no stacking, no crossing point and no combined total in the renderer. *Never let a projection look measured* — every year is ahead of today, so the whole plot is hatched (the only texture in the system, and it means projection), today is marked, and the year past which a figure is a direction is drawn on the plot. *Never call a scenario a plan* — the assumptions print underneath, so a screenshot carries them. *Never hide the shape you assumed* — the phasing profiles in play are named beside the figures. A peak year is only claimed when nothing else comes within 2% of the top; a shared top is reported as the range it is, because naming the first of nine level years is a fact about which way the reduce ran.

**The basket (`services/capital-basket.js`)** answers what the ranking cannot: if we wrote these three, what changes? Affordability is asked of the *selection* — five individually affordable candidates need not be affordable together — so it is set against uncommitted allocation and a selection that does not fit reports a **shortfall**, never a negative remainder. Both sides of the scenario run on the **commitment** basis whatever the dashboard is displaying, and that is the whole reason it says anything: attribution on outstanding scales a project by what has been drawn, and a facility written this morning has drawn nothing, so on that basis the curve does not move by a tonne and a reader would take "this changes nothing" from a chart that had simply not been asked the question. Holding the basis constant across both runs is the discipline the BOQ comparison already follows. The scenario shares the chart's horizon and grid trajectory, because both series are plotted by index against one year axis and a mismatched length would run the dashed line off the plot.

**The assumptions are controls, not caveats.** Horizon, drawdown pace and grid trajectory each name the figure they move, and the default horizon is stated as the book's own span rather than left blank. Only a changed assumption is sent, so an untouched one is answered by the engine's own default rather than asserted by the browser. They are held in the browser and never on the book — an assumption is one reader's question, and writing it down would make one person's stress test everybody's baseline — and returning to the defaults **removes** the stored override rather than writing the defaults back.

**The dashboard is adjustable, and an adjustment is neither a question nor a record (`services/capital-adjust.js`, `ui/js/capital-adjust.js`).** The weighting, the basis and the three forecast assumptions are *questions*; a portfolio, an investment and a payment are *records*. A changed allocation is a third thing: a value held by one reader, applied over the book on the way into the engine and never written down. `POST /v1/capital/compute` takes that overlay and returns the dashboard and the basket derived from the adjusted book — a read, storing nothing, issuing no id, idempotent. That is what makes the whole screen adjustable on a deployment that can persist nothing, which is the deployment it is shown on.

Three rules. **The engine still does every calculation** — the overlay changes inputs and nothing else, and a test asserts an unadjusted compute equals the ordinary dashboard figure for figure. **An adjusted figure is never presented as a recorded one** — the response is marked, the count travels with it, edited inputs carry the scenario indigo, and an unadjusted screen carries no mark at all, because a badge that is always on is a badge nobody reads. **An overlay can only change what exists** — it cannot invent a portfolio or an investment, an id matching nothing comes back named, and a field outside the allowed set is ignored rather than written. Payments are *added* rather than edited, because a payment is an event and the honest way to model "what if we drew another $25M" is another event.

**Two UI traps, both found by driving and neither by reading.** `[hidden]` is `display: none` from the user-agent sheet and **any class rule that sets `display` beats it** — the drawer covered the page from load while its markup said hidden. And **anything that changes what the first request says must be loaded before that request is sent**: the overlay was read when the drawer initialised, which was after the first fetch, so adjustments vanished on reload. That is the fourth instance of the same shape in this codebase; `_asmLoad()` and `CapitalAdjust.init()` now both run before `_fetchCapital()`.

**One validator for the questions.** `readOptions()` in `routes/v1/capital.js` is shared by `/dashboard`, `/basket` and `/compute`. The same rules in three places were three chances for one to drift, and one already had — the basket accepted assumptions the dashboard validated differently.

**`Number(null)` is 0, and 0 is finite.** This has now caused three separate defects in this area: a pipeline project stored at 0% return and ranked on it, a blended return dragged down by a project nobody had priced, and — via `Math.round(null)` and a default parameter that only covers `undefined` — a ten-year drawdown series collapsed to one year, reporting $66.3M as the whole of $199M. Absence is checked before the number is, everywhere in this book. Every one of these reached the screen with its unit test passing, because the test called the function directly where the default did apply.

**Storage honesty (`services/partc-store.js`):** Firebase is the real store. Without it there is an in-process fallback for local development, but in a serverless runtime (Netlify) that fallback cannot work, so writes are **refused with a 503** rather than accepted and lost. `GET /v1/partc/storage` reports the active mode.

**BOQ revisions (`services/partc-boq.js`):** a bill of quantities is never final, so each project holds a series of revisions and an assessment binds to exactly one. A revision inherits the previous revision's factor mappings, stable ids and haul distances, so only genuinely new lines need review. Match keys deliberately **ignore the quantity** — a revision exists because quantities changed, so keying on raw text would mean a line never matched its own earlier self. Matching is exact after normalisation rather than fuzzy: binding the wrong factor to the wrong material would corrupt a disclosure silently, so unmatched lines are flagged for review instead.

**Restatement:** comparing two revisions holds every non-BOQ input constant, so the movement is attributable to the BOQ alone. A movement reaching the settings threshold (default 5%) requires restating a locked assessment. Because A5.2 site energy is typically 90%+ of the construction figure, material quantity changes move the total very little — the comparison therefore explains *why* the figure moved as it did, rather than leaving a user wondering whether their variation order registered.

**Assessments (`services/partc-assessments.js`):** one calculation bound to a policy, a BOQ revision and a reporting year — the binding is what lets a figure in an annual disclosure be traced to the bill of quantities behind it. Lifecycle is `draft → under_review → locked`; only a locked assessment enters the disclosure, and a locked assessment is never edited, only superseded by a new version. Where a new version moves a locked figure by at least the settings threshold it is a **restatement** and a reason is required. Locking one version automatically supersedes the previously locked one, so a policy-year never has two.

**The annual disclosure (`services/partc-disclosure.js`):** the document published for a reporting year, built from locked assessments only. A year holding none is **refused with a 409** rather than rendered as a position of zero — an empty disclosure would read as "we insured nothing carbon-intensive", which is a different claim from "we have not measured yet". Coverage sits in section 3, not an annex, because a total drawn from a fifth of the book means something different from one drawn from all of it. Annex C records the assessment, version, BOQ revision and lock behind every row in the per-policy table, so a reader can follow any disclosed number back to the bill of quantities.

**Comparatives (`services/partc-comparatives.js`):** because a policy's reporting year is its inception year, each year covers a *different set of policies* — two annual totals are measurements of two different books, not two measurements of one thing. Presenting their difference as a reduction would be false. The movement is therefore reported as fact alongside the note that it is not on its own a change in performance, and **intensity (kgCO2e/m² insured)** and the emissions-weighted data-quality score are given as the measures that survive a change of book. Where a prior year has been restated, the comparative is carried on **both** bases — as previously reported and as restated — with the reason recorded at lock time.

Every API key belongs to the insurer's own organisation — there is no client-facing login — so "only the insurer locks" holds by construction rather than by a role check; the organisation is recorded on the lock either way. Period totals weight data quality by emissions, as PCAF requires, so a small weak policy cannot drag the reported position beyond its share.

**The methodology statement (`services/partc-methodology.js`):** the other half of a disclosure — the scope rule applied, every equation executed, every factor with its tier and named source, how data quality is scored and aggregated, which rules are claimed and what proves each, and the declared limits. Reachable without running an assessment, because a reviewer asked to accept a figure should be able to read the method first.

Every equation, input and factor in it is **extracted from an execution of the engine**, not transcribed alongside it. A hand-written methodology drifts from the code as soon as either changes, and the drift is invisible exactly when it matters — under review. A test asserts that every documented equation appears in the executed trace, so the document cannot describe an equation the engine does not run. On screen the equation and what each module does stay visible; only the step-by-step trace collapses.

**Data quality — one score per project, by option (`services/pcaf-partc/data-quality.js`, `dq-scoring.js`):** PCAF assigns a single score to a project and decides it by **which option was used to estimate the emissions** (Table 5.3-2, p.58): `1a=1, 1b=2, 2a=2, 2b=3, 3a=4, 3b=5`. It is **not an average** — not across inputs, not across modules, not across lifecycle stages. A BOQ-driven calculation is declared construction quantities × emission factor, so the Fisheries run is **Option 2b, score 3**. The option is inferred from the data the run actually consumed, with an explicit override honoured for an insurer holding data this system never received. An EPD improves the emission factor; it does **not** reach Option 1, which requires emissions reported by the insured.

**The scale has a direction, and the direction is the point.** 1 is the highest quality, 5 the lowest. A score is a category, never a mark out of five: written `3 / 5` it reads as a fraction and inverts the meaning for anyone who has not opened the standard. Every rendering is `Data quality score: 3 (Option 2b)` with the scale stated beside it, and `tests/dq-rendering.test.js` sweeps the whole source tree for the inverted form rather than trusting the paths a feature test happens to walk.

**The use stage is never scored.** Table 5.3-2 covers construction emissions; PCAF publishes no data-quality table for optional lifetime emissions on project insurance. `useStageBasis()` therefore returns a reason and a set of qualitative statements and **no number at all** — a figure invented to fill that gap would be read as a PCAF score, which is worse than the gap.

**Across a book the disclosed score is premium-weighted** (Box 6-3, p.107): Σ(premium × score) ÷ Σ(premium), reported to two decimals, with **ceded premium** substituted for treaty reinsurance (Box 6-4, p.108). There is no emission-weighted score anywhere to be quoted by mistake. A policy carrying no score is excluded from the weighting rather than counted as zero. The insured's **scope 3 score is reported separately from its scope 1 and 2 score** (p.106) — they genuinely rest on different data: site energy on energy consumption (Option 2a), everything else on declared quantities (Option 2b). Annual-basis CAR/EAR and IDI are scored against the commercial-lines table instead (Table 5.3-3) and capped at 4, since PCAF removed score 5 from it.

**The per-input table survives as an internal aid, in words.** Strong, Moderate or Weak — never 1–5 — labelled *"Internal transparency aid — not a PCAF data quality score"*, never averaged, never exported as a score. It responds to whether an actual or a benchmark was used, so it points effort at the weakest evidence; the PCAF score itself does not move when an input is strengthened, because the option has not changed, and the UI says so rather than implying a number will shift.

**A document is never streamed to a response (`services/pdf-response.js`):** it is collected in full, checked to be a well-formed PDF — header, cross-reference pointer, end-of-file marker, plausible length — and sent as a buffer with an explicit `Content-Length` and `Cache-Control: no-store`. Every "the PDF is empty" report this project has had came from the delivery path rather than the drawing, and none of them announced itself: the browser saved a file with the right name and it would not open. A truncated body can no longer look complete, a broken response cannot be re-served from a cache after the cause is fixed, and a document that fails the check becomes a 500 rather than a quiet bad download.

**A file never declares a version older than what it contains.** The cover watermark was drawn with constant alpha — a PDF 1.4 feature — in a file pdfkit headed `%PDF-1.3`. Lenient viewers render that anyway; strict ones (Acrobat) are entitled to refuse it, which reads as a blank page. The watermark is now a pre-blended solid (`partc-theme.js` `blend()`), the document declares 1.4, and a test asserts the declared version covers every feature present.

**`GET /health` reports the running commit.** "The fix did not work" and "the fix has not been deployed" look identical from a browser, and the second is far more common; Netlify's `COMMIT_REF` settles it in one request.

**Downloads are bytes, not text:** `netlify/functions/fintech-api.js` names the binary content types for serverless-http. Without that list Lambda hands the body back as a UTF-8 string, every byte above 127 is re-encoded, and a 34KB PDF arrives as 63KB that downloads but will not open — which reads to a user as an empty file. `services/partc-docgen.js` `winAnsiSafe()` patches each pdfkit document so text outside WinAnsi (Σ, −, →) is transliterated rather than drawn as mojibake; the standard-14 fonts cannot encode it.

**An unavailable agent says why (`services/agents/ai-status.js`, `middleware/require-ai.js`):** the Anthropic SDK's message for a rejected key is `401 terminated`, which names neither the cause nor the fix; reaching the browser as `{"error":"ERROR","message":"401 terminated"}` it reads as an agent that simply did nothing. A key that is absent or does not have the shape of an Anthropic key is now refused **before** the call, in milliseconds, and a call that does fail is classified — `key_rejected`, `forbidden`, `model_unavailable`, `rate_limited`, `overloaded`, `timeout`, `network_blocked` — with the remedy and the list of endpoints that still work without the AI layer. `GET /v1/agent/health` reports the same diagnosis for all nine agents on demand, `?probe=1` proving it with a live one-token call. The failure is also visible on screen rather than only in a response body, and a mapping that fails **clears the table** instead of leaving the demo rows standing — stale rows after a failed upload are what made the agent look static.

**The report standard (`services/partc-report-standard.js`):** every document the application generates — the per-assessment report and the annual disclosure alike — is built from **one content model** in the order PCAF's Part C disclosure checklist reads, and rendered to PDF and Word by **one renderer**. Two templates would let a requirement satisfied in one document go quietly missing from the other.

Section order is the checklist's, not ours: cover · scope and coverage · gases and units · absolute emissions · methodology · data quality · recalculation and significance · emission intensity · limitations · conformance · annexes. Sections are numbered as they are written, so an absent memo never leaves a gap that reads as a withheld section.

**Two cuts of the same figures.** A4/A5 and B1/B4/B7 are *lifecycle stages*; scope 1, 2 and 3 are *ownership boundaries*. `services/pcaf-partc/ghg-scopes.js` maps each stage to a GHG scope **once**, and both the emissions split and the data-quality split read that map — declaring it twice is how a report states a total in one section its own data-quality section contradicts. A5.2 site energy is the insured's scope 1 and 2 (diesel and grid, combined, which is the form the checklist asks for); A4, A5.1, A5.3 and B7 are its scope 3; B1 and B4 are fugitive scope 1. Every figure remains the **re/insurer's own scope 3** — that is what an insurance-associated emission is — and the report says so wherever the split appears.

**Two weightings, never blended.** PCAF Part C requires the **disclosed** data-quality score to be weighted by *outstanding premium* (`services/partc-portfolio.js` `_premiumWeighted()`); the **emission-weighted** score survives beside it as the internal diagnostic, labelled as one, because it answers a different question — which module to go and fix. The insured's scope 3 score is reported apart from its scope 1 and 2 score. A policy carrying no score is excluded from the weighting rather than counted as zero, and the count of what was excluded travels with the score.

**Recalculation is a "shall", not a preference.** Base year, significance threshold and recalculation triggers live on the reporting entity's settings (defaulted to the GHG Protocol Scope 3 triggers) and are printed in every report. Where no base year has been set the report says so rather than implying the current year — a base year is a claim about history and belongs to the entity, not to its software.

**The completed checklist (`services/partc-checklist.js`):** a self-assessment against the disclosure requirements of Part C Chapter 6, answered from the same facts the sections render, so an item cannot answer Yes to something the document does not contain. Anything but Yes carries its reason. The item wording is CarbonIQ's and the governing clause is printed beside each, so a reviewer can check every answer against the published standard; it is **not** a reproduction of any form PCAF publishes, and the annex says so on its face.

**Visual language (`services/partc-theme.js`):** palette, serif section titles, caps sub-heads, green section bands and sage table headers, sampled from PCAF's published documents so a disclosure does not look like a different kind of document beside the standard it cites. Consistency, never impersonation: the PCAF logo is never reproduced, the mark on the page is Datum's, and the PCAF name appears only in the conformance statement and citations. Fonts are open-licensed faces (Lora, Work Sans — OFL, vendored under `assets/fonts/`) chosen to match the observed system, not PCAF's licensed fonts. A glyph the active face cannot draw is substituted for one that means the same thing before it is spelled out — Greek sigma becomes the n-ary summation sign, not a hollow box.

**Conformance evidence:** `services/pcaf-partc/conformance.js` maps every rule to the code that enforces it and the test that proves it. `tests/pcaf-partc-conformance.test.js` fails the build if a rule cites a file or a test that does not exist, so the claim cannot rot. `npm run docs:conformance` regenerates `docs/PCAF-PART-C-CONFORMANCE.md` from that single source.

---

---

## Sri Lanka Green Finance Taxonomy (SLGFT)

The Sri Lanka work is on `main` as of the merge of `claude/srilanka-taxonomy`.

**Key facts**
- Regulator: Central Bank of Sri Lanka (CBSL). Version SLGFT v2024.
- 13 SLSIC sectors (A–M), 4 environmental objectives (M/A/P/E).
- Activity code format: `{Objective}{MacroSector}.{Activity}` — e.g. `M1.1`.

**Embodied carbon thresholds (construction)**

| Band | Threshold |
|---|---|
| Green | ≤ 600 kgCO2e/m² |
| Transition | ≤ 900 kgCO2e/m² |
| Not aligned | > 900 kgCO2e/m² |

**NDC targets — NDC 3.0, issued September 2025** (`data/gcf/ndc3.json`). Two **separate** commitments over **2026–2035**, never summed: a **20.09%** cumulative GHG reduction against BAU (8.11% unconditional, 11.98% conditional), and a **4.49%** increase in net carbon removal (0.96% / 3.53%). Six mitigation sectors, nine adaptation sectors, loss and damage cross-cutting. Key SDGs: 7, 9, 11, 13, 14, 15; GESI applies across all NDC actions.

This replaced the 2021 NDC (4.5% / 14.5% by 2030, net zero 2050) that seven source files and three test files were still citing — including the Green Loan Certificate, which printed them onto a document carrying a SHA-256 audit hash. Nothing announced the drift, because the tests asserted the same superseded figures the code produced. `tests/ndc3-currency.test.js` now sweeps the whole tree, and permits the old figures only on a line that marks them as superseded. **NDC 3.0 states no net-zero year**, so none is asserted — an absent commitment is reported absent rather than carried forward.

**Where it lives**
- `services/ndc-sdg.js` — Claude-powered NDC/SDG alignment analysis
- `services/certificate.js` — Green Loan Certificate with a SHA-256 audit hash, and its verifier
- `services/taxonomy.js` — `checkSriLanka()` and `checkAllTaxonomies()`
- `routes/v1/ndc-sdg.js` — assess, certificate, certificate/verify, framework
- `ui/pages/ndc-sdg.html` · `ui/js/ndc-sdg.js` — the NDC/SDG screen

**Two Sri Lanka report types, deliberately kept apart.** `slgft-cbsl` is the CBSL Direction 05 / SLFRS S2 disclosure; `slgft` is the fuller taxonomy report carrying NDC contribution, SDG alignment, DNSH and SLCCE carbon-pricing exposure. They were built in parallel on two branches and answer different asks, so both ids remain addressable — folding one into the other would silently change what an existing caller receives.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/ndc-sdg/assess` | NDC and SDG alignment for a project |
| `POST` | `/v1/ndc-sdg/certificate` | Generate an SLGFT Green Loan Certificate |
| `POST` | `/v1/ndc-sdg/certificate/verify` | Verify a certificate against its audit hash |
| `GET`  | `/v1/ndc-sdg/framework` | SLGFT framework metadata |

## Code Conventions

- **Validation:** All request bodies are validated via Joi schemas in `schemas/` before reaching route handlers; use `middleware/validate.js`
- **Error handling:** Centralized in `middleware/error-handler.js`; throw structured errors with `statusCode` and `message`
- **Audit logging:** Compliance-sensitive operations log via `middleware/audit.js`
- **Rate limiting:** Configured per API key tier in `middleware/rate-limit.js`
- **Feature flags:** Use `FF_*` env vars (e.g., `FF_COVENANT_ENGINE`) to gate incomplete features
- **AI agents:** Claude API usage lives in `services/agents/`; uses `@anthropic-ai/sdk`

---

## Testing

```bash
npm test             # Run all tests with coverage
npm run test:watch   # Watch mode for TDD
```

- Test files live in `tests/`
- Setup/mocks in `tests/setup.js`
- Coverage thresholds: branches 22%, functions 29%, lines/statements 43%
- Uses `supertest` for HTTP integration tests against the Express app

---

## Deployment

Production deploys as a **Netlify Function** via `netlify/functions/fintech-api.js` (serverless-http adapter wrapping Express).

**Where it lives.** Netlify site `carboniqfintech` (team plan: Pro, so the 26-second
function timeout in `netlify.toml` is available). The application is served from
**https://carboniqfintech.netlify.app** — that is the URL to give anyone who needs to
see it. `carboniq.online` is the *core* platform (the Carbon-Management deployment)
and no longer answers; nothing in this repo should point at it. The two calls that
reach the core engine read `CORE_APP_URL`.

- Config: `netlify.toml`
- All `/v1/*` and `/bank/*` routes redirect to the function
- CI/CD: `.github/workflows/` pipelines handle automated testing and deployment

---

## Documentation

| File | Contents |
|------|---------|
| `docs/ARCHITECTURE.md` | Full bank-facing product architecture (CRS, PCAF, Taxonomy, Covenant) |
| `docs/SCAFFOLDING.md` | 17-step build plan |
| `docs/STRATEGY.md` | FinTech Innovation Lab APAC 2026 strategy |
| `docs/PIVOT_ANALYSIS.md` | Green finance pivot analysis |
| `docs/FILAP_2026.md` | FILAP 2026 repositioning |
| `CARBONIQ-FINTECH.md` | Detailed product documentation |
