# CarbonIQ FinTech — Technical Blueprint & Implementation Guide

> **Bank-facing API layer for construction carbon intelligence**
> Converts project-level BOQ data into PCAF-compliant financed emissions output

---

## 1. The Problem We Solve

### The construction carbon data gap

Banks face an urgent, regulation-driven need to report financed emissions for construction lending — yet no tool exists that converts project-level material data into PCAF-compliant output.

**The gap in numbers:**
- Financed emissions represent **at least 95%** of banks' total carbon footprint
- Construction and real estate represents **10–24%** of bank loan books
- Banks currently achieve PCAF data quality scores of **4–5 (worst possible)** for construction
- Sector-average proxies (EEIO models) diverge from actual emissions by **100–200%**
- EEIO **cannot distinguish** between a low-carbon mass-timber building and a high-carbon reinforced concrete tower — both receive the same emission factor if their revenue is identical

### Why this matters now

| Regulation | Impact | Timeline |
|---|---|---|
| **PCAF v3** (Third Edition) | 10 asset classes including project finance; mandates absolute GHG emissions + weighted DQ scores | December 2025 |
| **ISSB S2** | Mandatory financed emissions disclosure by Scope 1, 2, 3 per asset class | 36 jurisdictions adopting |
| **ECB enforcement** | Binding supervisory decisions + periodic penalties (up to 5% daily revenue) | Active — ABANCA fined EUR 187,650; Credit Agricole EUR 7.6M |
| **HKMA** | Sustainable finance taxonomy Phase 2A covering construction | September 2025 |
| **MAS** | Transition planning guidelines mandatory | March 2026 |
| **CBSL (Sri Lanka)** | Direction No. 05 of 2022; SLFRS S2 phased adoption from 2025 | Active |
| **ASEAN Taxonomy v3** | Technical screening criteria for Construction & Real Estate | December 2024 |

### The competitive whitespace

| Capability | Bank platforms (Persefoni, Watershed, MSCI) | Construction LCA tools (OneClick LCA, EC3, Tally) | CarbonIQ |
|---|---|---|---|
| BOQ input processing | No | Yes | Yes |
| A1–A5 embodied carbon calculation | No | Yes | Yes |
| PCAF attribution factor | Yes | No | Yes |
| PCAF-compliant financed emissions output | Yes | No | Yes |
| Bank-ready workflow integration | Yes | No | Yes |

**CarbonIQ is the first platform to bridge both worlds.**

---

## 2. Core Value Proposition — The Proof Case Pipeline

This is the single most important concept. One project flows through 6 stages to produce a bank-ready financed emissions number:

```
BOQ/Material Input
       |
       v
Embodied Carbon Calculation (ICE v3 factors)
       |
       v
Attribution Factor (PCAF formula)
       |
       v
PCAF Data Quality Score (1-5)
       |
       v
Financed Emissions Output (tCO2e)
       |
       v
Annual Report / Portfolio Disclosure
```

### Proof case: Marina Bay Tower (SG-2024-001)

**Stage 1 — BOQ / Material Input**

The bank collects the project's Bill of Quantities at loan origination — material types, volumes, specifications. This data always exists during project design.

| Material | Category | Quantity (kg) | kgCO2e/kg (ICE v3) | Total kgCO2e |
|---|---|---|---|---|
| Concrete C30/37 | Concrete | 850,000 | 0.13 | 110,500 |
| Rebar Steel | Steel | 120,000 | 1.55 | 186,000 |
| Float Glass | Glass | 45,000 | 1.44 | 64,800 |
| **Total** | | | | **361,300** |

**Stage 2 — Embodied Carbon Calculation**

CarbonIQ multiplies each material quantity by its emission factor (sourced from the ICE Database v3, EC3, or project-specific EPDs). The result is total embodied carbon in kgCO2e, broken down by material category and lifecycle stage (A1–A5).

- Total embodied carbon: **361,300 kgCO2e** (361.3 tCO2e)
- Gross floor area: 15,000 m2
- Embodied carbon intensity: **24.1 kgCO2e/m2** (well below SG commercial benchmark of 480)

**Stage 3 — Attribution Factor (PCAF Formula)**

The PCAF v3 attribution formula for project finance:

```
Attribution Factor = Outstanding Amount / (Total Project Equity + Total Project Debt)
                   = $50,000,000 / ($80,000,000 + $120,000,000)
                   = 0.25
```

This means the bank is responsible for 25% of the project's emissions, proportional to its financial exposure.

**Stage 4 — PCAF Data Quality Score**

Because CarbonIQ uses actual BOQ material quantities with standardized ICE v3 emission factors (physical activity-based data), this achieves:

- **DQ Score 2** (Unverified Reported) — project-specific emissions from actual BOQ using standardized factors
- With third-party verified EPDs, upgradeable to **DQ Score 1**
- Current bank baseline without CarbonIQ: **DQ Score 4–5** (sector-average EEIO proxies)

This improvement from Score 5 to Score 2 reduces error margins from ~45–50% to ~10–15%.

**Stage 5 — Financed Emissions Output**

```
Financed Emissions = Attribution Factor x Project Emissions
                   = 0.25 x 361.3 tCO2e
                   = 90.3 tCO2e
```

The bank's financed emissions for this single project: **90.3 tCO2e** at Data Quality Score 2.

**Stage 6 — Annual Report / Portfolio Roll-up**

This project's 90.3 tCO2e is one line item in the bank's annual PCAF v3 disclosure:

| Metric | Value |
|---|---|
| Project | Marina Bay Tower (SG-2024-001) |
| Asset class | Project finance — construction |
| Financed emissions | 90.3 tCO2e |
| Data quality score | 2 |
| Attribution factor | 0.25 |
| Economic intensity | 1.81 tCO2e/$M invested |
| Taxonomy alignment | SG — Aligned (24.1 vs 480 kgCO2e/m2 threshold) |

Aggregated across the full portfolio (87 projects), the bank reports total financed emissions of **48,230 tCO2e** with a weighted average data quality score — a disclosure that satisfies PCAF v3, ISSB S2, and regional regulatory requirements.

---

## 3. System Architecture

### High-level flow

```
Bank Systems (LOS, Core Banking)
       |
       | REST API (JSON)
       v
+---------------------------+
|   CarbonIQ FinTech API    |
|   (Express + Firebase)    |
|                           |
|  /v1/score     — Carbon Finance Score (0-100)
|  /v1/pcaf      — PCAF v3 financed emissions
|  /v1/taxonomy  — Taxonomy alignment check
|  /v1/covenants — Green loan covenant engine
|  /v1/portfolio — Portfolio aggregation
|  /v1/webhooks  — Event notifications
+---------------------------+
       |
       | ICE v3 factors, benchmarks, taxonomy thresholds
       v
+---------------------------+
|   Domain Engine           |
|   (constants.js +         |
|    calculation services)  |
+---------------------------+
       |
       v
Firebase Realtime DB (API keys, audit logs, cached results)
```

### Technology stack

| Layer | Technology | Purpose |
|---|---|---|
| Runtime | Node.js >= 18 | Server environment |
| Framework | Express 4.x | HTTP routing, middleware |
| Validation | Joi 17.x | Schema validation for all inputs |
| Auth | HMAC-SHA256 API keys | Bank client authentication via Firebase |
| Database | Firebase Realtime DB | API key storage, audit logs, rate limit tracking |
| Security | Helmet, CORS, rate limiter | OWASP baseline headers, per-client rate limiting |
| PDF export | PDFKit | Generate PCAF disclosure reports |
| Logging | Morgan + custom audit | Request logging + compliance audit trail |
| Testing | Jest + Supertest | Unit and integration tests (60%+ coverage) |
| Deployment | Netlify Functions (adapter) | Serverless production deployment |

### Authentication model

- Banks receive API keys from their CarbonIQ account manager
- Keys are hashed with HMAC-SHA256 (never stored in plaintext)
- Hashed keys are looked up in Firebase with a 5-minute in-memory cache
- Each key maps to a client record: `{ name, permissions, rateLimit, tier, active }`
- All requests are audit-logged for regulatory compliance

---

## 4. API Endpoints — Detailed Design

### 4.1 POST /v1/score — Carbon Finance Score

**Purpose:** A bank submits a construction project's BOQ and receives a 0–100 carbon finance score with full breakdown.

**Input:**
```json
{
  "project": {
    "name": "Marina Bay Tower",
    "id": "SG-2024-001",
    "location": { "country": "SG", "city": "Singapore" },
    "type": "commercial",
    "grossFloorArea": 15000,
    "storeys": 42,
    "constructionStart": "2024-03-01",
    "constructionEnd": "2027-06-30"
  },
  "materials": [
    {
      "name": "Concrete C30/37",
      "category": "concrete",
      "quantity": 850000,
      "unit": "kg",
      "recycledContent": 15
    },
    {
      "name": "Rebar Steel",
      "category": "steel",
      "quantity": 120000,
      "unit": "kg",
      "recycledContent": 30
    },
    {
      "name": "Float Glass",
      "category": "glass",
      "quantity": 45000,
      "unit": "kg"
    }
  ],
  "benchmarkRegion": "SG",
  "loanAmount": 50000000,
  "currency": "USD"
}
```

**Expected output:**
```json
{
  "score": 78,
  "band": "GREEN",
  "bandDescription": "Good — below regional average",
  "totalEmbodiedCarbon": {
    "value": 361300,
    "unit": "kgCO2e",
    "perM2": 24.1
  },
  "materialBreakdown": [
    { "category": "concrete", "kgCO2e": 110500, "pct": 30.6 },
    { "category": "steel", "kgCO2e": 186000, "pct": 51.5 },
    { "category": "glass", "kgCO2e": 64800, "pct": 17.9 }
  ],
  "benchmark": {
    "region": "SG",
    "threshold": 480,
    "actual": 24.1,
    "status": "excellent"
  },
  "metadata": {
    "calculatedAt": "2026-03-09T10:30:00Z",
    "factorSource": "ICE v3",
    "pcafVersion": "3.0"
  }
}
```

**Scoring logic:**
1. Sum total embodied carbon from BOQ materials (quantity x factor)
2. Calculate carbon intensity (kgCO2e/m2)
3. Compare against regional benchmark thresholds
4. Apply scoring curve: intensity vs benchmark position -> 0–100 score
5. Map to band: Dark Green (80–100), Green (60–79), Amber (40–59), Red (20–39), Dark Red (0–19)

### 4.2 POST /v1/pcaf — PCAF v3 Financed Emissions

**Purpose:** Given a loan + project emissions data, compute PCAF-compliant financed emissions with attribution factor and data quality score.

**Input:**
```json
{
  "loan": {
    "id": "LN-SG-2024-001",
    "amount": 50000000,
    "currency": "USD"
  },
  "property": {
    "value": 200000000,
    "type": "commercial",
    "grossFloorArea": 15000,
    "location": { "country": "SG", "city": "Singapore" }
  },
  "emissions": {
    "totalEmbodied": 361300,
    "totalOperational": 0,
    "dataQuality": 2,
    "methodology": "CarbonIQ BOQ-based calculation using ICE v3 factors"
  }
}
```

**Expected output:**
```json
{
  "attributionFactor": 0.25,
  "financedEmissions": {
    "total": 90.325,
    "unit": "tCO2e",
    "embodied": 90.325,
    "operational": 0
  },
  "dataQuality": {
    "score": 2,
    "label": "Unverified Reported",
    "description": "Project-specific emissions from actual BOQ with standardized ICE v3 factors"
  },
  "intensityMetrics": {
    "physical": null,
    "economic": 1.81,
    "economicUnit": "tCO2e/$M invested"
  },
  "formula": {
    "attribution": "50000000 / (80000000 + 120000000) = 0.25",
    "financed": "0.25 x 361.3 tCO2e = 90.3 tCO2e"
  },
  "pcafVersion": "3.0",
  "calculatedAt": "2026-03-09T10:30:00Z"
}
```

### 4.3 POST /v1/taxonomy — Taxonomy Alignment

**Purpose:** Check a project's carbon intensity against regional taxonomy thresholds (ASEAN v3, EU 2024, HK 2024, SG 2024).

**Expected output:**
```json
{
  "results": [
    {
      "taxonomy": "SG",
      "version": 2024,
      "aligned": true,
      "threshold": 480,
      "actual": 24.1,
      "headroom": 455.9,
      "classification": "Green"
    },
    {
      "taxonomy": "ASEAN",
      "version": 3,
      "aligned": true,
      "threshold": 600,
      "actual": 24.1,
      "headroom": 575.9,
      "classification": "Green"
    }
  ]
}
```

### 4.4 POST /v1/covenants — Green Loan Covenant Engine

**Purpose:** Banks define carbon covenants on green/sustainability-linked loans; CarbonIQ evaluates whether the project is in compliance.

**Example rules:** embodied carbon intensity < 500 kgCO2e/m2, recycled content > 20%, carbon finance score >= 60.

### 4.5 POST /v1/portfolio — Portfolio Aggregation

**Purpose:** Banks submit multiple loans for aggregated PCAF disclosure reporting — total financed emissions, weighted data quality score, grouped by country/type/DQ.

### 4.6 POST /v1/webhooks — Webhook Management

**Purpose:** Subscribe to events (score calculated, threshold breached, covenant violated) for integration with bank alerting systems.

---

## 5. Domain Constants & Reference Data

### Material carbon factors (ICE v3)

| Material | Factor (kgCO2e/kg) | Source |
|---|---|---|
| Concrete | 0.13 | ICE v3 — generic concrete |
| Steel | 1.55 | ICE v3 — generic steel |
| Timber | -1.00 | ICE v3 — softwood (biogenic credit) |
| Aluminium | 6.67 | ICE v3 — primary aluminium |
| Glass | 1.44 | ICE v3 — float glass |
| Insulation | 1.86 | ICE v3 — generic insulation |
| Masonry | 0.24 | ICE v3 — clay bricks |
| Plastics | 3.31 | ICE v3 — generic plastics |

### Regional benchmarks (kgCO2e/m2)

| Region | Excellent | Good | Average | Poor |
|---|---|---|---|---|
| Global | 300 | 500 | 800 | 1200 |
| ASEAN | 350 | 550 | 850 | 1300 |
| EU | 250 | 450 | 700 | 1100 |
| HK | 280 | 480 | 750 | 1150 |
| SG | 300 | 500 | 800 | 1200 |

### Taxonomy thresholds (kgCO2e/m2 maximum)

| Region | Residential | Commercial | Industrial | Infrastructure | Mixed-Use |
|---|---|---|---|---|---|
| ASEAN v3 | 500 | 600 | 800 | 700 | 550 |
| EU 2024 | 350 | 450 | 600 | 550 | 400 |
| HK 2024 | 400 | 500 | 700 | 600 | 450 |
| SG 2024 | 380 | 480 | 650 | 580 | 430 |

### PCAF data quality scores

| Score | Label | Description | How CarbonIQ enables it |
|---|---|---|---|
| 1 | Verified Reported | Third-party verified GHG data | BOQ + verified EPDs + independent audit |
| 2 | Unverified Reported | Project-specific emissions data | BOQ + standardized ICE v3 factors (CarbonIQ default) |
| 3 | Physical Activity-Based | Fuel, energy, production data x factors | Partial BOQ or activity data |
| 4 | Economic (Revenue Known) | Revenue x sector emission intensity | Current bank baseline (with revenue data) |
| 5 | Economic (Revenue Unknown) | Sector averages x asset turnover | Current bank baseline (EEIO only) |

### Carbon finance score bands

| Band | Range | Description |
|---|---|---|
| Dark Green | 80–100 | Exceptional — well below benchmarks |
| Green | 60–79 | Good — below regional average |
| Amber | 40–59 | Moderate — near regional average |
| Red | 20–39 | High carbon — above benchmarks |
| Dark Red | 0–19 | Very high carbon — significantly above benchmarks |

---

## 6. What Is Already Built (Step 1 — Foundation)

### Backend (complete)

| Component | File | Status |
|---|---|---|
| Express server | `server.js` | Done — routes, middleware, error handling |
| Configuration | `config/index.js` | Done — env vars, feature flags, frozen config |
| Firebase setup | `config/firebase.js` | Done — Realtime DB initialization |
| CORS config | `config/cors.js` | Done — per-environment origins |
| Auth middleware | `middleware/auth.js` | Done — HMAC-SHA256 API key + Firebase lookup + cache |
| Rate limiter | `middleware/rate-limiter.js` | Done — global + per-client limits |
| Validation middleware | `middleware/validate.js` | Done — Joi schema validation |
| Audit logger | `middleware/audit.js` | Done — compliance audit trail |
| Error handler | `middleware/error-handler.js` | Done — centralized error responses |
| API v1 router | `routes/v1/index.js` | Done — all 6 endpoint stubs (return 501) |
| Domain constants | `models/constants.js` | Done — material factors, benchmarks, taxonomies, PCAF DQ, score bands |
| All schemas | `schemas/*.js` | Done — Joi validation for all 6 endpoints |
| Tests | `tests/*.test.js` | Done — auth, config, schemas, middleware, health, v1 info |

### Frontend (complete)

| Component | File | Status |
|---|---|---|
| Dashboard UI | `ui/CarbonIQ-Dashboard.html` | Done — 7 pages, Apple-inspired design |

**Dashboard pages:**
1. **Dashboard** — KPIs (total financed emissions, carbon score, data quality, attribution), emissions trend chart, active projects table
2. **Portfolio** — Aggregate view: total outstanding, financed emissions, economic intensity, DQ distribution, regional breakdown, sector allocation
3. **New Project** — Wizard: Step 1 (Project Details) -> Step 2 (Materials/BOQ) -> Step 3 (Loan & Finance) -> Step 4 (Review & Score)
4. **PCAF Calculator** — Finance details input, DQ selector (1–5), live results panel showing attribution factor, financed emissions, scope breakdown
5. **Monitoring** — Project emissions tracking over time, alert thresholds, covenant status
6. **Reports** — PCAF v3 disclosure report generation, compliance checklist, download history
7. **Taxonomy** — ASEAN/EU/HK/SG alignment checker with traffic-light classification

---

## 7. Implementation Roadmap — Backend Steps

### Step 2 — Carbon Finance Score Engine (`/v1/score`)

Build the core calculation service that turns BOQ materials into a 0–100 score.

**What to build:**
- `services/score.js` — Calculation engine:
  - Accept materials array
  - Look up emission factor per material from `MATERIAL_CARBON_FACTORS` (or use provided EPD factor)
  - Handle unit conversions (tonnes -> kg, m3 -> kg via density factors)
  - Sum total embodied carbon (kgCO2e)
  - Calculate carbon intensity (kgCO2e / grossFloorArea m2)
  - Compare against `REGIONAL_BENCHMARKS` for the requested region
  - Apply scoring curve to produce 0–100 score
  - Map to `SCORE_BANDS`
- Wire validation (`scoreRequestSchema`) + route handler in `routes/v1/index.js`
- Tests: valid BOQ in -> correct score out, edge cases (single material, max materials, unknown category fallback)

### Step 3 — PCAF Attribution Engine (`/v1/pcaf`)

Implement the PCAF v3 financed emissions calculation.

**What to build:**
- `services/pcaf.js` — Attribution calculation:
  - Compute attribution factor: `loan.amount / property.value` (or use provided override)
  - Calculate financed emissions: `attributionFactor x (totalEmbodied + totalOperational) / 1000` (convert kg to tonnes)
  - Determine data quality score based on methodology
  - Calculate economic intensity: `financedEmissions / (loanAmount / 1,000,000)`
  - Return structured PCAF v3 output with formula transparency
- Wire validation (`pcafRequestSchema`) + route handler
- Tests: attribution factor math, edge cases (0 operational, custom attribution override)

### Step 4 — Taxonomy Alignment Checker (`/v1/taxonomy`)

Check projects against regional taxonomy thresholds.

**What to build:**
- `services/taxonomy.js` — Alignment evaluation:
  - Look up threshold from `TAXONOMY_THRESHOLDS` for each requested taxonomy + project type
  - Compare actual intensity vs threshold
  - Calculate headroom (threshold - actual)
  - Classify as Green/Amber/Red per ASEAN traffic-light system
  - Factor in certifications as supplementary evidence
- Wire validation + route handler
- Tests: aligned project, misaligned project, multi-taxonomy check, unknown taxonomy/type

### Step 5 — Green Loan Covenant Engine (`/v1/covenants`)

Evaluate project metrics against bank-defined covenant rules.

**What to build:**
- `services/covenants.js` — Rule evaluation:
  - Iterate covenant rules
  - Evaluate each rule (lt, lte, gt, gte, eq, between) against current metrics
  - Return pass/fail per rule with breach details
  - Generate remediation suggestions for breaches
  - Calculate overall covenant compliance status
- Wire validation + route handler
- Tests: all operators, breach detection, between ranges, mixed pass/fail

### Step 6 — Portfolio Aggregation (`/v1/portfolio`)

Aggregate multiple projects into a portfolio-level PCAF disclosure.

**What to build:**
- `services/portfolio.js` — Portfolio engine:
  - Process array of assets
  - Calculate attribution + financed emissions per asset
  - Sum total financed emissions
  - Calculate weighted average data quality score (weighted by financed emissions)
  - Calculate portfolio-level economic intensity
  - Group by requested dimension (country, projectType, dataQuality)
  - Generate distribution statistics
- Wire validation + route handler
- Tests: multi-asset portfolio, grouping, edge cases (single asset, mixed currencies)

### Step 7 — Webhook Management (`/v1/webhooks`)

Event notification system for bank integrations.

**What to build:**
- `services/webhooks.js` — Webhook engine:
  - CRUD operations for webhook subscriptions (stored in Firebase)
  - HMAC-SHA256 payload signing
  - Async delivery with timeout and retry logic
  - Event types: `score.calculated`, `threshold.breached`, `covenant.violated`, `report.generated`
- Wire validation + route handler
- Tests: subscription CRUD, signature verification, retry logic

### Step 8 — PDF Report Generation

Generate downloadable PCAF v3 disclosure reports.

**What to build:**
- `services/report.js` — PDF generation using PDFKit:
  - Cover page with bank branding
  - Executive summary with portfolio KPIs
  - Per-project breakdown table
  - Data quality distribution chart
  - Methodology documentation section
  - Compliance checklist vs PCAF v3 requirements
- New route: `GET /v1/portfolio/:id/report`
- Tests: PDF generation, content verification

### Step 9 — Proof Case Page (HTML Dashboard)

Add a dedicated "Proof Case" page to the HTML dashboard showing the full pipeline.

**What to build:**
- New nav item: "Proof Case" (between Dashboard and Portfolio)
- Single scrollable page with 6 connected stages
- Pre-filled with Marina Bay Tower data
- Interactive: changing BOQ quantities recalculates all downstream numbers live in the browser
- Visual connectors (arrows/chevrons) between stages
- Each stage shows the actual formula/calculation
- Export button generates a one-page summary

### Step 10 — Integration & Hardening

- Connect HTML dashboard to live API (fetch calls to /v1/ endpoints)
- Add loading states, error handling, retry logic in the UI
- E2E test: submit project via New Project wizard -> verify score + PCAF + taxonomy results
- Security audit: input sanitization, rate limit tuning, error message scrubbing
- Performance: response time targets (<200ms for score, <500ms for portfolio aggregation)

---

## 8. Bank Workflow — Where CarbonIQ Plugs In

From the strategic analysis paper, the bank workflow has 10 steps. CarbonIQ has two primary insertion points:

```
Step 1: Loan origination          (Bank collects project specs — NO carbon data today)
Step 2: Credit assessment         (Environmental due diligence — rarely quantified)
   --> CARBONIQ INSERTION POINT A: BOQ -> embodied carbon -> score -> taxonomy
Step 3: Loan approval             (Carbon baseline becomes part of loan docs)
Step 4: Ongoing monitoring        (CarbonIQ updates if materials change)
Step 5: Annual data collection    (ESG team needs emissions per loan)
   --> CARBONIQ INSERTION POINT B: Project-specific emissions data for the portfolio
Step 6: Financed emissions calc   (PCAF attribution formula applied)
Step 7: Data quality scoring      (CarbonIQ achieves Score 2-3 vs baseline Score 4-5)
Steps 8-10: Report, audit, publish
```

### Internal bank users

| Bank team | How they use CarbonIQ |
|---|---|
| Credit/Lending | Assess project carbon risk at origination; structure green loans |
| Risk management | Climate stress testing; transition risk; portfolio concentration |
| ESG/Sustainability | Annual PCAF financed emissions; target-setting; net-zero pathway |
| Finance/Reporting | ISSB S2, CSRD, Pillar 3 regulatory disclosures |
| External auditors | Assurance-grade methodology with reproducible, traceable calculations |

---

## 9. Market Context

### Target markets and size

- **Global construction market:** $16.5 trillion (2025), growing to $21.7 trillion by 2030
- **GCC construction pipeline:** $819 billion active (Saudi Arabia alone: 5,200+ projects)
- **Singapore construction demand:** SGD 50.5 billion (~$38 billion) in 2025
- **PCAF signatories:** 700+ financial institutions across 70+ countries
- **RegTech market:** $17–19 billion, growing at 16–23% CAGR

### First-mover partner: DFCC Bank (Sri Lanka)

- Issuer of Sri Lanka's first Green Bond (LKR 2.5B), first Blue Bond (LKR 3B), first GSS+ Bond
- GCF accreditation granting access to $250 million in climate funding
- Sri Lanka's mandatory SLFRS S2 adoption creates immediate demand
- Commercial Bank of Ceylon has signed MOU with PCAF

---

## 10. Project Structure

```
CarbonIQ-Fin-Tech/
  server.js                  # Express server entry point
  package.json               # Dependencies and scripts
  .env.example               # Environment variable template
  config/
    index.js                 # Centralized frozen config
    firebase.js              # Firebase Realtime DB init
    cors.js                  # CORS configuration
  middleware/
    auth.js                  # API key authentication (HMAC-SHA256)
    rate-limiter.js          # Global + per-client rate limiting
    validate.js              # Joi schema validation
    audit.js                 # Compliance audit trail
    error-handler.js         # Centralized error handling
  models/
    constants.js             # Material factors, benchmarks, taxonomies, PCAF DQ, score bands
  routes/
    v1/
      index.js               # API v1 router (6 endpoint stubs)
  schemas/
    index.js                 # Schema re-exports
    score.js                 # Carbon Finance Score input schema
    pcaf.js                  # PCAF v3 output input schema
    taxonomy.js              # Taxonomy alignment input schema
    covenants.js             # Green loan covenant input schema
    portfolio.js             # Portfolio aggregation input schema
    webhooks.js              # Webhook management input schema
  services/                  # (TO BUILD) Calculation engines
    score.js                 # Carbon Finance Score engine
    pcaf.js                  # PCAF attribution engine
    taxonomy.js              # Taxonomy alignment checker
    covenants.js             # Covenant evaluation engine
    portfolio.js             # Portfolio aggregation engine
    webhooks.js              # Webhook delivery service
    report.js                # PDF report generation
  tests/
    setup.js                 # Jest test setup
    auth.test.js             # Auth middleware tests
    config.test.js           # Config tests
    constants.test.js        # Domain constants tests
    db.test.js               # Firebase DB tests
    error-handler.test.js    # Error handler tests
    health.test.js           # Health endpoint tests
    schemas.test.js          # Schema validation tests
    v1-info.test.js          # V1 info endpoint tests
    validate-middleware.test.js  # Validation middleware tests
  ui/
    CarbonIQ-Dashboard.html  # Self-contained dashboard (7 pages)
    index.html               # Placeholder
    app.js                   # Placeholder
    styles.css               # Placeholder
```

---

## 11. Running the Project

### Prerequisites
- Node.js >= 18.0.0
- Firebase project (Realtime Database) for API key storage

### Local development
```bash
# Install dependencies
npm install

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your Firebase credentials and API key salt

# Start development server (auto-restart on changes)
npm run dev

# Run tests with coverage
npm test

# Dashboard available at: http://localhost:3001/
# API info at: http://localhost:3001/v1
# Health check: http://localhost:3001/health
```

### Key commands
```bash
npm start          # Production server
npm run dev        # Development with auto-restart
npm test           # Run tests with coverage
npm run lint       # ESLint check
npm run lint:fix   # ESLint auto-fix
```

---

## 12. Key Design Decisions

1. **Single-file HTML dashboard** — No build step, no framework. Download and double-click to open in Chrome. Every bank decision-maker can see the product without any setup.

2. **Joi validation on every endpoint** — All input is validated before processing. Schemas serve as living API documentation and prevent malformed data from reaching calculation engines.

3. **HMAC-SHA256 API keys (not JWT)** — Simpler for B2B API integration. Keys are hashed before storage — raw keys never exist in the database. 5-minute cache reduces Firebase load.

4. **Firebase Realtime DB** — Chosen for simplicity in the MVP. API key lookups, audit logs, and webhook subscriptions. Can migrate to PostgreSQL/Firestore later without changing the API surface.

5. **Frozen domain constants** — All material factors, benchmarks, and taxonomy thresholds are `Object.freeze()`-d in `constants.js`. These are regulatory reference data — they should change only via explicit version updates, not at runtime.

6. **Audit trail on every request** — Every API call is logged for regulatory compliance. Banks and their auditors need a complete, traceable record of every carbon calculation.

7. **Feature flags** — Each major capability (covenants, portfolio, taxonomy, certificates, insurance) can be toggled independently via environment variables. Allows incremental rollout.

8. **Express + vanilla Node.js** — No TypeScript, no ORM, no microservices. The codebase is small enough that simplicity is the right choice. The API is a calculation engine, not a CRUD app.

---

## 13. Sri Lanka Green Finance Taxonomy (SLGFT)

> Branch: `claude/srilanka-taxonomy`

### Overview

CarbonIQ supports the **Sri Lanka Green Finance Taxonomy (SLGFT v2024)**, regulated by the
Central Bank of Sri Lanka (CBSL). This is the 5th taxonomy framework alongside ASEAN, EU, HK, and SG.

Implemented as a dedicated feature branch for DFCC Bank — Sri Lanka's first green bond issuer.

### Framework Details

| Field             | Value                                  |
|-------------------|----------------------------------------|
| Regulator         | Central Bank of Sri Lanka (CBSL)       |
| Version           | SLGFT v2024                            |
| SLSIC Sectors     | 13 sectors (A–M)                       |
| Env. Objectives   | M · A · P · E                          |
| Carbon Tax        | Voluntary (SLCCE); proposed post-2027  |

### Environmental Objectives

| Code | Label                                     |
|------|-------------------------------------------|
| M    | Climate Change Mitigation                 |
| A    | Climate Change Adaptation                 |
| P    | Pollution Prevention & Control            |
| E    | Ecological Conservation & Resource Efficiency |

### Embodied Carbon Thresholds (Construction, kgCO2e/m²)

| Tier         | Threshold      |
|--------------|----------------|
| Green        | ≤ 600          |
| Transition   | ≤ 900          |
| Not Aligned  | > 900          |

### Key Construction Activities

| Activity Code | Label                               | Eligibility  |
|---------------|-------------------------------------|--------------|
| M1.1          | Green Buildings — New Construction  | Threshold    |
| M1.2          | Green Buildings — Renovation        | Direct       |
| M4.1          | Solar PV — Electricity Generation   | Direct       |
| M4.2          | Concentrated Solar Power (CSP)      | Direct       |
| M4.3          | Wind Energy                         | Direct       |
| A2.1          | Flood-Resilient Construction        | Direct       |
| A2.2          | Climate-Resilient Buildings         | Threshold    |
| E1.1          | Coastal & Marine Resource Protection| Direct       |

### NDC & SDG Alignment (Claude AI-powered)

The `POST /v1/ndc-sdg/assess` endpoint uses **Claude claude-sonnet-4-6** with prompt caching to:

1. Assess NDC alignment tier (Strong / Moderate / Partial / Not Aligned)
2. Estimate % contribution to Sri Lanka's 4.5% unconditional NDC target
3. Identify relevant SDGs (from the 6 key SDGs: 7, 9, 11, 13, 14, 15)
4. Perform DNSH check across all 4 environmental objectives
5. Generate bankability narrative for the lending officer
6. Provide concrete recommendations

**NDC Targets (Sri Lanka)**:
- Unconditional: 4.5% GHG reduction by 2030 vs BAU
- Conditional: 14.5% GHG reduction by 2030 (with international support)
- Net Zero: 2050

### Frontend Integration

- **New Project Wizard** — Step 1 shows SLSIC sector dropdown + activity code when region = LK
- **Taxonomy Checker** — 5th framework card (full-width) with NDC, SDG pills, DNSH checklist
- **NDC & SDG page** — Dedicated page (`/ndc-sdg`) with AI analysis form and interactive results

### Carbon Pricing (Sri Lanka)

No formal carbon tax. Voluntary SLCCE market operational.
Trajectory: LKR 500/tCO2e proposed floor (2027) → LKR 1,500/tCO2e NDC alignment (2030).

---

*Last updated: March 2026*
*Version: 0.2.0 — Sri Lanka SLGFT (Steps 1–4)*
*License: Apache-2.0*
