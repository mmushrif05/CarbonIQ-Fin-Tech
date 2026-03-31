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
routes/v1/                  8 REST endpoints (score, assess, projects, pcaf, taxonomy, covenant, portfolio, webhook)
services/                   Business logic: score engine, PCAF formatter, taxonomy, covenant, portfolio, agents
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
| `POST` | `/v1/pcaf` | PCAF v2.0 financed emissions output |
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

## Key Business Domain Concepts

- **CRS (Carbon Finance Score)** — 0–100 score for construction loan risk assessment; calculated in `services/score.js`
- **PCAF v2.0** — Partnership for Carbon Accounting Financials standard for financed emissions reporting; `services/pcaf.js`
- **SLL (Sustainability-Linked Loan)** — Green loan covenants per LMA/APLMA GLP 2021; `services/covenant.js`
- **Taxonomy Alignment** — EU (2024), ASEAN (v3), HK (2024) regulatory eligibility screening; `services/taxonomy.js`
- **Pareto 80%** — The core engine pre-calculates the top 20% of materials driving 80% of emissions; this API reads those results
- **Carbon Bridge** — `bridge/` is strictly READ-ONLY from the CarbonIQ core (Carbon-Management repo); never write to core engine data through this API

---

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
