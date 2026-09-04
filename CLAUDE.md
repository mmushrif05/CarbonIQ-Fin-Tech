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
services/desk/              Fund Desk — the bank-facing read over the capital book and the GCF pipeline
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
| `GET` | `/v1/desk/position` | The Fund Desk — the book a committee reads, over the capital book and the GCF pipeline at once |
| `GET` | `/v1/desk/candidates` | What is waiting — the gate, the two rankings, the structure and the barrier it leaves standing |
| `GET` | `/v1/desk/readiness` | Year end — outstanding disclosure items, entity facts, Concept Note inputs |
| `POST` | `/v1/desk/scenario` | If these were written — funding, shortfall and the three impact figures. A read; stores nothing |
| `POST` | `/v1/desk/adopt` | Put a GCF candidate on the capital book, carrying the link, the frozen gate answer and the pledge |
| `GET` | `/v1/capital/dashboard` | The anchor's position, capital, emissions, pipeline and forecast |
| `GET` | `/v1/capital/basket` | What writing a selection of pipeline projects would do |
| `POST` | `/v1/capital/compute` | The dashboard and basket from the book **as the reader adjusted it** — stores nothing |
| `GET` | `/v1/capital/book` | The effective base book, for the adjust drawer to edit against |
| `GET/POST` | `/v1/capital/portfolios` · `/investments` · `/payments` | The capital book |
| `GET/POST/DELETE` | `/v1/gcf/pipeline` | GCF candidate projects — every figure carrying its evidence tier |
| `POST` | `/v1/gcf/pipeline/adopt` | Copy the shipped illustrative pipeline into this organisation, to edit |
| `GET` | `/v1/gcf/emissions` | The pipeline on three boundaries that never merge |
| `GET` | `/v1/gcf/ndc` | Contribution against NDC 3.0 — two ledgers, never summed |
| `GET/PUT` | `/v1/gcf/entity` | The facts only the reporting entity can state |
| `GET` | `/v1/gcf/report` | SLFRS S1/S2 and GRI lines, with what it could not state |
| `GET/POST` | `/v1/gcf/export` · `/import` | A period package, checksummed and verified on the way back |
| `GET` | `/v1/gcf/screening` | The accreditation gate — eligible, flagged, excluded |
| `GET` | `/v1/gcf/ranking` | Two ranked lists, on the reader's weighting |
| `GET` | `/v1/gcf/recommendation` | Which two, why, and what could not be weighed |
| `GET` | `/v1/gcf/instruments` · `/instruments/:id` | Seven structures, and the pipeline's mandate gap |
| `GET` | `/v1/gcf/cn/:id` | Concept Note input package — JSON, PDF or Word |
| `GET` | `/v1/gcf/conformance` | ToR clause → implementation → proving test |
| `GET` | `/v1/gcf/reference` | Results areas, IRMF core indicators, NDC 3.0, instruments |
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

### The GCF pipeline (`services/gcf/`, `data/gcf/`)

Built for DFCC Bank's post-accreditation work under Board decision **B.36/10** — Lot 1 Milestone 4 (sustainability reporting, whose stated gap is *"lack of proper systems and procedures to capture data"*) and Lot 2 (screening a pool down to **up to two** Concept Notes). Entirely separate from PCAF: nothing here is a financed or an insurance-associated emission.

**The record is the spine (`services/gcf/record.js`).** One record per candidate, read by the pipeline screen, the emissions model, the disclosure and the Concept Note export, so nothing is re-keyed and no two views can disagree. Four rules live in the schema rather than in convention:

*A bare number is refused.* Every figure is `{value, tier}` where tier is **measured · modelled · benchmark · declared**. Without that a benchmark grid factor becomes a measured fact by the time it reaches a submission and nothing on the page says otherwise. These are GCF appraisal classes and are deliberately **not** PCAF's 1–5 data-quality scale — reusing those numerals here would invite them to be quoted as PCAF scores, the same error Part A must not make with Part C's option mapping.

*A tCO2e figure carries its baseline*, with the counterfactual and the type — **reduced, avoided or removal**. Which one applies is decided by the counterfactual, not by the engine.

*Adaptation is never ranked on carbon.* An adaptation project's mitigation is a co-benefit on its own line. `countsInHeadline` decides it once, from the stream as well as the flag, because one un-ticked box should not put a mangrove project into a carbon-per-dollar ranking that would systematically defund adaptation.

*Accreditation is a gate, not a score.* DFCC is accredited to medium size (USD 50–250m) and E&S category B/I-2, so a category A project is **excluded** rather than down-ranked — down-ranking pushes a pipeline towards projects that touch nobody. The **grant modality is not ticked** on DFCC's accreditation; the record says so and says to verify it with DFCC or the NDA, because misreading an accreditation scope would be a serious error.

**Three carbon boundaries, and the shape gives them nowhere to merge (`services/gcf/emissions.js`).** *Mitigation* is what the project achieves against a counterfactual (GCF Mitigation Core Indicator 1). *Embodied* is A1–A5 of the asset itself — a payback period against the mitigation, never a deduction from it. *Financed* emissions are not in this model at all: they are the bank's own attributed exposure on PCAF Part A attribution and they live in the capital book, and the response says that rather than leaving them quietly missing. Netting embodied against mitigation would produce a "net benefit" defined by no standard; no function returns a figure combining two boundaries and a test sweeps the roll-up for one.

GCF's own core indicator is defined over reduced, avoided **and** removed together, so the headline legitimately combines them and says where it does; the split is carried beside it because NDC 3.0 does the opposite.

**The engine checks, and never overwrites.** Where an independent path exists — generation × grid factor, annual × asset life — the figure is recomputed and the divergence reported; a mistyped emission factor is caught rather than carried into a Concept Note. Where no path exists the check reports **unverifiable with the reason**: a check that silently passes because it had nothing to check is worse than no check. A lifetime with no declared asset life shows the *implied* life rather than assuming twenty to make the arithmetic agree.

**Reduction and removal are two commitments, never one (`services/gcf/ndc-contribution.js`).** NDC 3.0 commits Sri Lanka to a 20.09% cumulative reduction against BAU over 2026–2035 and, separately, to a 4.49% increase in net removal. They are carried in two ledgers from record to output and there is no key anywhere holding their sum — including on the adaptation co-benefit footnote, which is where it was easiest to lose and where it was in fact first lost. Only the years falling **inside 2026–2035** count against a 2026–2035 commitment; counting a twenty-year asset's whole life would double the claim, so the window is applied and the operating-start assumption is printed rather than buried.

**The share of the national target is absent, not estimated.** "This project delivers X% of Sri Lanka's NDC" cannot be computed from anything held here: the targets are percentages against a BAU scenario whose absolute tonnage the Ministry of Environment publishes and this system does not hold. The share is reported absent with what it needs; supplied a BAU tonnage it is computed and carried at tier **declared**, with the caveat travelling beside it.

**A pipeline movement is not a performance movement.** Two periods cover different candidate sets, so the difference between two totals is mostly a change of book — the same trap PCAF Part C comparatives handle. The movement is decomposed into what entered, what left and what changed, and carries the note saying what it is not.

**The shipped pipeline is dummy data and says so on its face** (`data/gcf/pipeline.seed.json`): five projects, $196.5M cost, $72.0M GCF ask, both streams across five of the eight results areas. Recorded data replaces it **entirely** and is never merged with it, the discipline the capital book already follows, and every response says which is showing.

**The disclosure (`services/gcf/reporting.js`).** The same records, rendered as the lines SLFRS S1/S2 and GRI actually ask for. One rule matters more than the rest: **a pipeline of financed projects is not the bank's inventory.** SLFRS S2 §29(a) asks for the entity's own absolute gross scope 1, 2 and 3; GRI 305-5 is reduction of the *organisation's own* emissions from its own initiatives. Project mitigation is neither, and putting it on either line would report an emission the entity does not have in place of one it does. So the inventory lines are reported **absent with the clause that requires them and where the figure actually comes from**, and the pipeline is disclosed where it belongs — climate-related opportunities (§29(d)), capital deployment (§29(e)), and a separately-stated avoided-and-reduced line that is never netted against anything, as GRI and PCAF (Part A, p.126) both require.

Entity-level facts — board oversight, management's role, the strategy narrative, the risk process, the entity's own targets — are recorded by the entity at `PUT /v1/gcf/entity` or reported absent. Nothing is filled in; that is the failure `services/report-integrity.js` exists to prevent, and this module reuses it rather than restating it. The checklist is answered **from the report**, so it can fail, and the inventory item stays unmet even when every entity fact is recorded — because this report is one input to an SLFRS S2 disclosure, not the disclosure, and a checklist that could reach 100% would be claiming otherwise. It says so on its own face.

**The period package (`exportPeriod` / `importPeriod`).** The ToR asks for data that can be *transferred*, and a transfer that silently drops or reorders a record is worse than no transfer. The package carries a SHA-256 over its own **canonical** form — keys sorted at every level, so a re-serialisation of the same content hashes the same, and the export timestamp is outside the hash so two exports of identical records checksum identically. An import verifies before anything is written and is refused **whole** on any failure, because half an imported period is a position nobody can reconcile. A package is a transfer format, not an exemption: every record still has to satisfy the schema on the way in.

**Screening, and the answer Lot 2 asks for (`services/gcf/screening.js`).** A gate is not a score: a category A project is **excluded** because DFCC cannot carry it as the accredited entity, and down-ranking instead drifts a pipeline towards projects that touch nobody. A third state, **flagged**, exists because a finding is not always a verdict — a grant-dependent design is flagged with what to verify rather than struck out on this system's reading of a checkbox.

**GCF size categories are nested ceilings, not bands** — micro up to $10m, small up to $50m, medium up to $250m — so a medium-accredited entity may carry all three. An earlier lower-bound check flagged four of the five candidates for a non-issue; there is now no floor check and a comment saying why. A flag that fires on nothing is a flag readers learn to skip.

**Two ranked lists, never merged.** The adaptation ranking does not touch carbon at any point: its impact metric is beneficiaries per dollar, decided once in `metricsFor()`. One league table sorted on tCO2e per dollar puts irrigation and mangroves at the bottom every time, which is a fact about the sort key and not about the projects. **The ranking is partial and says so**: three of GCF's six investment criteria — paradigm shift, needs of the recipient, sustainable development — rest on judgements this system does not hold and are named unscored with reasons. A missing component is dropped and its weight renormalised, never scored zero, because scoring absence as zero ranks a project down for a field nobody filled in.

**Where the recorded selection and the computed ranking disagree, it says so.** They do disagree on the shipped pipeline, and that divergence is the most useful thing the model has to say: it is exactly where the unscored criteria are doing the work. Stream balance is surfaced, not enforced — GCF aims at a balanced portfolio, so a single-stream selection is a choice to defend.

**Instruments answer barriers or they answer nothing (`services/gcf/instruments.js`, `data/gcf/instruments.json`).** Seven structures, matched against barriers the project has actually recorded from one vocabulary shared by the record and the catalogue. Coverage is always reported with **what it leaves standing**, because the uncovered barrier is what kills a deal. Minimum concessionality means the engine can return **"does not need GCF support"** — an appraisal that can only say yes is a sales tool. The finding this produced: both adaptation projects rest on an outcome nobody pays for, and results-based finance, the one structure that reaches them, needs the grant modality DFCC does not hold. That is reported as a **mandate question**, not a low score.

**The Concept Note package (`services/gcf/cn-package.js`)** lays every held input out in GCF's section A–H order and marks each **held**, **partial** or **external**. It does not write the Concept Note. The external list — 19 of 63 inputs on the mangrove project — is the deliverable most people actually need: the worklist between a pipeline entry and a submission, which otherwise lives in one person's head. FPIC appears only where a project flags it and is described as a process with affected communities evidenced by its record, not a document that can be drafted for them. A package is never complete while an external input is outstanding, and the readiness figure says it measures what is held rather than how close the submission is.

**Conformance (`services/gcf/conformance.js`).** 32 rules mapping ToR clause → implementation → proving test. `npm run docs:gcf-conformance` regenerates `docs/GCF-CONFORMANCE.md` from that single source, and a test fails the build if a rule is missing from the document or the counts disagree — a doc regenerated from a stale checkout is worse than no doc, because it reads as current. `tests/gcf-conformance.test.js` fails the build when a cited file or a cited **test name** stops resolving — including a renamed test inside a file that still exists, which is exactly how a matrix goes quietly wrong. It caught a citation on the commit that introduced it, differing from the real test name by a curly apostrophe.

**The whole stack is proved end to end (`tests/gcf-journey.test.js`).** One suite walks the path a bank actually takes — record, screen, rank, structure, roll up, contribute to the NDC, disclose, package, export and re-import — and asserts the modules agree with each other. A distinctive annual figure is entered once and followed everywhere it is read, so a re-keyed or recomputed value would show. Unit tests cannot catch a disagreement between modules, and every defect here that reached a screen did so with its own unit test passing.

**The screen (`ui/pages/gcf.html`, `ui/js/gcf.js`).** Seven sub-tabs over one set of records. Three defects here were found by driving it and none by reading it: a score bar drawn on an inline `<span>` rendered as **nothing**, which reads as a score of zero rather than a missing element (`display: block`); a `<select>` sizes to its **widest option**, not its container, so one long project name pushed the page 78px wide at 430px; and the page showed its own id as its title because it was never registered in the title map. `tests/gcf-ui.test.js` sweeps the source for all three, plus the `[hidden]` guard, the token-first theme structure and the load-before-first-fetch order.

**The Fund Desk (`services/desk/`, `ui/pages/desk.html`, `ui/js/desk.js`).** The GCF Pipeline tab is the research — every record, every evidence tier, every ToR clause — and it is untouched by this work. The Fund Desk is a **second view over the same records**, shaped by what a credit committee actually asks: which projects are completed, which are financed, what the book will emit when it is fully drawn, what it carries today against the payments actually made, and what is still waiting. Seven sub-tabs of prose answered none of those in a form anyone could read in a meeting.

**The desk computes nothing, and that is a rule.** Every figure is returned by an engine that already owns it — `capital-metrics` for the money and the emissions ledger, `capital-attribution` for the per-row drawdown share, `gcf/store` for the pool. A second engine producing "the same" figure is how a screen ends up disagreeing with a report generated from the same book, and the disagreement surfaces in front of the reader who trusts it least. `tests/desk-engine.test.js` asserts the desk's totals equal the source modules' figure for figure, so the rule cannot quietly lapse.

**The join was the missing piece, not the arithmetic.** The projects lived in one store and the money in another with nothing between them. `POST /v1/desk/adopt` creates one pipeline investment from one pipeline record and writes three things **once and never again**: `origin` (which record it came from), the **screening verdict as it stood that day**, and the **pledged mitigation** — the figure, its tier and its counterfactual, frozen. Recomputing the pledge from the live record would mean every later edit silently rewrote what a committee was told, and the rewrite would be invisible exactly where it matters. `updateInvestment` accepts neither, and the ordinary `POST /v1/capital/investments` cannot assert either, so no investment can claim a provenance nobody granted it.

Adoption is **not a second gate**. An `excluded` verdict is carried, not enforced: the gate is about what DFCC can carry *as the GCF accredited entity*, and a bank may finance from its own balance sheet something it cannot take to the Fund. And no emission line is copied across — the four lines on an investment are the bank's own attributed inventory, the record's mitigation is a project-level claim against a counterfactual, and copying one into the other is exactly the merge the three-boundary rule exists to prevent.

**Two lifecycle axes, never one field.** `status` is the bank's position (pipeline · committed · deployed · exited · declined); `delivery` is the asset's own progress (`not_started` · `under_construction` · `completed`). They move independently — a facility can be exited on a plant still under construction, and a completed building can sit on the book for another decade. `delivery` lives on the investment rather than on the GCF record because the desk shows one row per investment and every financed project has exactly one; held in both places they would be two fields that can disagree. Three states and not four: an earlier draft carried `operating` beside `completed`, which for a construction facility is one fact said twice, and two labels for one state is how two screens disagree about the same project.

**Three emission claims, and never one number.** *At full commitment* is what the book will carry once every facility is fully drawn. *Carried today* is what it carries against the payments actually made, on PCAF Part A's outstanding-amount attribution. *Still to arrive* is the difference — the same emissions, not a second inventory. Reduction and avoided emissions sit outside all three, in their own card, netted against nothing (Part A, p.126), and the screen says **"Netted against the inventory: None — by rule, not by omission."**

**The renderer carries four rules.** *Never present three claims as one number.* *Never net a credit against an inventory.* *Never stack nested money* — disbursed sits inside committed and committed inside allocated, so the three share one scale rather than being laid end to end, which would count the same dollar three times. *Never let a projection look measured* — hatching means **not measured** and is the only texture on the page, carried by both the forward projection and the emissions that follow money not yet drawn. A pipeline candidate shows a **dash** and not a zero: an intention is not an inventory, and `Number(null)` is 0, which has caused three separate defects in this book already. `tests/desk-ui.test.js` sweeps the source for all of it, plus the `[hidden]` guard, `display:block` on every bar, the shrinkable `<select>`, the token-first theme structure, and the load-before-first-fetch order — the four mechanical faults this codebase has already shipped once each.

**Stages 4 to 6 sit on the same screen and compute nothing either.** `GET /v1/desk/candidates` composes `gcf/screening` and `gcf/instruments`: the gate verdict, the rank **within a stream**, the impact metric that differs by stream, the barrier the recommended structure leaves standing, and whether the record is already on the book. There is no overall rank anywhere in the payload to sort on — two projects legitimately hold rank 1, and a test asserts no `overallRank` key exists, because one merged league table on carbon per dollar puts every adaptation project last. An excluded candidate keeps its row and its reason: "considered and refused" and "never in the pool" are different facts.

`POST /v1/desk/scenario` is `capital-basket` unchanged, run over `effectiveBook()` — the same resolver the position uses, so a selection can never be modelled against a different book from the figures printed above it. It is a read: no id, nothing stored, idempotent, and a test proves the position is unmoved by having asked. `GET /v1/desk/readiness` is `gcf/reporting` and `gcf/cn-package` compressed to three counts. Nothing was removed from the GCF Pipeline tab to build any of it; a test asserts all seven sub-tabs are still registered.

**The register the screens are written in (`tests/ui-tone.test.js`).** The desk shipped with copy that explained its own design — *"the baseline is shown rather than an empty screen"*, *"the two are never mixed"*, *"a fact about the sort key, not about the projects"* — in an amber banner at the top of the page. Shown to a bank it reads as software talking about itself and invites the one question a demonstration cannot afford: what is this sentence for. The reasoning was worth keeping; it belongs in the source comments, where it now is.

The rule on screen is: **state what the figure is, cite the standard that governs it, and stop.** Illustrative figures carry a neutral pill reading *"Illustrative dataset — not client records."* — a provenance label, not a warning, because amber is for something a reader has to act on. `tests/ui-tone.test.js` sweeps every page fragment, every page module and every API `note` field that renders, with comments stripped first, for six shapes: explaining why a screen is not blank, describing the application to itself, speculating about the reader, arguing with an imagined objection, philosophising about an action, and anecdote. It also fails on a JSON field name in backticks — `dfccShare` and `completed` both reached a screen that way — on block capitals, and on any model or vendor name in user-facing copy. A separate test asserts the citations that matter (PCAF Part A p.126 and p.128, Board decision B.36/10, the PCAF 1–5 scale) survived the trim, because terse is not the same as silent.

**The Datum Solutions mark (`ui/js/brand.js`, `ui/css/brand.css`).** Defined once and rendered into `[data-brand]` placeholders in the shell: the sidebar, the login screen, and a footer that sits after every page container inside `page-content`, so it signs every page without being pasted into any of them — twenty copies drift, and the one that drifts is the page nobody opened this month. `tests/brand.test.js` fails if any page fragment or page module starts keeping its own copy of the name.

The mark is the surveyor's benchmark — a reference line with a levelling triangle standing on it — because a datum *is* a reference point, so it says the name rather than decorating it. It is geometric and inherits `currentColor`, so one asset reads on the dark sidebar and the light page alike; a second colour variant would be a second thing to keep in step. Swapping in a supplied logo file is a one-line change to `LOGO.mark`, and the module says so at the top. Two details found by driving it: an `<svg>` in a flex row needs `display: block` or it sits on the text baseline and carries the line box's descender gap, which reads as the mark being misaligned; and the space between the two words is a real space in the markup rather than a flex gap, because a gap looks identical and copies as "DatumSolutions".

**Narrow viewports (`ui/css/responsive.css`).** A sweep of every page at 430px and 360px found horizontal page overflow on nine of them, worst 439px on Portfolio. Two shapes accounted for all of it, and both are CSS defaults rather than mistakes. A grid or flex item's `min-width` is `auto`, which refuses to shrink the item below its content, so one long label sets the page width. And `repeat(auto-fit, minmax(330px, 1fr))` is 330px wide whatever the container is — `minmax(min(100%, 330px), 1fr)` keeps the intent and lets it collapse. Wide tables now always scroll inside their own container: the page must never scroll sideways, the table may. The corrections load last so they win without raising the specificity of the rules they correct, and `tests/ui-tone.test.js` pins the pattern and the load order. All twenty pages are clean at 430px and 360px.

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

**`GET /health` says which store was *asked for*, not only which is running.** It reported `"mode":"firebase"` on a deployment where `STORAGE_BACKEND=blobs` had been set, and from the response there was no way to tell whether the variable had reached the runtime at all — "the variable never took" and "Blobs is unreachable" look identical, and the first is far more common. The block now carries `requested`, `chosen`, `reason` and, where one applies, `remedy`. The key set is pinned by a test so nothing can join it without someone deciding it is safe to publish; `requested` is one of four literals and `reason` is written in the source, so neither can carry a credential.

Note that under `auto`, **Firebase takes precedence over Blobs** when it is configured. That is deliberate — flipping it would make records already written to Firebase silently invisible — but it means the Blobs work is inert on any deployment that still has Firebase variables set and no explicit `STORAGE_BACKEND`. The reason string says so.

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
- Regulator: Central Bank of Sri Lanka (CBSL).
- 4 environmental objectives (M/A/P/E); activity code format
  `{Objective}{MacroSector}.{Activity}` — e.g. `M6.3`.

**The source document is now in the repository** —
`SLGFT-Sri-Lanka-Green-Finance-Taxonomy-May2022.pdf`, with
`docs/SLGFT-SOURCES.md` recording what it actually says, quoted. Reading it
raised two claims this codebase makes that the document does not support, and
both are recorded rather than silently changed because either would alter what
an existing caller receives:

**There is no absolute kgCO2e/m² threshold anywhere in the taxonomy.** A
full-text sweep of all 26 pages returns one figure per unit area and it is
unrelated (5 W/m² power density, hydropower). The construction thresholds are
**relative or certification-based**: M6.1 renovation requires ≥30% reduction in
PED/energy/GHG; M6.3 new build requires ≥10% below a relevant nearly
zero-energy building benchmark; M6.2 acquisition requires Green SL Rated Gold
or Platinum. A relative threshold cannot be evaluated from a carbon intensity
alone.

Meanwhile `config/constants.js` carries **two different** absolute band sets —
520/780 at lines 118–125 and 600/900 at 205/220–221 — and the document contains
neither. The 600/900 set is attributed to activity `M1.1`; construction is
macro-sector **6** in the document, not 1. The 520 band is labelled "Green
(CBSL Compliant)", which asserts compliance to the regulator that decides it.

**The version string is unevidenced.** `services/certificate.js` stamps
`SLGFT v2024` onto a document carrying a SHA-256 audit hash. The document held
here is dated **May 2022**. Either a 2024 edition exists and is not in this
repository, or the string is wrong — the same class of error as the superseded
NDC targets, printed onto an audit-hashed document with nothing checking it.

**Both are now corrected against the document**, on the rule *where the document
speaks its values win; where it is silent ours stand but stop claiming to be the
taxonomy's*. Construction moved to macro-sector 6 with the document's own
criteria quoted (`M6.1` ≥30% PED reduction · `M6.2` Green SL Gold/Platinum ·
`M6.3` ≥10% below a nearly zero-energy benchmark · `M6.7` electric rail), `A2.1
Flood-Resilient Construction` became `A3.1` — **A2.1 is a financial-services
activity, affordable climate insurance** — and `M4.5` hydropower and `M4.6`
bio-energy were added with their full criteria. Solar and wind are kept with
`code: null, inSourceDocument: false`, because the document's numbering skips
M4.1–M4.4 and they are likely in the full taxonomy under codes we cannot
confirm: unevidenced, not excluded.

The 520/780 and 600/900 numbers are **unchanged** — changing them would rescore
live projects — but they are relabelled as this product's own intensity screen,
and `Green (CBSL Compliant)` is now `Green (intensity screen)`.

The certificate stamp derives from the constant, so it cannot drift from the
document again; because the stamp sits **inside** the SHA-256 hash, the verifier
reads it off the certificate with a `LEGACY_STAMP` fallback, so every
already-issued certificate still verifies. Changing a hashed field without that
is not a correction, it is destroying evidence.

`tests/slgft-source-fidelity.test.js` pins all of it to the document, PDF
checksum included. The old tests asserted the same invented codes the constants
held — the NDC failure exactly, and the reason a test only protects you if it
knows something the code does not.

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
