# Step 1 — CarbonIQ FinTech: Project Scaffolding

> **Date:** 2026-03-08
> **Status:** IMPLEMENTATION
> **Purpose:** Foundation architecture for the CarbonIQ FinTech platform — the bank-facing API and compliance layer built on top of the existing Carbon Management engine.

---

## 1. Architecture Decision Record

### Why This Structure?

The existing CarbonIQ platform is a **vanilla JS SPA + Netlify Functions + Firebase** stack deployed at `carboniq.online`. It powers the construction-side workflow: BOQ upload → AI classification → emission calculation → 80% Pareto → approval.

The FinTech layer is a **separate module** (`fintech/`) that:
- **Wraps** the existing engine (never modifies `data.js`, `tender.js`, or `parse-boq.js`)
- **Adds** bank-facing capabilities: REST API, PCAF output, taxonomy alignment, carbon scoring, covenant engine, portfolio aggregation
- **Shares** Firebase infrastructure (same database, same auth system, extended schema)
- **Deploys** alongside the existing platform on Netlify (same repo, additional functions)

### Key Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| **Framework** | Express.js (via Netlify Functions) | Matches existing stack. No new runtime. Netlify's serverless Express adapter (`@netlify/functions`) allows local Express dev that deploys as serverless. |
| **Database** | Firebase Realtime Database (extend existing) | Same DB the core engine uses. No data duplication. Bank API reads the same project/tender data contractors write. Future: Firestore migration for complex queries. |
| **Auth model** | Dual: JWT (users) + API Keys (bank systems) | Users (bank analysts) get JWT via existing auth. Bank systems (LOS, risk engines) get API keys for programmatic access. Both verified server-side. |
| **API versioning** | URL-based (`/api/v1/`) | Standard for financial APIs. Allows non-breaking evolution. v1 is the FILAP demo version. |
| **Deployment** | Netlify Functions (same site) | Zero-cost incremental deployment. Same domain. Same SSL. Same OWASP headers. Docker for local dev only. |
| **Testing** | Jest + Supertest | Industry standard for Node.js APIs. Supertest for HTTP assertion. Jest for unit tests on score/taxonomy/covenant logic. |
| **CI/CD** | GitHub Actions | Free for open-source. Runs tests, lints, security audit on every PR. Auto-deploys to Netlify on merge. |
| **Docker** | Local development only | Banks don't need Docker. We need it for consistent dev environments and future Kubernetes deployment if we outgrow Netlify. |

---

## 2. Strategic Context — What This Scaffolding Enables

This foundation is designed to serve the **complete CarbonIQ FinTech product roadmap** derived from four strategy documents:

### From FINTECH_PIVOT_ANALYSIS.md
- Carbon Finance Score (CFS) → `fintech/services/score.js`
- Partner API Layer → `fintech/routes/v1/`
- Carbon Credit Linkage → `fintech/services/certificate.js` (Phase 3)
- MRV Improvements → `fintech/middleware/audit.js`

### From FILAP_2026_REPOSITIONING.md
- PCAF v3 compliant output → `fintech/services/pcaf.js`
- Bank Portfolio Dashboard → `fintech/routes/v1/portfolio.js`
- Green Loan Score → `fintech/services/score.js`
- Taxonomy alignment (HK, ASEAN, EU) → `fintech/services/taxonomy.js`

### From FINTECH_LAB_STRATEGY.md
- Bank API endpoint (Step 6 in loan workflow) → `fintech/routes/v1/assess.js`
- PCAF Data Quality Score 5 → 2 → `fintech/services/pcaf.js`
- Construction KPI monitoring → `fintech/services/covenant.js`
- Portfolio carbon intelligence → `fintech/routes/v1/portfolio.js`
- Credit Memo ESG section → `fintech/services/reports.js` (Phase 2)

### From CARBONIQ_ARCHITECTURE.md
- PRE-CONSTRUCTION: Loan origination scoring → `fintech/services/score.js`
- DURING CONSTRUCTION: Draw monitoring → `fintech/services/covenant.js`
- POST-CONSTRUCTION: KPI compliance → `fintech/services/verification.js`
- 5 AI Agents: Classifier, Auditor, Monitor, Advisor, Reporter → Existing engine, accessed via `fintech/bridge/`

---

## 3. Directory Structure

```
Carbon-Management/
├── fintech/                          ← NEW: FinTech platform layer
│   ├── server.js                     ← Express app entry point (local dev + Netlify adapter)
│   ├── package.json                  ← FinTech-specific dependencies
│   ├── .env.example                  ← Environment variables template
│   │
│   ├── config/
│   │   ├── index.js                  ← Centralized config (env vars, defaults, feature flags)
│   │   ├── constants.js              ← Business constants (thresholds, taxonomy criteria, PCAF scores)
│   │   └── cors.js                   ← CORS configuration for bank integrations
│   │
│   ├── middleware/
│   │   ├── auth.js                   ← JWT verification (reuses existing Firebase auth)
│   │   ├── api-key.js                ← API key authentication for bank systems
│   │   ├── rate-limit.js             ← Per-key rate limiting (extends existing)
│   │   ├── audit.js                  ← Request/response audit logging (compliance trail)
│   │   ├── validate.js               ← Request validation (Joi schemas)
│   │   └── error-handler.js          ← Centralized error handling + structured error responses
│   │
│   ├── routes/
│   │   └── v1/
│   │       ├── index.js              ← v1 router aggregator
│   │       ├── assess.js             ← POST /v1/assess — BOQ assessment trigger
│   │       ├── projects.js           ← GET /v1/projects/:id — Project carbon data
│   │       ├── score.js              ← GET /v1/projects/:id/score — Carbon Finance Score
│   │       ├── taxonomy.js           ← GET /v1/projects/:id/taxonomy — Taxonomy alignment
│   │       ├── pcaf.js               ← GET /v1/projects/:id/pcaf — PCAF-compliant output
│   │       ├── covenant.js           ← POST /v1/projects/:id/covenant — Covenant check
│   │       ├── portfolio.js          ← GET /v1/portfolio — Portfolio aggregation
│   │       └── webhook.js            ← POST /v1/webhooks — Webhook registration
│   │
│   ├── services/
│   │   ├── score.js                  ← Carbon Finance Score calculation (0-100)
│   │   ├── taxonomy.js               ← ASEAN/EU/HK/SG taxonomy alignment engine
│   │   ├── pcaf.js                   ← PCAF v3 output formatting + data quality scoring
│   │   ├── covenant.js               ← Green loan covenant engine (KPI definition + breach check)
│   │   ├── portfolio.js              ← Multi-project portfolio aggregation
│   │   ├── verification.js           ← Third-party verification workflow
│   │   ├── reports.js                ← PDF/JSON report generation
│   │   ├── webhook.js                ← Outbound webhook dispatcher
│   │   └── certificate.js            ← Carbon reduction certificate generation (Phase 3)
│   │
│   ├── bridge/
│   │   ├── engine.js                 ← Bridge to existing CarbonIQ engine (data.js, tender.js)
│   │   ├── firebase.js               ← Firebase access (reuses existing utils/firebase.js patterns)
│   │   └── ai.js                     ← Bridge to AI services (parse-boq.js, carbon-advisor.js)
│   │
│   ├── models/
│   │   ├── api-key.js                ← API key schema + CRUD
│   │   ├── covenant-definition.js    ← Covenant KPI definitions
│   │   ├── webhook-subscription.js   ← Webhook subscription schema
│   │   └── taxonomy-result.js        ← Taxonomy alignment result schema
│   │
│   └── tests/
│       ├── setup.js                  ← Test configuration + Firebase mock
│       ├── score.test.js             ← Carbon Finance Score tests
│       ├── taxonomy.test.js          ← Taxonomy alignment tests
│       ├── pcaf.test.js              ← PCAF output tests
│       ├── covenant.test.js          ← Covenant engine tests
│       ├── api.test.js               ← API endpoint integration tests
│       └── fixtures/
│           ├── sample-project.json   ← Test project data
│           ├── sample-tender.json    ← Test tender/BOQ data
│           └── sample-80pct.json     ← Test 80% Pareto result
│
├── netlify/functions/
│   ├── fintech-api.js                ← NEW: Netlify Function adapter for Express app
│   └── ... (existing functions unchanged)
│
├── .github/
│   └── workflows/
│       └── fintech-ci.yml            ← GitHub Actions CI/CD pipeline
│
├── docker/
│   ├── Dockerfile                    ← FinTech API container
│   └── docker-compose.yml            ← Full local dev stack (API + Firebase emulator)
│
└── ... (existing files unchanged)
```

---

## 4. Technology Stack

### Runtime & Framework

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Runtime | Node.js | ≥18.x LTS | Matches existing Netlify Functions runtime |
| Framework | Express.js | ^4.21 | API routing, middleware chain, request handling |
| Serverless | @netlify/functions | ^2.8 | Wraps Express for Netlify deployment |
| Validation | Joi | ^17.13 | Request schema validation (bank-grade input sanitization) |
| UUID | uuid | ^10.0 | API key generation, request IDs |
| PDF | pdfkit | ^0.15 | Report generation (Green Loan Eligibility, Carbon Certificate) |

### Database & Auth

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Database | Firebase Realtime Database | Shared with core platform. Extended schema for API keys, covenants, webhooks. |
| Auth (Users) | Firebase Auth (via existing) | Bank analysts authenticate same way as consultants/contractors. |
| Auth (Systems) | Custom API Keys | Bank LOS/risk systems authenticate via API key header. Keys stored in Firebase. |

### Testing & Quality

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Test runner | Jest | ^29.7 | Unit + integration tests |
| HTTP testing | Supertest | ^7.0 | API endpoint testing |
| Linting | ESLint | ^9.0 | Code quality enforcement |
| Security audit | npm audit | built-in | Dependency vulnerability scanning |

### DevOps

| Component | Technology | Purpose |
|-----------|-----------|---------|
| CI/CD | GitHub Actions | Test → Lint → Audit → Deploy on merge |
| Containers | Docker + Docker Compose | Local development environment |
| Firebase Emulator | firebase-tools | Local Firebase for testing (no cloud calls in dev) |

---

## 5. API Authentication Model

### Dual Authentication Strategy

Banks need two access patterns:

**Pattern 1: User Authentication (Bank Analysts)**
```
Bank Analyst → Login UI → Firebase Auth → JWT Token
                                           ↓
                              Bearer token in Authorization header
                                           ↓
                              fintech/middleware/auth.js verifies
```
- Same auth flow as existing platform
- New role: `bank_analyst` (read-only access to carbon data, no BOQ editing)
- Reuses existing `ct_auth_token` / `ct_refresh_token` mechanism

**Pattern 2: API Key Authentication (Bank Systems)**
```
Bank LOS/Risk System → API Key in X-API-Key header
                                    ↓
                       fintech/middleware/api-key.js verifies
                                    ↓
                       Key lookup in Firebase: /apiKeys/{hashedKey}
                       → { projectIds[], orgId, permissions[], created, lastUsed, rateLimit }
```
- Generated via admin UI or bootstrap endpoint
- Scoped to specific projects (a bank only sees their financed projects)
- Rate-limited per key (default: 100 req/min, configurable)
- SHA-256 hashed before storage (key itself never stored in plain text)
- Permissions: `read:score`, `read:pcaf`, `read:taxonomy`, `write:covenant`, `read:portfolio`

---

## 6. Firebase Schema Extensions

New paths added under existing Firebase Realtime Database:

```
/fintech/
  /apiKeys/
    /{hashedKey}/
      orgId: "bank-org-123"
      orgName: "HSBC Green Lending"
      projectIds: ["proj-1", "proj-2"]
      permissions: ["read:score", "read:pcaf", "read:taxonomy"]
      rateLimit: 100
      created: timestamp
      lastUsed: timestamp
      active: true
      createdBy: "admin-uid"

  /covenants/
    /{projectId}/
      /{covenantId}/
        name: "Max Embodied Carbon"
        metric: "total_tco2e_per_m2"
        operator: "lte"
        threshold: 500
        unit: "kgCO2e/m2"
        checkFrequency: "quarterly"
        lastChecked: timestamp
        lastResult: "pass" | "breach" | "warning"
        breachHistory: [{ date, value, threshold }]
        webhookUrl: "https://bank-system.example.com/webhook"
        created: timestamp
        createdBy: "bank-analyst-uid"

  /webhooks/
    /{subscriptionId}/
      orgId: "bank-org-123"
      url: "https://bank-system.example.com/carbon-events"
      events: ["covenant.breach", "assessment.complete", "score.change"]
      secret: "webhook-signing-secret-hash"
      active: true
      lastDelivery: timestamp
      failCount: 0

  /taxonomyResults/
    /{projectId}/
      /{assessmentDate}/
        asean: { tier: "green", criteria: [...], score: 85 }
        eu: { aligned: true, dnsh: [...], score: 78 }
        hongKong: { classification: "dark_green", criteria: [...] }
        singapore: { greenMark: "platinum_equiv", bca: {...} }
        timestamp: ...
        assessedBy: "system" | "verifier-uid"

  /portfolioSnapshots/
    /{orgId}/
      /{snapshotDate}/
        totalProjects: 47
        totalFinancedEmissions_tCO2e: 125000
        pcafWeightedScore: 2.3
        taxonomyDistribution: { green: 23, transition: 18, brown: 6 }
        topContributors: [...]
        timestamp: ...
```

---

## 7. Environment Variables

### New Variables (FinTech Layer)

```env
# --- FinTech API Configuration ---
FINTECH_API_ENABLED=true
FINTECH_API_VERSION=v1
FINTECH_API_PORT=3001

# --- API Key Management ---
API_KEY_SALT=random-64-char-hex-for-hashing
API_KEY_DEFAULT_RATE_LIMIT=100

# --- PCAF Configuration ---
PCAF_VERSION=3.0
PCAF_DEFAULT_ATTRIBUTION=1.0

# --- Taxonomy Defaults ---
TAXONOMY_ASEAN_VERSION=3
TAXONOMY_EU_VERSION=2024
TAXONOMY_HK_VERSION=2024

# --- Webhook Configuration ---
WEBHOOK_TIMEOUT_MS=5000
WEBHOOK_MAX_RETRIES=3
WEBHOOK_SIGNING_SECRET=random-secret-for-hmac

# --- Feature Flags ---
FF_COVENANT_ENGINE=true
FF_PORTFOLIO_AGGREGATION=true
FF_TAXONOMY_CHECKER=true
FF_CERTIFICATE_GENERATION=false
FF_INSURANCE_OUTPUT=false
```

### Inherited from Existing Platform

```env
# These are SHARED — same values as the core platform
FIREBASE_API_KEY=...
FIREBASE_DATABASE_URL=...
FIREBASE_SERVICE_ACCOUNT=...
ANTHROPIC_API_KEY=...
DATA_ENCRYPTION_KEY=...
ALLOWED_ORIGINS=...
```

---

## 8. Deployment Model

### Production: Netlify (Same Site)

```
┌─────────────────────────────────────────────┐
│           carboniq.online (Netlify)          │
│                                              │
│  Static:  /index.html, /js/*, /css/*         │  ← Existing UI
│  Static:  /pitch.html, /presentation.html    │  ← Existing decks
│                                              │
│  Functions:                                  │
│    /.netlify/functions/parse-boq      ←─── Existing AI parse
│    /.netlify/functions/auth           ←─── Existing auth
│    /.netlify/functions/emissions      ←─── Existing CRUD
│    /.netlify/functions/fintech-api    ←─── NEW: FinTech Express app
│                                              │
│  Redirects:                                  │
│    /api/*     → /.netlify/functions/:splat    │  ← Existing
│    /bank/*    → /.netlify/functions/fintech-api │ ← NEW
│    /v1/*      → /.netlify/functions/fintech-api │ ← NEW
│                                              │
└─────────────────────────────────────────────┘
```

### Local Development: Docker

```
┌─────────────────────────────────────────────┐
│           docker-compose up                  │
│                                              │
│  ┌─────────────┐  ┌──────────────────────┐  │
│  │  fintech-api │  │  firebase-emulator   │  │
│  │  :3001       │  │  :9000 (DB)          │  │
│  │  Express     │  │  :9099 (Auth)        │  │
│  │  Hot reload  │  │  :4000 (Emulator UI) │  │
│  └─────────────┘  └──────────────────────┘  │
│                                              │
└─────────────────────────────────────────────┘
```

---

## 9. Security Posture

Inherits existing OWASP ASVS L2 compliance and adds:

| Control | Implementation |
|---------|---------------|
| API Key hashing | SHA-256 with salt (key never stored in plain text) |
| Rate limiting | Per-key configurable (default 100 req/min) |
| Input validation | Joi schemas on every endpoint |
| Audit logging | Every API request logged with timestamp, key, endpoint, response code |
| CORS | Strict origin whitelist (configured per API key's organization) |
| Request signing | Webhook payloads signed with HMAC-SHA256 |
| Data scoping | API keys scoped to specific project IDs (no cross-tenant access) |
| PII protection | Existing ai-privacy.js reused for any AI calls |
| Encryption | Existing AES-256 for sensitive data at rest |
| Headers | Same OWASP headers from existing netlify.toml |

---

## 10. Bridge to Existing Engine

The `fintech/bridge/` layer is the critical interface between the new FinTech API and the existing CarbonIQ engine. It **never modifies** the core files — it reads their output.

```
┌──────────────────────────────────┐
│        FinTech API Layer          │
│   (Express routes + services)     │
└───────────────┬──────────────────┘
                │ fintech/bridge/
                │
    ┌───────────┼───────────────────┐
    │           │                   │
    ▼           ▼                   ▼
┌────────┐ ┌────────────┐  ┌──────────────┐
│engine.js│ │ firebase.js │  │    ai.js     │
│         │ │             │  │              │
│Reads:   │ │Reads:       │  │Calls:        │
│data.js  │ │/projects/   │  │parse-boq.js  │
│tender.js│ │/tenders/    │  │carbon-advisor│
│         │ │/entries/     │  │intelligence  │
└────────┘ └────────────┘  └──────────────┘
```

### What the Bridge Does

1. **`engine.js`** — Imports scoring functions, material databases, conversion logic from `js/data.js` and `js/tender.js`. Wraps them in async-friendly interfaces for the API layer. **Read-only** — never calls functions that modify state.

2. **`firebase.js`** — Connects to Firebase using the same `FIREBASE_SERVICE_ACCOUNT` credential. Reads project data, tender scenarios, 80% records. Writes to new `/fintech/` paths only.

3. **`ai.js`** — Triggers BOQ assessment by calling the existing `parse-boq.js` Netlify function internally (HTTP call to same host). Returns structured results.

---

## 11. Implementation Order

This scaffolding enables the following build sequence:

| Phase | Week | What Gets Built | Files |
|-------|------|-----------------|-------|
| **Step 1** | Now | Project scaffolding (this document) | All `fintech/` structure files |
| **Step 2** | 1 | Core API + Auth | `routes/v1/`, `middleware/`, `bridge/` |
| **Step 3** | 1 | Database schema extensions | `bridge/firebase.js`, `models/` |
| **Step 4** | 2 | AI Agent bridge | `bridge/engine.js`, `bridge/ai.js` |
| **Step 5** | 2 | Carbon Finance Score | `services/score.js`, `routes/v1/score.js` |
| **Step 6** | 3 | Taxonomy alignment | `services/taxonomy.js`, `config/constants.js` |
| **Step 7** | 3 | PCAF v3 output | `services/pcaf.js` |
| **Step 8** | 3 | Regulatory reporting | `services/reports.js` |
| **Step 9** | 4 | Portfolio dashboard | `services/portfolio.js`, `routes/v1/portfolio.js` |
| **Step 10** | 4 | Green loan lifecycle | `services/covenant.js` |
| **Step 11** | 4 | Covenant engine | `routes/v1/covenant.js` |
| **Step 12** | 5 | Verification workflow | `services/verification.js` |
| **Step 13** | 5 | Webhooks | `services/webhook.js`, `routes/v1/webhook.js` |
| **Step 14** | 5 | Enterprise security hardening | `middleware/` enhancements |
| **Step 15** | 6 | API documentation | OpenAPI spec, developer portal |
| **Step 16** | 6 | Demo environment | Test data, sandbox |
| **Step 17** | 6 | Pitch & apply | FILAP application, demo video |

---

## 12. Success Criteria for Step 1

Step 1 is complete when:

- [ ] `fintech/` directory structure exists with all placeholder files
- [ ] `fintech/package.json` has all dependencies listed
- [ ] `fintech/server.js` starts Express and responds to `GET /health`
- [ ] `fintech/.env.example` documents all required environment variables
- [ ] `fintech/middleware/auth.js` has JWT verification skeleton
- [ ] `fintech/middleware/api-key.js` has API key verification skeleton
- [ ] `fintech/routes/v1/index.js` mounts all route placeholders
- [ ] `fintech/bridge/firebase.js` connects to Firebase
- [ ] `netlify/functions/fintech-api.js` wraps Express for serverless
- [ ] `docker/Dockerfile` builds the API container
- [ ] `docker/docker-compose.yml` runs API + Firebase emulator
- [ ] `.github/workflows/fintech-ci.yml` runs tests on PR
- [ ] All tests pass (`npm test` in `fintech/`)
- [ ] Git committed and pushed to feature branch

---

## 13. What This Does NOT Change

Per CLAUDE.md critical rules, this scaffolding:

- **DOES NOT** modify `js/data.js` (GWP factors, MATERIALS, ICE_MATERIALS)
- **DOES NOT** modify `js/tender.js` (80% threshold, unit conversion, ECCS hierarchy)
- **DOES NOT** modify `netlify/functions/parse-boq.js` (AI classification prompt)
- **DOES NOT** modify any existing Netlify function
- **DOES NOT** change the A1-A3 → ICE priority chain
- **DOES NOT** alter the audit trail mechanism
- **DOES NOT** modify existing CSS, HTML, or client-side JS

The FinTech layer is **additive only** — a new module that reads from the existing engine and adds bank-facing capabilities on top.

---

*Document generated: March 8, 2026*
*For: CarbonIQ FinTech Platform — Step 1 of 17*
*References: FINTECH_PIVOT_ANALYSIS.md, FILAP_2026_REPOSITIONING.md, FINTECH_LAB_STRATEGY.md, CARBONIQ_ARCHITECTURE.md*
