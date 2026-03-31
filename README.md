# CarbonIQ FinTech — Bank-Facing API Layer

> **Construction Carbon Intelligence for Green Loan Compliance**

A standalone Express.js API that exposes the CarbonIQ carbon engine to banks, lenders, and financial institutions for:

- **Carbon Finance Score (CRS 0–100)** — loan origination risk assessment
- **PCAF v2.0 financed emissions** — standardised carbon accounting for real estate/construction assets
- **Green loan covenant monitoring** — SLL compliance tracking (LMA/APLMA GLP 2021)
- **EU/ASEAN Taxonomy alignment** — regulatory eligibility screening
- **Portfolio aggregation** — cross-project carbon risk exposure

---

## Architecture

```
CarbonIQ-Fin-Tech/
├── server.js               Express entry point + /health
├── config/                 Env config, business constants, CORS
├── middleware/             Auth (JWT + API key), rate limiting, audit, validation
├── routes/v1/              8 API endpoints (score, assess, projects, pcaf, taxonomy, covenant, portfolio, webhook)
├── services/               Score engine, PCAF output, taxonomy alignment, covenant engine, portfolio aggregation
├── bridge/                 Firebase + engine bridge (read-only access to CarbonIQ core)
├── models/                 API key, covenant, webhook, taxonomy schemas
├── tests/                  26 tests across 6 suites (score, taxonomy, covenant, pcaf, api)
├── docker/                 Local development container
├── netlify/functions/      Serverless adapter (production deployment)
└── docs/                   Architecture, strategy, and scaffolding documentation
```

## API Endpoints (v1)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/health` | Health check — no auth |
| `POST` | `/v1/assess` | Full project carbon assessment (Claude AI) |
| `POST/GET` | `/v1/projects` | Project list / create |
| `GET`  | `/v1/projects/:id/score` | Carbon Finance Score (CFS 0-100) |
| `GET`  | `/v1/projects/:id/taxonomy` | Taxonomy alignment — 5 frameworks incl. SLGFT |
| `GET`  | `/v1/projects/:id/pcaf` | PCAF v3 financed emissions |
| `POST` | `/v1/projects/:id/covenant` | Green loan covenant check |
| `POST/GET` | `/v1/projects/:id/monitoring` | Annual monitoring entries |
| `GET`  | `/v1/portfolio` | Portfolio carbon risk aggregation |
| `POST` | `/v1/carbon-pricing/calculate` | Carbon tax exposure + loan pricing + stranded risk |
| `GET`  | `/v1/carbon-pricing/rates` | Carbon tax rates (SG, EU, MY, HK, LK) |
| `POST` | `/v1/reports/generate` | PCAF / GRI 305 / TCFD / IFRS S2 reports |
| `POST` | `/v1/ndc-sdg/assess` | **AI-powered NDC/SDG alignment — Sri Lanka SLGFT** |
| `GET`  | `/v1/ndc-sdg/framework` | SLGFT framework metadata (sectors, activities, NDC) |
| `POST` | `/v1/agent/screen` | AI agent — green loan screening |
| `POST` | `/v1/agent/underwrite` | AI agent — underwriting analysis |
| `POST` | `/v1/webhooks` | Webhook subscription management |

### Sri Lanka Green Finance Taxonomy (SLGFT)

Regions supported: **SG · EU · MY · HK · LK (Sri Lanka)**

Sri Lanka-specific fields on `/v1/projects` and `/v1/ndc-sdg/assess`:
- `slsicSector` — SLSIC sector code (A–M, e.g. `F` = Construction)
- `activityCode` — SLGFT activity code (e.g. `M1.1` = Green Buildings, `M4.1` = Solar PV)

NDC targets assessed:
- Unconditional: 4.5% GHG reduction by 2030 vs BAU
- Conditional: 14.5% GHG reduction by 2030 (with international support)
- Key SDGs: 7, 9, 11, 13, 14, 15

## Authentication

Dual-mode auth:
- **JWT** — for bank analyst portals (user sessions)
- **API Key** — for bank system integrations (SHA-256 hashed, stored in Firebase)

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Fill in: FIREBASE_*, JWT_SECRET, ANTHROPIC_API_KEY

# Run locally
npm run dev

# Run tests
npm test

# Docker (with Firebase emulator)
docker-compose -f docker/docker-compose.yml up
```

## Deployment

Production runs as a Netlify Function via `netlify/functions/fintech-api.js`.

Add to your `netlify.toml`:
```toml
[[redirects]]
  from = "/v1/*"
  to = "/.netlify/functions/fintech-api/:splat"
  status = 200

[[redirects]]
  from = "/bank/*"
  to = "/.netlify/functions/fintech-api/:splat"
  status = 200
```

## Carbon Engine Bridge

This API is **read-only** from the CarbonIQ core engine (Carbon-Management repo). It reads:
- Project data and emission entries from Firebase
- Pre-calculated 80% Pareto results
- Approved GWP factors and audit trails

It does **not** modify any core engine data.

## Documentation

| Document | Description |
|----------|-------------|
| `docs/ARCHITECTURE.md` | Full bank-facing product architecture (CRS, PCAF, Taxonomy, Covenant) |
| `docs/SCAFFOLDING.md` | Step-by-step build plan for the 17-step scaffolding |
| `docs/STRATEGY.md` | FinTech Innovation Lab APAC 2026 strategy |
| `docs/PIVOT_ANALYSIS.md` | Green finance pivot analysis |
| `docs/FILAP_2026.md` | FILAP 2026 repositioning and multi-theme positioning |

## License

Apache-2.0 — See [LICENSE](../LICENSE)
