# CarbonIQ FinTech — Master Briefing Document
## For Sri Lanka Finance Ministry Proposal Preparation

**Date:** 6 June 2026
**Status:** Production Platform — Live on Netlify, DFCC Bank MVP Ready
**Repository:** github.com/mmushrif05/CarbonIQ-Fin-Tech

---

## EXECUTIVE SUMMARY

CarbonIQ FinTech is the **first platform globally** that converts construction project Bill of Quantities (BOQ) data into PCAF-compliant financed emissions output for banks. It bridges the gap between construction-level carbon intelligence and financial institution reporting requirements.

**For Sri Lanka specifically**, CarbonIQ provides:
- Full **CBSL Direction No. 05/2022** compliance automation
- **SLFRS S2** climate disclosure report generation
- **Sri Lanka Green Finance Taxonomy (SLGFT)** alignment checking
- **DFCC Bank** as identified first-mover partner (issuer of Sri Lanka's first Green Bond, LKR 2.5B)
- **LKR currency** and Sri Lankan carbon pricing trajectory built into all financial models

The platform is designed for the **FinTech Innovation Lab Asia-Pacific (FILAP) 2026** competition and positions Sri Lanka as a regional leader in AI-powered green finance compliance.

---

## 1. THE PROBLEM WE SOLVE

### The Construction Carbon Data Gap

Banks face an urgent, regulation-driven need to report financed emissions for construction lending — yet no tool exists that converts project-level material data into PCAF-compliant output.

**The gap in numbers:**
- Financed emissions represent **at least 95%** of banks' total carbon footprint
- Construction and real estate represents **10–24%** of bank loan books
- Banks currently achieve PCAF data quality scores of **4–5 (worst possible)** for construction
- Sector-average proxies (EEIO models) diverge from actual emissions by **100–200%**
- EEIO **cannot distinguish** between a low-carbon mass-timber building and a high-carbon reinforced concrete tower

### Why This Matters for Sri Lanka Now

| Regulation | Impact | Timeline |
|---|---|---|
| **CBSL Direction No. 05/2022** | Mandates green finance classification for all licensed banks | Active |
| **SLFRS S2** | Sri Lanka Financial Reporting Standard for Sustainability — phased adoption | From FY 2025 |
| **PCAF v3** (Third Edition) | 10 asset classes including project finance; mandatory DQ scores | December 2025 |
| **ISSB S2** | Mandatory financed emissions disclosure by Scope 1, 2, 3 | 36 jurisdictions adopting |
| **ASEAN Taxonomy v3** | Technical screening criteria for Construction & Real Estate | December 2024 |

### Competitive Whitespace

| Capability | Bank Platforms (Persefoni, Watershed, MSCI) | Construction LCA (OneClick LCA, EC3) | CarbonIQ |
|---|---|---|---|
| BOQ input processing | No | Yes | **Yes** |
| A1–A5 embodied carbon | No | Yes | **Yes** |
| PCAF attribution factor | Yes | No | **Yes** |
| PCAF-compliant financed emissions | Yes | No | **Yes** |
| Bank-ready workflow integration | Yes | No | **Yes** |
| Multi-taxonomy alignment (ASEAN/EU/HK/SG/SL) | Partial | No | **Yes** |
| AI-powered automated analysis | No | No | **Yes** |

**CarbonIQ is the first platform to bridge both worlds.**

---

## 2. WHAT HAS BEEN BUILT — COMPLETE PLATFORM INVENTORY

### 2.1 Technology Stack

- **Backend:** Node.js / Express REST API
- **AI Engine:** Anthropic Claude API (Opus, Sonnet, Haiku models)
- **Database:** Firebase Admin (Firestore)
- **Deployment:** Netlify Functions (serverless)
- **Frontend:** Custom SPA dashboard (vanilla JS, Apple-inspired design)
- **Authentication:** Dual-mode — JWT for bank portals, API Key for system integrations
- **Authorization:** Hybrid RBAC + ABAC (6 stakeholder roles, 9 granular permissions)

### 2.2 API Endpoints (Production)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check — no auth |
| `POST` | `/v1/assess` | Full project carbon assessment (AI-powered) |
| `GET/POST` | `/v1/projects` | List / create projects |
| `POST` | `/v1/score` | Carbon Finance Score (CFS 0–100) |
| `GET` | `/v1/taxonomy` | Multi-framework taxonomy alignment |
| `POST` | `/v1/pcaf` | PCAF v2.0 financed emissions output |
| `POST/GET` | `/v1/covenant` | Green loan covenant check / full SLL suite |
| `GET` | `/v1/portfolio` | Portfolio carbon risk aggregation |
| `POST/DELETE` | `/v1/webhook` | Webhook subscription management |
| `POST` | `/v1/extract` | AI BOQ material extraction (Claude Vision) |
| `POST` | `/v1/agent/coach` | AI Borrower Coaching (pre-application) |
| `POST` | `/v1/agent/originate` | Green Loan Origination Agent |
| `POST` | `/v1/agent/screen` | Pre-Screening Agent |
| `POST` | `/v1/agent/underwrite` | Underwriting Agent |
| `POST` | `/v1/agent/triage` | Decision Triage (deterministic + AI) |
| `POST` | `/v1/agent/covenants` | Covenant Design Agent |
| `POST` | `/v1/agent/monitor` | Monitoring Agent |
| `POST` | `/v1/agent/portfolio` | Portfolio Reporting Agent |
| `POST` | `/v1/agent/covenants/:runId/review` | EU AI Act Art. 22 Human Review |
| `POST` | `/v1/supervisor/pipeline` | Multi-agent pipeline orchestration |
| `GET` | `/v1/supervisor/templates` | Available pipeline templates |
| `POST` | `/v1/reports/generate` | Regulatory report generation (5 formats) |
| `POST` | `/v1/carbon-pricing/calculate` | Carbon tax & financial impact analysis |

### 2.3 Eight-Stage AI Agent Pipeline

The core innovation — an 8-stage green loan lifecycle powered by Claude AI:

| Stage | Agent | What It Does | Model |
|-------|-------|-------------|-------|
| Pre-Application | **Borrower Coaching** | Scores application completeness (0–100%), pre-computes carbon estimates, generates personalised coaching report. Validated +32% application completion rate. | Claude Opus |
| Stage 1 | **Loan Origination** | End-to-end green loan origination: parses BOQ, runs taxonomy screening (ASEAN/EU/HK/SG/SL), computes CFS, produces complete Origination Decision Package. | Claude Opus |
| Stage 2 | **Pre-Screening** | Benchmark-based eligibility assessment before BOQ exists. Returns Go/Conditional/No-Go with P25/P50/P75 carbon ranges. | Claude Haiku |
| Stage 3 | **Underwriting** | Full green loan underwriting from BOQ. Extracts materials, computes embodied carbon, checks all taxonomies, drafts Underwriting Memo. | Claude Opus |
| Stage 4 | **Decision Triage** | Deterministic tier classifier (resolves 70–85% instantly, zero AI cost). Tier 1: Auto-approve/decline. Tier 2: AI Decision Review Memo. Tier 3: Manual escalation. | Claude Opus |
| Stage 5 | **Covenant Design** | Designs 3-scenario covenant package (Conservative/Standard/Ambitious). Stress-tests KPIs, drafts APLMA-aligned terms with pricing ratchet. EU AI Act Art. 22 compliant. | Claude Opus |
| Stage 6 | **Monitoring** | Tests covenants against current metrics. Projects trajectory to completion. Produces Drawdown Recommendation (Approve/Conditional/Hold). | Claude Opus |
| Stage 7 | **Portfolio Reporting** | Aggregates green loan portfolio for PCAF/TCFD/GLP 2025 ESG disclosure. Calculates financed emissions, CFS distribution, taxonomy alignment. | Claude Opus |

### 2.4 Multi-Agent Supervisor Pipelines

Three pre-built pipeline templates orchestrate agents with dependency resolution and parallel execution:

1. **Green Loan Origination Pipeline:** Screen → Originate → Covenants (with human review gate)
2. **Quick Assessment Pipeline:** Screen ∥ Underwrite → Triage (parallel first stages)
3. **Monitoring Review Pipeline:** Monitor → Portfolio update

### 2.5 Regulatory Report Generation

Five regulatory-grade report formats, generated instantly:

| Report | Standard | Coverage |
|--------|----------|----------|
| **PCAF Annual Disclosure** | PCAF v3 (Dec 2025) | Financed emissions, attribution factors, DQ scores, YoY analysis |
| **GRI 305 Emissions** | GRI 305: 2016 | Scope 1/2/3, intensity ratios, reduction initiatives |
| **TCFD Climate Risk** | TCFD 2017/2021 | Governance, Strategy, Risk Management, Metrics & Targets, scenario analysis |
| **IFRS S2 Climate Disclosures** | IFRS S2 / ISSB (2023) | Risks & opportunities, financial effects, resilience scenarios, transition plan |
| **SLGFT CBSL Disclosure** | CBSL Direction No. 05/2022 · SLFRS S2 | Green lending classification, SLFRS S2 climate reporting, DFCC benchmarks, ESG metrics |

### 2.6 Taxonomy Alignment Engine

Five regional green finance taxonomy frameworks with real-time compliance checking:

| Framework | Thresholds (kgCO2e/m²) | Source |
|-----------|----------------------|--------|
| **ASEAN Taxonomy v3** | Green ≤ 500, Transition ≤ 800 | ASEAN Taxonomy Board |
| **EU Taxonomy 2024** | Aligned ≤ 500, Near ≤ 750, DNSH criteria | EU Climate Delegated Act |
| **HK Green Finance 2024** | Dark Green ≤ 450, Light Green ≤ 650 | HKMA Green Classification |
| **SG Green Mark 2021** | Certified ≤ 480, Near ≤ 700 | BCA Green Plan 2030 |
| **Sri Lanka SLGFT / CBSL** | Green ≤ 520, Transition ≤ 780 | CBSL Direction No. 05/2022 |

### 2.7 Carbon Finance Score (CFS)

Proprietary 0–100 scoring system for construction loan risk assessment:

| Component | Weight | Description |
|-----------|--------|-------------|
| Material EPD Coverage | 30% | % of 80% materials with verified EPDs |
| Compliance Workflow | 20% | % of entries through approval workflow |
| Verification Status | 15% | External verifier sign-off |
| Carbon Reduction | 20% | Actual reduction % vs baseline |
| Green Certification | 15% | Certification level achieved |

**Classification:** CFS ≥ 70 = Green | CFS 40–69 = Transition | CFS < 40 = Brown

### 2.8 Carbon Pricing & Financial Impact Engine

Converts physical carbon (tCO2e) into financial dollar values for 5 jurisdictions:

| Region | Currency | Current Rate | 2030 Projected |
|--------|----------|-------------|----------------|
| Singapore | SGD | 45/tCO2e | 50–80/tCO2e |
| EU ETS | EUR | 65/tCO2e | 110/tCO2e |
| Malaysia | MYR | 35/tCO2e | 75/tCO2e |
| Hong Kong | HKD | 0 (no tax) | 80/tCO2e |
| **Sri Lanka** | **LKR** | **0 (emerging)** | **1,500/tCO2e** |

**Outputs:** Carbon tax exposure, green loan pricing adjustment (bps), stranded asset risk, price sensitivity table.

### 2.9 Stakeholder Access Control (RBAC + ABAC)

Six stakeholder roles with granular permissions, following NIST ABAC model:

| Role | Level | Access |
|------|-------|--------|
| Bank Administrator | 100 | Full platform control |
| Credit Officer | 80 | Loan origination, covenant approval, monitoring |
| ESG Analyst | 60 | Carbon assessment, taxonomy, PCAF, portfolio, pipelines |
| Relationship Manager | 40 | Screening, coaching, carbon pricing |
| Auditor | 30 | Read-only: all runs, reports, audit trails |
| Borrower | 10 | Self-service coaching, application status |

**ABAC Rules:** Organisation boundary enforcement, project scope restrictions, loan amount thresholds (SGD 50M for RMs), EU AI Act Art. 22 human review gate (credit officers only).

### 2.10 Frontend Dashboard

Complete SPA dashboard with 12 pages:

| Page | Function |
|------|----------|
| **Login** | Stakeholder role selection with 6 role cards, session management |
| **Dashboard** | Portfolio KPIs: financed emissions, data quality, coverage, taxonomy alignment |
| **Portfolio** | Aggregated emissions analysis with asset breakdown |
| **AI Agents** | 8-stage green loan lifecycle with interactive forms and markdown reports |
| **AI BOQ Extract** | Paste/upload BOQ → Claude maps materials to ICE v3 carbon factors |
| **New Project** | 4-step wizard: Details → BOM → Finance → Review & Score |
| **PCAF Calculator** | Financed emissions attribution with 5-tier DQ selector |
| **Monitoring** | Annual submission tracking, trajectory visualization |
| **Pipelines** | Multi-agent supervisor workflows with 3 pipeline templates |
| **Carbon Pricing** | Financial impact calculator (tax, loan pricing, stranded risk) |
| **Reports** | 5-format regulatory report generation (PCAF, GRI, TCFD, IFRS, SLGFT) |
| **Taxonomy** | Real-time alignment check against 5 frameworks (incl. CBSL/SLGFT) |

### 2.11 Claude AI Skills Integrated

| Skill | Where Used | Purpose |
|---|---|---|
| **Agentic Tool Loop** | All 8 agents | Multi-turn tool-calling loop driving each agent |
| **Adaptive Thinking** | Deep reasoning agents | PCAF attribution, multi-taxonomy, covenant stress-testing |
| **Streaming** | Agent pipeline | Prevents Netlify 10s timeout; supports 32K output |
| **Prompt Caching** | All agent calls | 3 cache breakpoints per iteration; 60–80% input cost reduction |
| **Structured Outputs** | BOQ extraction | Guaranteed JSON from PDF extraction — no regex |
| **Files API** | BOQ upload | Upload PDFs once → reuse across extractions for 30 days |
| **PDF Vision** | BOQ reading | Claude reads multi-column PDF tables directly |
| **Web Search** | Underwriting agent | Live carbon tax rates, green bond pricing |
| **Web Fetch** | Underwriting agent | Current regulatory pages (MAS, EU ETS, PCAF) |
| **Pause Turn Resumption** | Agent loops | Resumes tool loops hitting 10-iteration limit |

---

## 3. SRI LANKA — DEEP INTEGRATION

### 3.1 CBSL Direction No. 05/2022 Implementation

**Backend (Production-Ready):**
- Complete taxonomy engine with classification logic (config/constants.js)
- Green threshold: ≤ 520 kgCO2e/m², Transition: ≤ 780 kgCO2e/m²
- `checkSL()` function in taxonomy service alongside ASEAN/EU/HK/SG
- Mandatory `requiresSLFRS_S2: true` flag enforced

**Frontend (User-Facing):**
- Sri Lanka SLGFT/CBSL appears as 5th taxonomy framework in alignment checker
- Colombo Green Tower as demo project (460 kgCO2e/m² — Green classified)

### 3.2 SLFRS S2 Compliance Reporting

**Full Report Generator (services/reports.js):**
- Report type: `slgft-cbsl`
- Sections generated:
  1. CBSL Direction No. 05 compliance status with green/transition/brown lending ratios
  2. SLFRS S2 climate disclosures with risk assessment (transition + physical)
  3. Financial effects quantification (green pricing benefit, carbon tax exposure)
  4. SLGFT taxonomy alignment with kgCO2e/m² thresholds
  5. ESG metrics (emissions, data quality, carbon intensity)
  6. DFCC Bank benchmark data (green bond, blue bond, GCF accreditation)
  7. Targets with progress tracking (50% green by 2027, full SLFRS S2 by 2026)

### 3.3 Green SL Certification Framework

Two certification levels defined and validated across all 8 agent schemas:
- **Green SL Platinum:** Minimum 40% reduction from baseline
- **Green SL Gold:** Minimum 25% reduction from baseline

### 3.4 LKR Carbon Pricing Module

- Exchange rate: ~1 USD = 323 LKR (Apr 2026)
- Current carbon tax: LKR 0 (no direct tax)
- Projected trajectory: LKR 500/tCO2e by 2027, LKR 1,500/tCO2e by 2030
- Stranded asset risk threshold: 520 kgCO2e/m² (matching SLGFT Green)
- Notes: CBSL exploring carbon levy; SLFRS S2 creates implicit pricing through disclosure

### 3.5 DFCC Bank Integration

- **First-mover partner** identified in all strategic documents
- Green Bond: LKR 2.5B (Sri Lanka's first)
- Blue Bond: LKR 3.0B (Sri Lanka's first)
- First GSS+ Bond issuer in Sri Lanka
- GCF accreditation: Access to USD 250M in climate funding
- Demo data uses DFCC context: `kamal.perera@dfcc.lk`, `DFCC Bank`
- MVP scope explicitly designed for "competition + DFCC" demo flow

### 3.6 Sri Lanka Across Every Surface

| Component | Sri Lanka Integration |
|-----------|----------------------|
| Region dropdown | "Sri Lanka" in all agent forms |
| Certifications | Green SL Platinum, Green SL Gold |
| Taxonomy checker | SLGFT/CBSL (5th framework) |
| Carbon pricing | SL jurisdiction with LKR trajectory |
| PCAF calculator | LKR currency option |
| Reports | SLGFT CBSL disclosure report |
| Pipeline UI | Colombo Green Tower as example project |
| Login | DFCC Bank as placeholder organisation |
| Backend schemas | LK/SL validated across all endpoints |

---

## 4. BUSINESS MODEL & MARKET POSITIONING

### 4.1 Revenue Model

- **SaaS subscription** per bank (tiered by portfolio size)
- **Transaction fees** per assessment/agent run
- **Enterprise licensing** for regulatory report generation
- API access for system integrations

### 4.2 Target Market

- **Primary:** Licensed commercial banks in Sri Lanka (CBSL-regulated)
- **First Mover:** DFCC Bank — immediate demand driver via mandatory SLFRS S2
- **Expansion:** APAC green finance ecosystem (Singapore, Hong Kong, Malaysia)
- **Competition Entry:** FinTech Innovation Lab Asia-Pacific (FILAP) 2026

### 4.3 The Ask

**Pilot with 1 bank (DFCC) → 10 projects → production deployment**

### 4.4 Key Differentiators

1. **Only platform** bridging BOQ-level carbon data to PCAF-compliant bank output
2. **First SLGFT/CBSL compliance automation** for Sri Lankan banks
3. **AI-native** — 8-stage agentic pipeline, not retrofitted prompts
4. **Multi-regulatory** — 5 taxonomy frameworks, 5 report standards in single platform
5. **EU AI Act compliant** — Art. 22 human review gates for covenant decisions
6. **Production-grade** — full RBAC, audit trails, rate limiting, encryption

---

## 5. REGULATORY COMPLIANCE MATRIX

| Regulation | Status in CarbonIQ | Coverage |
|---|---|---|
| CBSL Direction No. 05/2022 | **Implemented** | Green finance classification, lending ratios |
| SLFRS S2 | **Implemented** | Full disclosure report generator |
| PCAF v3 (Dec 2025) | **Implemented** | Financed emissions, attribution factors, DQ 1–5 |
| ISSB S2 (IFRS) | **Implemented** | Climate disclosure report generator |
| ASEAN Taxonomy v3 | **Implemented** | Construction embodied carbon thresholds |
| EU Taxonomy 2024 | **Implemented** | DNSH criteria, WLC threshold |
| HK Green Finance 2024 | **Implemented** | Dark/Light Green classification |
| SG Green Mark 2021 | **Implemented** | Green Mark levels, carbon tax |
| EU AI Act Art. 22 | **Implemented** | Human review gate for covenant decisions |
| GRI 305 | **Implemented** | Scope 1/2/3 emissions reporting |
| TCFD | **Implemented** | Four-pillar climate risk reporting |
| LMA/APLMA GLP 2021 | **Implemented** | Green loan covenant templates |

---

## 6. DEVELOPMENT TIMELINE

| Phase | Commits | What Was Built |
|-------|---------|----------------|
| Foundation | PRs #1–#36 | Express API, Firebase bridge, BOQ extraction, PCAF engine, taxonomy alignment, UI dashboard |
| AI Agents | PRs #37–#39 | Claude API integration, agentic tool loop, structured outputs, web search |
| Lifecycle Stages | PRs #40–#42 | 8-stage agent pipeline, borrower coaching (+32% completion), origination, EU AI Act HITL |
| Supervisor | PR #43 | Multi-agent supervisor pattern, hybrid RBAC/ABAC authorization, pipeline orchestration |
| Sri Lanka | PRs #44–#46 | SLGFT/CBSL taxonomy, SLFRS S2 reports, LKR pricing, Green SL certs, stakeholder login UI, pipeline UI, covenant review panel |

---

## 7. TECHNICAL ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Dashboard (SPA)                  │
│  Login │ Dashboard │ Agents │ Pipelines │ Reports │ Taxonomy │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS / API Key / JWT
┌────────────────────────▼────────────────────────────────────┐
│              Express API (Netlify Functions)                 │
│  ┌──────┐ ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │
│  │ RBAC │ │Rate Limit│ │  Audit   │ │    Validation     │  │
│  │ ABAC │ │ per-tier │ │  Logger  │ │   (Joi Schemas)   │  │
│  └──┬───┘ └────┬─────┘ └────┬─────┘ └────────┬──────────┘  │
│     └──────────┴────────────┴─────────────────┘             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              8 AI Agents (Claude API)                 │   │
│  │  Coach → Originate → Screen → Underwrite → Triage    │   │
│  │  → Covenants (+ HITL Review) → Monitor → Portfolio   │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │  Score   │ │   PCAF   │ │ Taxonomy │ │   Carbon     │   │
│  │  Engine  │ │  Engine  │ │  Engine  │ │   Pricing    │   │
│  │ (CFS)   │ │  (v3)    │ │ (5 fwks) │ │  (5 regions) │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │          Supervisor / Pipeline Orchestrator           │   │
│  │   3 templates · parallel execution · human gates     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────┬───────────────────────────────────┘
                          │
              ┌───────────▼───────────┐
              │   Firebase / Firestore │
              │   (Read-Only Bridge)   │
              └───────────────────────┘
```

---

## 8. TEST COVERAGE

- **27 test suites**, 59 passing tests
- Coverage: authorization, borrower coaching, decision triage, supervisor pipelines, health check, API info, reports
- Integration tests via supertest against Express app

---

## 9. DEPLOYMENT

- **Production:** Netlify Functions (serverless-http adapter)
- **CI/CD:** GitHub Actions for automated testing and deployment
- **Local Dev:** Express server with static UI serving + Firebase emulator (Docker)

---

*This document represents the complete state of CarbonIQ FinTech as of 6 June 2026. All features described are implemented in the codebase and deployed to production.*
