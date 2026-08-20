# CarbonIQ FinTech — Project Brief
**Mohamed Mushrif** · mmushrif05@gmail.com

---

## What I Built

**CarbonIQ FinTech** is a production-grade REST API that sits between construction project data and financial institutions — enabling banks to assess, score, and report on the carbon risk of the loans they issue to property developers. It is the bank-facing intelligence layer of a broader carbon management platform I designed and built end-to-end.

The system is live, deployed on Netlify serverless infrastructure, and integrated with Firebase (Firestore) for real-time data and audit persistence.

---

## The Problem It Solves

Green finance regulation is accelerating — EU Taxonomy (2024), ASEAN Green Taxonomy v3, Hong Kong Green Classification Framework, PCAF v2.0 — but banks lack the tooling to operationalise these standards at the loan level. Analysts manually assess construction projects against multiple frameworks, struggle to collect complete borrower data, and have no automated way to triage thousands of loan applications by climate risk.

CarbonIQ FinTech solves all three layers: **data collection, risk intelligence, and decision workflow.**

---

## Architecture & Methodology

The API exposes 9 specialised endpoints serving a 5-agent AI pipeline powered by the Anthropic Claude API:

| Agent | Function |
|---|---|
| **Screening** | Rapid pre-qualification via pre-computed carbon estimates |
| **Underwriting** | Deep PCAF v2.0 financed emissions + multi-taxonomy alignment |
| **Origination** | Loan structuring with live carbon tax rates (web search) |
| **Covenants** | Sustainability-Linked Loan design per LMA/APLMA GLP 2021 |
| **Monitoring** | Annual covenant tracking and EPD gap analysis |

Each agent uses **Claude's adaptive thinking** for multi-regulation reasoning, **prompt caching** (3 breakpoints per loop, 60–80% cost reduction), and **streaming** to avoid Netlify's 10-second timeout on complex analyses.

---

## Two Workflows I Designed from Research

**1 — AI Borrower Coaching** (`POST /v1/agent/coach`)
Guided by real-world data showing AI coaching raises loan application completion rates by 32%, I built a pre-screening agent that meets borrowers where they are — scoring 10 weighted application fields (BOQ, building type, floor area, certification target, LCA status, etc.), identifying exactly what is missing, and generating plain-English guidance explaining PCAF, EPDs, and carbon benchmarks without jargon. This feeds a readiness signal (`readyForScreening / readyForUnderwriting / readyForDecision`) directly into the bank's loan origination system.

**2 — Tiered Decision Framework** (`POST /v1/agent/triage`)
Modelled on the bank loan operations literature showing that 70–85% of standardised decisions can be safely automated, I designed a deterministic classifier that routes each application to the correct tier before any AI call is made:

- **Tier 1 Auto-Decision (70–85%):** CFS ≥ 70 + taxonomy aligned + PCAF ≤ 3 + loan ≤ $50M → auto-approve; Brown CFS + no alignment → auto-decline
- **Tier 2 AI-Assisted Review (10–20%):** Borderline cases get a structured 8-section AI memo for the credit analyst
- **Tier 3 Manual Review (5–10%):** Loans > $100M, PCAF data quality unknown, or forced escalation

The system is **EU AI Act Article 22 compliant** — all Tier 2 covenant designs carry `PENDING_HUMAN_REVIEW` status with a full audit trail persisted to Firestore, enforcing human oversight before any loan terms are finalised.

---

## Standards & Research Grounding

| Standard | Implementation |
|---|---|
| PCAF v2.0 | Financed emissions attribution, data quality scores 1–5, asset-class weighting |
| EU Taxonomy (2024) | Technical screening criteria for construction, DNSH assessment |
| ASEAN Green Taxonomy v3 | Traffic-light classification (≤500 / ≤800 kgCO2e/m²) |
| HK Green Classification (2024) | Eligibility screening for HK-domiciled assets |
| LMA/APLMA GLP 2021 | Sustainability-Linked Loan covenant design and KPI calibration |
| EU AI Act Art. 22 | Human-in-the-loop enforcement for AI-assisted credit decisions |

---

## Technical Depth

- **Stack:** Node.js · Express · Firebase Admin (Firestore) · Anthropic Claude API (`claude-opus-4-6` / `claude-haiku-4-5`) · Joi validation · Jest (26 tests) · Netlify Functions · Docker
- **AI Skills in Production:** Agentic tool loop · Adaptive thinking · Streaming · Prompt caching · Structured outputs · Files API (PDF BOQ extraction) · Web search + fetch (live carbon tax rates)
- **Security:** Dual-mode auth (JWT + SHA-256 hashed API keys) · Rate limiting by tier · AES-256 data encryption · Audit logging on all compliance operations
- **Scale design:** Batch API integration planned for portfolio > 10 assets (50% cost reduction); Code Execution tool for PCAF sensitivity tables

---

*This project represents approximately 6–9 months of design, research, and engineering work across green finance regulation, multi-agent AI architecture, and bank-facing API development.*
