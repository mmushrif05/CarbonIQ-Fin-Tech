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
| `POST/GET` | `/v1/covenant` | Green loan covenant check / full SLL suite |
| `GET` | `/v1/portfolio` | Portfolio carbon risk aggregation |
| `POST/DELETE` | `/v1/webhook` | Webhook subscription management |

---

## Authentication

Dual-mode authentication — every request must use one of:

- **JWT** — for bank analyst portals/user sessions; validated via `middleware/auth.js`
- **API Key** — for bank system integrations; SHA-256 hashed keys stored in Firestore, validated via `middleware/api-key.js`

The UI dashboard uses `UI_API_KEY` env var (format: `ck_test_` + 32 alphanumeric chars) to bypass Firebase key registration for internal calls.

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

**Storage honesty (`services/partc-store.js`):** Firebase is the real store. Without it there is an in-process fallback for local development, but in a serverless runtime (Netlify) that fallback cannot work, so writes are **refused with a 503** rather than accepted and lost. `GET /v1/partc/storage` reports the active mode.

**BOQ revisions (`services/partc-boq.js`):** a bill of quantities is never final, so each project holds a series of revisions and an assessment binds to exactly one. A revision inherits the previous revision's factor mappings, stable ids and haul distances, so only genuinely new lines need review. Match keys deliberately **ignore the quantity** — a revision exists because quantities changed, so keying on raw text would mean a line never matched its own earlier self. Matching is exact after normalisation rather than fuzzy: binding the wrong factor to the wrong material would corrupt a disclosure silently, so unmatched lines are flagged for review instead.

**Restatement:** comparing two revisions holds every non-BOQ input constant, so the movement is attributable to the BOQ alone. A movement reaching the settings threshold (default 5%) requires restating a locked assessment. Because A5.2 site energy is typically 90%+ of the construction figure, material quantity changes move the total very little — the comparison therefore explains *why* the figure moved as it did, rather than leaving a user wondering whether their variation order registered.

**Assessments (`services/partc-assessments.js`):** one calculation bound to a policy, a BOQ revision and a reporting year — the binding is what lets a figure in an annual disclosure be traced to the bill of quantities behind it. Lifecycle is `draft → under_review → locked`; only a locked assessment enters the disclosure, and a locked assessment is never edited, only superseded by a new version. Where a new version moves a locked figure by at least the settings threshold it is a **restatement** and a reason is required. Locking one version automatically supersedes the previously locked one, so a policy-year never has two.

**The annual disclosure (`services/partc-disclosure.js`):** the document published for a reporting year, built from locked assessments only. A year holding none is **refused with a 409** rather than rendered as a position of zero — an empty disclosure would read as "we insured nothing carbon-intensive", which is a different claim from "we have not measured yet". Coverage sits in section 3, not an annex, because a total drawn from a fifth of the book means something different from one drawn from all of it. Annex C records the assessment, version, BOQ revision and lock behind every row in the per-policy table, so a reader can follow any disclosed number back to the bill of quantities.

**Comparatives (`services/partc-comparatives.js`):** because a policy's reporting year is its inception year, each year covers a *different set of policies* — two annual totals are measurements of two different books, not two measurements of one thing. Presenting their difference as a reduction would be false. The movement is therefore reported as fact alongside the note that it is not on its own a change in performance, and **intensity (kgCO2e/m² insured)** and the emissions-weighted data-quality score are given as the measures that survive a change of book. Where a prior year has been restated, the comparative is carried on **both** bases — as previously reported and as restated — with the reason recorded at lock time.

Every API key belongs to the insurer's own organisation — there is no client-facing login — so "only the insurer locks" holds by construction rather than by a role check; the organisation is recorded on the lock either way. Period totals weight data quality by emissions, as PCAF requires, so a small weak policy cannot drag the reported position beyond its share.

**The methodology statement (`services/partc-methodology.js`):** the other half of a disclosure — the scope rule applied, every equation executed, every factor with its tier and named source, how data quality is scored and aggregated, which rules are claimed and what proves each, and the declared limits. Reachable without running an assessment, because a reviewer asked to accept a figure should be able to read the method first.

Every equation, input and factor in it is **extracted from an execution of the engine**, not transcribed alongside it. A hand-written methodology drifts from the code as soon as either changes, and the drift is invisible exactly when it matters — under review. A test asserts that every documented equation appears in the executed trace, so the document cannot describe an equation the engine does not run. On screen the equation and what each module does stay visible; only the step-by-step trace collapses.

**Data quality (`services/pcaf-partc/dq-scoring.js`):** two scores, never blended — one for the PCAF figure (A4+A5), one for the separate use-stage line (B1+B4+B7); beyond-PCAF is excluded from both. Each input is scored 1 (verified actual) to 5 (global default) against what the run *actually* used, so supplying contractor fuel records moves A5.2 from 4 to 2 and supplying a measured refrigerant charge moves B1 from 5 to 2. `module_score` is the mean of its inputs and each scope score is Σ(module emissions × module score) ÷ Σ(module emissions) — weighting by emissions points effort at the tonnes rather than at whatever is easiest to fix. The module score is the **exact mean**, not rounded to a whole number first: rounding A5's 3.3 down to 3 would report a position better evidenced than it is, and `scoreRounded` is carried alongside for anyone presenting on PCAF's whole-instrument convention.

The scoring is **additive** — it reads a finished result and computes no figure of its own, so the engine is untouched. Where the policy gate closes the use stage, its inputs report *not evaluated by scope rule* rather than a zero-valued basis, and the score returns "not applicable to this policy type (scope rule)". The disclosure statement is generated from the execution: standard, section, both figures, the PCAF option, both scores and only the limitations the run actually carries, so a supplied actual removes its own limitation from the sentence.

**Downloads are bytes, not text:** `netlify/functions/fintech-api.js` names the binary content types for serverless-http. Without that list Lambda hands the body back as a UTF-8 string, every byte above 127 is re-encoded, and a 34KB PDF arrives as 63KB that downloads but will not open — which reads to a user as an empty file. `services/partc-docgen.js` `winAnsiSafe()` patches each pdfkit document so text outside WinAnsi (Σ, −, →) is transliterated rather than drawn as mojibake; the standard-14 fonts cannot encode it.

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

**NDC targets** — unconditional 4.5% GHG reduction by 2030 against BAU; conditional 14.5% with international support; net zero 2050. Key SDGs: 7, 9, 11, 13, 14, 15.

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
