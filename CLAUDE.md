# CLAUDE.md — CarbonIQ FinTech Developer Guide

> This file is the authoritative reference for Claude Code when working on this repository.
> Read it fully before making any changes.

---

## Project Overview

**CarbonIQ FinTech** is a bank-facing API and web platform for construction carbon intelligence.
It helps APAC green banks (DBS, OCBC, DFCC, HSBC) quantify climate risk in real monetary terms:

- BOQ material extraction → embodied carbon calculation (ICE v3 factors)
- Carbon Finance Score (CFS 0-100) for green loan classification
- Taxonomy alignment (ASEAN v3, EU 2024, HK GCF, SG TSC, SLGFT)
- PCAF v3 financed emissions attribution
- Carbon tax exposure & stranded asset risk (SG, EU, MY, HK, LK)
- NDC & SDG alignment (Sri Lanka SLGFT — Claude AI-powered)

---

## Technology Stack

| Layer      | Technology                                  |
|------------|---------------------------------------------|
| Backend    | Node.js 18, Express 4, Firebase Admin SDK   |
| Database   | Firebase Realtime Database                  |
| AI         | Anthropic Claude claude-sonnet-4-6 (via @anthropic-ai/sdk) |
| Validation | Joi                                         |
| Testing    | Jest + Supertest                            |
| Frontend   | Vanilla JS SPA, CSS custom properties       |

---

## Branch Strategy

| Branch                     | Purpose                                            |
|----------------------------|----------------------------------------------------|
| `main`                     | Production-ready, always passing CI                |
| `claude/plan-stage-2-gINqD`| General feature development (Stage 2+)            |
| `claude/srilanka-taxonomy` | Sri Lanka Green Finance Taxonomy (SLGFT) features  |

**CRITICAL**: Sri Lanka taxonomy work MUST be on `claude/srilanka-taxonomy`, not `main` or the stage-2 branch.

Before pushing any changes:
1. Run `npm test` — all 23+ suites must pass
2. Run `npm run lint` (if available)
3. Never push directly to `main`

---

## Project Structure

```
CarbonIQ-Fin-Tech/
├── config/
│   ├── constants.js          # Business rules, taxonomy criteria, CFS weights
│   └── index.js              # Runtime config (API key, Firebase, feature flags)
├── services/
│   ├── carbon-pricing.js     # Carbon tax exposure, loan pricing, stranded risk
│   ├── certificate.js        # Green loan certificates
│   ├── covenant.js           # Covenant compliance checks
│   ├── extract.js            # Claude AI BOQ material extraction
│   ├── ndc-sdg.js            # Claude AI NDC/SDG alignment (Sri Lanka)
│   ├── pcaf.js               # PCAF v3 financed emissions
│   ├── portfolio.js          # Portfolio aggregation
│   ├── reports.js            # PCAF / GRI / TCFD / IFRS S2 reports
│   ├── score.js              # Carbon Finance Score (CFS) engine
│   ├── taxonomy.js           # Taxonomy alignment (all 5 frameworks)
│   ├── verification.js       # Third-party verifier checks
│   └── webhook.js            # Event webhooks
├── routes/v1/
│   ├── index.js              # Master router — all /v1/* endpoints
│   ├── assess.js             # POST /v1/assess
│   ├── agent.js              # POST /v1/agent/screen|underwrite|...
│   ├── carbon-pricing.js     # POST /v1/carbon-pricing/calculate
│   ├── covenant.js           # POST /v1/projects/:id/covenant
│   ├── extract.js            # POST /v1/extract
│   ├── ndc-sdg.js            # POST /v1/ndc-sdg/assess (Claude AI)
│   ├── pcaf.js               # GET /v1/projects/:id/pcaf
│   ├── portfolio.js          # GET /v1/portfolio
│   ├── projects.js           # POST/GET /v1/projects + monitoring
│   ├── reports.js            # POST /v1/reports/generate
│   ├── score.js              # GET /v1/projects/:id/score
│   ├── taxonomy.js           # GET /v1/projects/:id/taxonomy
│   └── webhook.js            # POST /v1/webhooks
├── schemas/
│   ├── carbon-pricing.js     # Joi schema for carbon pricing endpoint
│   ├── extract.js            # Joi schema for extract/assess
│   ├── projects.js           # Joi schema — includes slsicSector, activityCode
│   └── reports.js            # Joi schema — includes slgft report type + slgftData
├── middleware/
│   ├── api-key.js            # x-api-key auth + requireProjectAccess
│   ├── rate-limit.js         # Per-endpoint rate limits
│   └── validate.js           # Joi validation middleware
├── bridge/
│   ├── engine.js             # Firebase engine bridge
│   └── firebase.js           # Firebase read/write helpers
├── tests/                    # Jest test suites (23+ suites, 200+ tests)
├── ui/
│   ├── index.html            # Single-page app shell
│   ├── app.js                # Navigation, PAGE_META, DYNAMIC_PAGES
│   ├── config.js             # CARBONIQ_fetch(), Toast, Settings modules
│   ├── styles.css            # Global styles
│   ├── css/                  # Per-feature CSS files
│   ├── js/
│   │   ├── dashboard.js      # Dashboard & Portfolio pages
│   │   ├── monitoring.js     # Monitoring page + annual update modal
│   │   ├── ndc-sdg.js        # NDC/SDG alignment page (NdcSdgPage)
│   │   ├── new-project.js    # New Project Wizard (4-step)
│   │   ├── pcaf.js           # PCAF calculator
│   │   └── taxonomy.js       # Taxonomy checker (5 frameworks)
│   └── pages/                # Dynamically-loaded page HTML
│       ├── agents.html
│       ├── carbon-pricing.html
│       ├── extract.html
│       ├── ndc-sdg.html      # NDC/SDG page content
│       └── reports.html
└── server.js                 # Express server entry point
```

---

## API Endpoints

### Core Endpoints

| Method | Path                              | Description                            |
|--------|-----------------------------------|----------------------------------------|
| POST   | /v1/assess                        | AI BOQ assessment (Claude)             |
| POST   | /v1/extract                       | Material extraction from BOQ text/PDF  |
| POST   | /v1/projects                      | Create/save fintech project            |
| GET    | /v1/projects                      | List all projects                      |
| GET    | /v1/projects/:id                  | Project carbon data                    |
| GET    | /v1/projects/:id/score            | Carbon Finance Score (0-100)           |
| GET    | /v1/projects/:id/taxonomy         | Taxonomy alignment (5 frameworks)      |
| GET    | /v1/projects/:id/pcaf             | PCAF financed emissions                |
| POST   | /v1/projects/:id/covenant         | Covenant compliance check              |
| POST   | /v1/projects/:id/monitoring       | Submit annual monitoring entry         |
| GET    | /v1/projects/:id/monitoring       | List monitoring history                |
| GET    | /v1/portfolio                     | Portfolio aggregation                  |
| POST   | /v1/carbon-pricing/calculate      | Carbon tax/pricing analysis            |
| GET    | /v1/carbon-pricing/rates          | Current rates by region                |
| POST   | /v1/reports/generate              | Generate compliance report (incl. SLGFT type) |
| POST   | /v1/ndc-sdg/assess                | NDC/SDG alignment (Claude AI)          |
| POST   | /v1/ndc-sdg/certificate           | Generate SLGFT Green Loan Certificate  |
| POST   | /v1/ndc-sdg/certificate/verify    | Verify certificate SHA-256 hash        |
| GET    | /v1/ndc-sdg/framework             | SLGFT framework metadata               |
| POST   | /v1/agent/screen                  | AI agent — loan screening              |
| POST   | /v1/agent/underwrite              | AI agent — underwriting                |
| POST   | /v1/webhooks                      | Register webhook                       |

---

## Authentication

All endpoints require `x-api-key` header. Value is checked against `config.apiKey`.
In tests, set header to `test-api-key` (matches `process.env.CARBONIQ_API_KEY` from `tests/setup.js`).

---

## Sri Lanka Green Finance Taxonomy (SLGFT)

> **Primary feature on `claude/srilanka-taxonomy` branch**

### Key Facts
- Regulator: Central Bank of Sri Lanka (CBSL)
- Version: SLGFT v2024
- 13 SLSIC Sectors (A–M), 4 Environmental Objectives (M/A/P/E)
- Activity code format: `{Objective}{MacroSector}.{Activity}` — e.g. `M1.1`

### Embodied Carbon Thresholds (Construction)
- **Green**: ≤ 600 kgCO2e/m²
- **Transition**: ≤ 900 kgCO2e/m²
- **Not Aligned**: > 900 kgCO2e/m²

### NDC Targets
- Unconditional: 4.5% GHG reduction by 2030 vs BAU
- Conditional: 14.5% GHG reduction by 2030 (with international support)
- Net Zero: 2050

### Key SDGs: 7, 9, 11, 13, 14, 15

### Stage 5 — SLGFT Certificate & CBSL Report (Step 5)
- `services/certificate.js` — digital Green Loan Certificate with SHA-256 audit hash + verify
- `services/reports.js` — `slgft` report type added + `_slgftReport()` function
- `schemas/reports.js` — `slgft` added to valid types, `slgftData` optional field
- `routes/v1/ndc-sdg.js` — POST /v1/ndc-sdg/certificate, POST /v1/ndc-sdg/certificate/verify
- `routes/v1/reports.js` — passes `slgftData` through, adds SLGFT to `/types` endpoint
- `ui/pages/reports.html` — SLGFT CBSL Compliance Report card
- `ui/pages/ndc-sdg.html` — certificate generation section in results
- `ui/js/ndc-sdg.js` — generateCertificate(), copyCertHash(), downloadCert()
- `ui/styles.css` — certificate display + SLGFT report card styles

### Files Modified for SLGFT
- `config/constants.js` — `TAXONOMY_LK` object
- `services/taxonomy.js` — `checkSriLanka()`, `checkAllTaxonomies()`
- `services/carbon-pricing.js` — LK region in `CARBON_TAX_RATES`
- `services/ndc-sdg.js` — Claude AI NDC/SDG analysis
- `schemas/carbon-pricing.js` — LK added to valid regions
- `schemas/projects.js` — `slsicSector`, `activityCode` fields
- `routes/v1/ndc-sdg.js` — POST /v1/ndc-sdg/assess, GET /v1/ndc-sdg/framework
- `routes/v1/index.js` — ndcSdgRouter mounted at /ndc-sdg
- `ui/index.html` — LK region option, SLGFT wizard fields, NDC/SDG nav + page
- `ui/app.js` — NDC/SDG page metadata + DYNAMIC_PAGES entry
- `ui/js/new-project.js` — onRegionChange(), lookupActivity(), LK review panel
- `ui/js/taxonomy.js` — 5-framework checker with full SLGFT card
- `ui/js/ndc-sdg.js` — NdcSdgPage module
- `ui/pages/ndc-sdg.html` — NDC/SDG page HTML
- `ui/styles.css` — SLGFT + NDC/SDG styles

---

## AI Integration (Claude)

All AI features use `@anthropic-ai/sdk`. Key pattern:

```js
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: config.anthropicApiKey });

const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 2000,
  system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
  messages: [{ role: 'user', content: userMessage }],
});
```

**Prompt caching** is always applied to the system prompt (`cache_control: { type: 'ephemeral' }`).
This reduces token costs by 60-80% on repeated calls.

---

## Frontend Patterns

### Navigation
- Pages declared in `PAGE_META` object in `ui/app.js`
- Dynamic pages (HTML loaded on demand) declared in `DYNAMIC_PAGES`
- Each page has a JS module (e.g. `NdcSdgPage`) with an `init()` function
- `init()` is called by `app.js` when page is first navigated to

### API calls
Always use `window.CARBONIQ_fetch()` — never raw `fetch()`.
This helper attaches `x-api-key` and `Content-Type` headers automatically.

### Notifications
Use `Toast.success()`, `Toast.error()`, `Toast.info()` for user feedback.

---

## Testing

```bash
npm test                  # Run all tests
npm test -- --coverage    # With coverage report
npm test -- tests/ndc-sdg.test.js  # Single suite
```

Coverage thresholds (jest.config.js):
- Statements: ≥ 43%
- Lines: ≥ 43%
- Functions: ≥ 29%

Test entry point: `require('../server')` (NOT `../app`).

---

## Carbon Finance Score (CFS) — 0 to 100

| Score   | Classification | Loan Tier          | Pricing   |
|---------|----------------|--------------------|-----------|
| ≥ 70    | Green          | Green Loan         | -20 bps   |
| 40–69   | Transition     | SLL (SLL ratchet)  | -8 bps    |
| < 40    | Brown/Standard | Standard           | 0 bps     |

---

## Do Not

- Do NOT duplicate the 80% threshold — it lives in `bridge/engine.js` (ISO 21930 mandated)
- Do NOT push Sri Lanka taxonomy changes to `claude/plan-stage-2-gINqD`
- Do NOT skip tests with `--no-verify`
- Do NOT use raw `fetch()` in frontend code — use `CARBONIQ_fetch()`
- Do NOT add comments to code you didn't change
