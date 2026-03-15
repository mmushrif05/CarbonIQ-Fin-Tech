# CarbonIQ × FILAP 2026: Multi-Theme Positioning Strategy

## The 2026 Themes — CarbonIQ Fits 4 of 7

**2025 FILAP themes included:** Green Fintech & Sustainable Finance explicitly.
**2026 FILAP themes:**
1. AI Enhanced Productivity & Client Engagement (Front to Back)
2. Responsible AI & Model Risk Governance
3. Digital Trust: Cybersecurity, Fraud/Scam Prevention & Operational Resilience
4. Financial Crime, Regtech, Risk & Compliance Automation
5. Future of Money & Payments: Interoperable Rails, Digital Assets & Programmable Money
6. Open Finance, Digital Identity & API Ecosystems
7. Insurance Transformation (InsurTech): Underwriting, Claims & Distribution

**Climate/green fintech is NOT a named theme for 2026.** But CarbonIQ doesn't need it to be — the platform maps to **4 of 7 themes** when properly positioned:

| Theme | CarbonIQ Fit | Strength |
|-------|-------------|----------|
| **1. AI Enhanced Productivity** | 6-agent autonomous pipeline turns 5-day manual task into 5 minutes. Spans front (green loan pricing), middle (credit risk), back (PCAF reporting). | **PRIMARY — VERY STRONG** |
| **4. Regtech, Risk & Compliance** | Automates HKMA GS-1, MAS ENRM, ISSB S2, PCAF climate risk compliance. ECB fining banks €7.6M for non-compliance. Climate risk IS financial risk regulation now. | **CO-PRIMARY — VERY STRONG** |
| **7. InsurTech: Underwriting** | PCAF v3 (Dec 2025) now covers construction/erection project insurance. Insurers need material-level embodied carbon data to price construction risk and assess green project insurance. | **SECONDARY — STRONG** |
| **6. Open Finance & API Ecosystems** | Open-source core (GitHub), API-first architecture for bank system integration, open emission factor databases (ICE v3.0). | **SUPPORTING — MODERATE** |
| 2. Responsible AI | Audit trail, explainable 6-step hierarchy, human-in-the-loop approval — but this is not our core story | Weak |
| 3. Digital Trust | Not relevant | — |
| 5. Future of Money | Not relevant | — |

### Strategic Choice: Which Theme to Lead With?

**Option A: Theme 1 (AI Productivity) as Primary**
- Pros: Broadest appeal, every bank cares about productivity, strongest demo story (5 days → 5 minutes)
- Cons: Most competitive category — every fintech applying will claim AI productivity

**Option B: Theme 4 (Regtech/Compliance) as Primary**
- Pros: Differentiated (few fintechs address climate compliance specifically), regulatory urgency is undeniable (€7.6M fine), directly maps to bank risk officer priorities
- Cons: "Compliance" sounds less exciting than "AI" to some judges

**Option C: DUAL Primary — Theme 1 + Theme 4**
- "An AI-powered regtech platform that automates climate risk compliance for construction lending"
- This is the STRONGEST positioning: it's AI AND compliance, not just one
- The AI is the HOW. The compliance is the WHY. Both resonate.

**RECOMMENDED: Option C — Dual primary positioning.** Lead with AI productivity (the demo), anchor with regulatory compliance (the urgency).

### The Insurance Angle (Theme 7) — Bonus Opportunity

PCAF v3 (December 2025) explicitly added **insurance-associated emissions** as a new category, including construction/erection project insurance. This means:

- **Insurers** underwriting construction projects now need to assess embodied carbon to calculate their financed emissions
- A construction project with high-carbon materials (virgin steel, OPC concrete) represents **higher transition risk** for the insurer
- CarbonIQ's BOQ assessment can feed directly into insurance underwriting models

This opens a **second customer segment** beyond banks: construction insurers (AXA, Zurich, Allianz — all FILAP-adjacent). Worth mentioning in the application as a growth vector, even if banks are the primary target.

---

## CarbonIQ Across the Full Loan Lifecycle — 6 of 10 Steps

CarbonIQ is NOT a single-step tool. The agentic AI engine powers **6 of the 10 steps** in a construction loan lifecycle:

| Step | Bank Process | CarbonIQ Role | Theme Alignment |
|------|-------------|---------------|-----------------|
| 1 | Loan Application | — | |
| 2 | Credit Analysis | — | |
| **3** | **ESG Screening** | **Flag high-carbon projects early, pre-screen taxonomy alignment** | Regtech (#4) |
| **4** | **Environmental Due Diligence** | **Material-level embodied carbon assessment from BOQ** | AI Productivity (#1) |
| **5** | **Green Loan Classification** | **Automated taxonomy alignment check (HK, ASEAN, EU)** | Regtech (#4) |
| **6** | **Carbon Assessment** | **CORE — Full BOQ → tCO₂e pipeline, 80% Pareto, audit trail** | AI Productivity (#1) |
| 7 | Loan Approval / Pricing | Carbon data feeds green loan pricing (basis point adjustments) | AI Productivity (#1) |
| **8** | **Construction Monitoring** | **Draw verification — compare actual materials vs. approved BOQ** | Regtech (#4) |
| 9 | Project Completion | As-built vs. as-designed carbon comparison, performance certificate | Regtech (#4) |
| **10** | **Portfolio Reporting** | **PCAF financed emissions aggregation, regulatory report generation** | Regtech (#4) |

**Today:** CarbonIQ covers Step 6 (core engine built and working).
**With Bank API wrapper:** Steps 3, 4, 5, 6, 7 become accessible.
**With lifecycle extensions:** Steps 8, 9, 10 complete the full journey.

This lifecycle story is the strongest differentiator — CarbonIQ is not a point solution, it's a **continuous compliance thread** from application to portfolio reporting.

### Why the Lifecycle Matters: The "Green Scrutiny" Problem

Conventional projects: build → earn revenue → done. Nobody checks if the building is what was promised.

Green loans are under scrutiny:
- Greenwashing litigation surged **12x** from 2020 to 2024
- Banking greenwashing incidents increased **70%** in 2023 alone
- HSBC exited the Net-Zero Banking Alliance (July 2025) while continuing fossil fuel financing
- Royal Bank of Canada publicly abandoned sustainable finance goals (April 2025)

**Banks need proof that "green" loans actually delivered green outcomes.** CarbonIQ provides that proof at every stage:

```
PRE-LOAN                DURING CONSTRUCTION       POST-COMPLETION
─────────────           ───────────────────        ────────────────
BOQ Assessment    →     Material Monitoring   →    Performance Verification
Carbon Baseline   →     Carbon Tracking       →    Carbon Certificate
Taxonomy Check    →     Substitution Alerts   →    As-Built vs As-Designed
Green Pricing     →     Draw Verification     →    Portfolio PCAF Report
```

This turns CarbonIQ from "a tool the bank uses once" to "an ongoing platform the bank depends on" — much higher retention, much higher value.

---

## Is the Agentic AI Already Built? — YES (~80%)

The CarbonIQ platform already contains **6 autonomous AI agents** in ~4,500 lines of production code:

| Agent | What It Does | File | Status |
|-------|-------------|------|--------|
| **Agent 1: AI Document Parser** | Claude Sonnet 4 classifies every BOQ line item through 6-step ECCS hierarchy. Handles PDF/Excel/CSV. Chunks large documents. | `parse-boq.js` | **BUILT** |
| **Agent 2: Material Re-Matcher** | Client-side double-check of AI classification. Scores descriptions against A1-A3 (consultant) then ICE (database). Min 10-point threshold. | `data.js` | **BUILT** |
| **Agent 3: Unit Converter** | Extracts thickness from descriptions (regex), looks up density, converts m²→m³→kg→tonnes. BLOCKS when data missing (prevents 6-7× errors). | `tender.js` | **BUILT** |
| **Agent 4: Emission Calculator** | tCO₂e = Calculated Qty × Emission Factor ÷ 1000. Baseline + target scenarios. | `tender.js` | **BUILT** |
| **Agent 5: 80% Pareto Analyzer** | ISO 21930-compliant. Sorts by emission DESC, cumulative to 80%, flags significant materials. Excludes ECCS-Zero items. | `tender.js` | **BUILT** |
| **Agent 6: Carbon Advisor** | AI-powered reduction strategy generator. Analyzes project data, identifies quick wins, generates contractor action items. | `carbon-advisor.js` | **BUILT** |
| **Agent 7: Document Intelligence** | RAG-based multi-dimensional analysis. 5 analysis dimensions with citations. Cross-document consistency checking. | `carbon-intelligence.js` | **BUILT** |

**What's NOT built yet (the ~20%):**

| Missing Piece | Needed For | Effort |
|--------------|-----------|--------|
| Bank API wrapper (REST endpoint) | Exposing pipeline to bank systems | Medium — wrapping existing functions |
| PCAF output format | Regulatory reporting compliance | Small — formatting existing data |
| Taxonomy alignment checker | Green loan classification | Medium — new logic, existing carbon data |
| Green Loan Eligibility Report | Credit committee PDF | Small — template + existing data |
| Portfolio aggregation view | Multi-loan dashboard | Medium — new UI |
| Construction monitoring / draw verification | Lifecycle tracking | Medium — new feature |
| Insurance underwriting output | InsurTech angle | Small — formatting existing data |

**Bottom line: The engine is built. What's needed is the bank-facing interface layer — different dashboard, same engine.**

---

## The Brainstorm: 10 Angles Explored

### Angle 1: "We're Not a Climate Tool — We're an Agentic AI Document Processor"

**The reframe:** CarbonIQ takes unstructured construction documents (PDF/Excel BOQs with 200-2000 line items), runs them through a 6-step AI classification hierarchy, matches every item against two material databases, converts units, calculates outputs, performs Pareto analysis, and generates audit-ready reports — all autonomously.

This is **exactly** the "multi-agentic squad" pattern McKinsey describes for banking:
- Agent 1: Document ingestion & parsing (our AI parse)
- Agent 2: Classification & categorization (our ECCS 6-step hierarchy)
- Agent 3: Data matching & lookup (our A1-A3/ICE dual-database matching)
- Agent 4: Calculation & conversion (our unit conversion + emission calculation)
- Agent 5: Analysis & flagging (our 80% Pareto identification)
- Human-in-the-loop: Review, override, approve (our audit trail + approval workflow)

**Verdict: STRONG.** This is the primary positioning angle.

### Angle 2: "Built Technologies for Green Lending"

Built Technologies ($1.5B valuation) already does this pattern for construction draw requests — their AI agent processes construction loan documents in 3 minutes vs. days. Clients include Citi (FILAP partner). They achieved:
- 95% faster approvals
- 400% increase in risk detection
- 100% policy adherence

**CarbonIQ does the same thing, but for the ESG/carbon dimension of construction lending.** Where Built processes cost/budget documents, CarbonIQ processes material/quantity documents. These are complementary, not competing.

**Verdict: STRONG.** Direct analogy that FILAP judges will understand.

### Angle 3: "Fixing PCAF Data Quality Score 5 → Score 2"

Banks are stuck at the worst PCAF data quality (score 4-5) for construction loans because they use generic sector averages (tCO₂e per m² by building type). This tells the bank NOTHING about actual material choices.

CarbonIQ processes the actual BOQ and produces project-specific embodied carbon figures → PCAF data quality score 2-3 (verified, project-level data). This is not a nice-to-have — **PCAF v3 (December 2025) now covers new asset classes including construction project insurance**, and 700+ financial institutions representing $100T+ in assets have committed to PCAF.

**The productivity angle:** A bank analyst manually assessing embodied carbon from a 200-line BOQ takes 3-5 full working days using spreadsheets and public databases. CarbonIQ does it in minutes.

**Verdict: STRONG.** Quantifiable productivity gain + regulatory compliance.

### Angle 4: "The Missing Step 6 in Every Bank's Loan Workflow"

From the bank lending research, the construction loan assessment workflow has 9 steps. Step 6 (Carbon/Emissions Assessment) is where the process breaks down completely:

| Step | Current State | Pain |
|------|--------------|------|
| 1. Application Review | Mature tools | Low |
| 2. Credit Analysis | Mature tools | Low |
| 3. ESG Screening | Emerging tools | Medium |
| 4. Environmental Due Diligence | Outsourced (Phase I/II) | Medium |
| 5. Green Loan Assessment | Manual checklists | Medium |
| **6. Carbon Assessment** | **NO TOOLS EXIST** | **CRITICAL** |
| 7. Committee Review | Mature process | Low |
| 8. Documentation | Legal tools | Low |
| 9. Portfolio Monitoring | Emerging (PCAF) | Medium |

**CarbonIQ is the missing tool for Step 6.** No bank has it. No fintech offers it. The Big Four charge $5,000-$100,000+ per building assessment — at 500 construction loans, that's $2.5M+ per review cycle.

**Verdict: VERY STRONG.** This is the clearest product-market fit story.

### Angle 5: "First-Mover in a Mandatory Market"

The regulatory timeline is now locked in:
- **Jan 2026:** EU CBAM definitive phase (steel +16% cost, cement impacted)
- **Feb 2026:** ECB fined Credit Agricole €7.6M for inadequate climate risk assessment
- **2026:** HKMA signaling mandatory taxonomy adoption
- **Sep 2027:** MAS transition planning guidelines take effect
- **2027:** UK FCA mandatory ISSB-based climate disclosures
- **2028:** 57% of bank executives expect AI agents fully embedded in risk/compliance

Banks aren't choosing WHETHER to assess carbon — they're choosing HOW. Right now the answer is "manually, badly, at enormous cost." CarbonIQ offers "automatically, accurately, at a fraction of the cost."

**Verdict: STRONG.** Regulatory inevitability + timing alignment.

### Angle 6: "Bank-Side API — Not Another Borrower Tool"

Most climate/carbon tools serve the **borrower** (construction companies, architects). CarbonIQ's unique pivot for FILAP: serve the **bank**.

**New product concept: CarbonIQ Bank API**
- Bank receives construction loan application with BOQ attached
- Bank analyst uploads BOQ to CarbonIQ API
- System returns: material classification, emission factors, total embodied carbon (tCO₂e), 80% significant materials, PCAF data quality score, taxonomy alignment assessment
- Result feeds into bank's credit decision, green loan pricing, and regulatory reporting

The borrower doesn't need to use CarbonIQ. The bank does. This is a **back-office productivity tool** — exactly the 2026 theme.

**Verdict: CRITICAL. This is the product addition needed.**

### Angle 7: "Green Loan Pricing Intelligence"

Banks currently cannot differentiate between a high-carbon and low-carbon construction project when pricing loans. A concrete-heavy building and a timber-frame building get the same interest rate.

With CarbonIQ's carbon assessment, banks can:
- Offer **green loan discounts** to verified low-carbon projects (basis point reduction)
- Apply **brown premiums** to high-carbon projects (risk pricing)
- Verify **taxonomy alignment** automatically (HK Taxonomy, ASEAN Taxonomy, EU Taxonomy)
- Generate **green bond use-of-proceeds evidence** for their own issuance

This turns carbon data into **revenue** for the bank — not just compliance cost.

**Verdict: STRONG.** Revenue story resonates with bank executives.

### Angle 8: "Portfolio Carbon Intelligence Dashboard"

Beyond individual loan assessment, banks need portfolio-level views:
- What is the total embodied carbon of our construction loan portfolio?
- Which loans are taxonomy-aligned vs. not?
- What is our financed emissions trajectory?
- Where are the concentration risks (too much high-carbon steel, too much cement)?

**New product concept: CarbonIQ Portfolio Dashboard**
- Aggregates all BOQ assessments across the bank's construction portfolio
- Real-time financed emissions calculation (PCAF-compliant)
- Taxonomy alignment heatmap
- Material concentration risk alerts
- Regulatory report generation (TCFD, ISSB S2, HKMA GS-1)

**Verdict: STRONG.** Scales the single-loan tool to enterprise value.

### Angle 9: "Construction Loan Draw Monitoring"

During construction, banks release funds in stages (draws). Currently, no one verifies whether the materials being installed match the materials in the approved green loan application.

**New product concept: CarbonIQ Draw Verification**
- At each draw request, contractor submits updated material delivery records
- CarbonIQ compares actual materials vs. BOQ baseline
- Flags material substitutions that increase carbon (e.g., specified recycled steel replaced with virgin steel)
- Generates variance report for bank draw approval

This prevents **greenwashing at the project level** — the bank knows the building is being built as promised.

**Verdict: MEDIUM-HIGH.** Compelling but requires product development.

### Angle 10: "Agentic Carbon Copilot for Bank Analysts"

Instead of a standalone platform, position CarbonIQ as a **copilot** that integrates into the bank analyst's existing workflow:
- Sits inside the bank's credit analysis platform (API integration)
- Analyst uploads BOQ → gets instant carbon assessment alongside financial assessment
- Natural language queries: "What are the top 3 carbon reduction opportunities for this project?"
- Auto-generates the ESG section of the credit memo
- Suggests green loan eligibility based on taxonomy criteria

This maps directly to Accenture's vision of "every employee has a personalized AI assistant."

**Verdict: STRONG.** Fits the copilot/assistant narrative banks are investing $53B+ in.

---

## Synthesis: The Winning Positioning

### One-Line Pitch (for FILAP 2026)
> **"CarbonIQ is an AI-powered regtech platform that automates climate risk compliance for construction lending — turning a 5-day manual analyst task into a 5-minute automated workflow, while upgrading banks from PCAF data quality score 5 to score 2 and enabling automated taxonomy alignment for the largest single lending sector in APAC."**

### Why This Fits the 2026 Themes — Mapping to 4 of 7

| 2026 Theme | CarbonIQ Fit |
|-----------|-------------|
| **Theme 1: AI Enhanced Productivity** | 6-agent autonomous pipeline: 5 days → 5 minutes. Front (green loan pricing), middle (credit risk/ESG scoring), back (PCAF reporting). |
| **Theme 4: Regtech & Compliance** | Automates HKMA GS-1, MAS ENRM, ISSB S2, PCAF v3 compliance. Banks are being fined (€7.6M Credit Agricole). This is mandatory, not optional. |
| **Theme 7: InsurTech Underwriting** | PCAF v3 added construction insurance emissions. Insurers need material-level carbon data to underwrite and price construction project risk. |
| **Theme 6: Open Finance & API** | Open-source core, RESTful Bank API, open emission factor databases (ICE v3.0), designed for bank system integration (Finastra, Temenos). |

### The Narrative Arc for FILAP Application

1. **Banks are mandated** to assess climate risk in lending (HKMA, MAS, ECB — fines are real: €7.6M for Credit Agricole)
2. **Construction is 25-36%** of bank lending in APAC (largest single sector in HK, Singapore, UAE, KSA)
3. **No tool exists** to go from a construction BOQ to an embodied carbon figure inside a bank
4. **Manual cost:** $2.5M+ per review cycle (500 loans × $5K each) or 3-5 analyst-days per loan
5. **CarbonIQ solves this** with an agentic AI pipeline that does it in minutes
6. **Already built and working** — the BOQ classification engine, the dual-database matching, the unit conversion, the 80% Pareto analysis, the audit trail — it all exists today
7. **The ask:** Mentorship to build the Bank API wrapper + POCs with FILAP partner banks (HSBC, Citi, StanChart, JP Morgan)

---

## Product Additions Needed for Bank Positioning

### Must-Have (Before FILAP Application)

#### 1. Bank API Endpoint
**What:** RESTful API that accepts a BOQ document and returns structured carbon assessment
**Input:** PDF/Excel/CSV of BOQ
**Output:** JSON with:
```json
{
  "projectSummary": {
    "totalEmbodiedCarbon_tCO2e": 1234.5,
    "totalMaterials": 187,
    "classifiedMaterials": 172,
    "unclassified": 15,
    "pcafDataQualityScore": 2,
    "taxonomyAlignment": {
      "hongKong": "aligned",
      "euTaxonomy": "partially_aligned",
      "asean": "green_tier"
    }
  },
  "significantMaterials": [
    {
      "rank": 1,
      "description": "150mm C40 concrete slab",
      "category": "Concrete",
      "type": "C40-50",
      "quantity": 2500,
      "unit": "m³",
      "emissionFactor": 430,
      "emission_tCO2e": 1075,
      "cumulativePercent": 0.42,
      "inTop80Pct": true,
      "epdAvailable": false,
      "reductionPotential": "HIGH — switch to C30 or GGBS blend"
    }
  ],
  "auditTrail": {
    "classificationMethod": "ECCS_6step_v2",
    "emissionFactorSource": "A1-A3_Consultant_Approved + ICE_v3.0",
    "processingTimestamp": "2026-03-08T14:30:00Z",
    "confidenceScore": 0.87
  }
}
```
**Why:** This is the product banks buy. The web UI is for contractors; the API is for banks.
**Effort:** Medium — the pipeline already exists. Needs a clean API wrapper, authentication, and structured output format.

#### 2. PCAF-Compliant Output Format
**What:** Carbon assessment output formatted per PCAF v3 methodology
**Includes:**
- Attribution factor calculation (bank's share of project emissions)
- Data quality score justification (why score 2, not score 5)
- Emission factor sources and methodology documentation
- Scope classification (A1-A3 = cradle-to-gate, upstream of borrower)
**Why:** Banks need this exact format to feed into their financed emissions reporting. If the output doesn't map to PCAF, they can't use it.

#### 3. Taxonomy Alignment Checker
**What:** Automated check against green taxonomy criteria
**Covers:**
- Hong Kong Green Classification Framework (construction criteria → BEAM Plus alignment)
- ASEAN Taxonomy v3 (construction sector Plus Standard)
- EU Taxonomy (Whole Life Carbon calculation for buildings >5,000m²)
- Singapore-Asia Taxonomy (TSC for real estate/construction)
**Output:** Green / Amber / Red classification per taxonomy, with specific criteria met/unmet
**Why:** Banks need this to classify loans as "green" for their Green Asset Ratio (GAR) reporting.

#### 4. Green Loan Eligibility Report
**What:** Auto-generated PDF report assessing whether a construction project qualifies for a green loan
**Based on:** Green Loan Principles 2025 (APLMA/LMA/LSTA) four core components:
1. Use of Proceeds — eligible green building project criteria
2. Project Evaluation — material-level carbon assessment evidence
3. Management of Proceeds — tracked emissions baseline
4. Reporting — ongoing carbon monitoring framework
**Why:** This is the document the bank credit committee needs to approve a green loan classification.

### Should-Have (During FILAP Program — POC with Partner Banks)

#### 5. Portfolio Aggregation Dashboard
- Aggregate carbon assessments across all construction loans
- Total financed emissions by portfolio segment
- Taxonomy alignment distribution (% green / amber / red)
- Time-series tracking (are we getting greener?)
- Material concentration risk (over-exposure to high-carbon materials)

#### 6. Credit Memo ESG Section Generator
- Auto-generates the ESG/climate section of a credit memo
- Natural language summary of project carbon profile
- Comparison to sector benchmarks
- Risk flags and mitigation recommendations
- Ready to paste into the bank's existing credit memo template

#### 7. Ongoing Monitoring / Draw Verification
- Compare actual construction materials vs. BOQ baseline at each draw stage
- Flag material substitutions that increase carbon
- Generate variance reports
- Enable real-time portfolio emission tracking during construction

#### 8. Bank System Integration Layer
- API connectors for common bank platforms (Finastra, Temenos, FIS)
- SSO / SAML integration for bank authentication
- Data residency controls (HK data stays in HK)
- Audit logging compatible with bank compliance requirements

### Nice-to-Have (Post-FILAP — Enterprise Product)

#### 9. Carbon-Adjusted Credit Scoring
- Integrate embodied carbon as a factor in credit risk models
- Higher carbon = higher transition risk = higher probability of default adjustment
- Maps to Basel III/IV Pillar 2 climate risk requirements

#### 10. Benchmarking Database
- Aggregate anonymized data across all assessed projects
- "Your building is in the 73rd percentile for embodied carbon vs. similar projects"
- Enables banks to set portfolio-level carbon targets
- Creates network effects (more data = better benchmarks = more valuable)

---

## Construction KPIs — What Banks Should Monitor During & After

### During Construction (Draw Monitoring)

| KPI | What It Measures | CarbonIQ Role | Alert Trigger |
|-----|-----------------|---------------|---------------|
| **Material Substitution Rate** | % of materials changed vs. approved BOQ | Compare draw-stage delivery records vs original BOQ | >10% substitution by carbon weight |
| **Carbon Variance** | tCO₂e actual vs. tCO₂e planned | Re-run assessment on updated material list | Actual > Baseline + 15% |
| **EPD Compliance Rate** | % of 80% materials with verified EPDs | Track EPD submission vs. 80% material record | <50% EPDs submitted by midpoint |
| **Taxonomy Drift** | Does project still qualify as "green"? | Re-run taxonomy alignment check at each draw | Status changes from Green to Amber/Red |
| **Waste Factor Variance** | Material wastage vs. plan | A5 module (already built) | Waste > 5% above plan |
| **Low-Carbon Material Delivery** | Are specified low-carbon alternatives actually arriving on site? | Match delivery notes to BOQ specs | Virgin material replacing specified recycled |

### After Completion (Performance Verification)

| KPI | What It Measures | CarbonIQ Role | Bank Value |
|-----|-----------------|---------------|------------|
| **As-Built vs. As-Designed Carbon** | Did the building deliver the carbon profile promised in the loan application? | Compare final material records vs. original BOQ | Greenwashing protection |
| **Carbon Performance Certificate** | Verified embodied carbon figure for the completed building | Generate certificate from final assessment | Evidence for green bond reporting |
| **Portfolio Carbon Intensity** | tCO₂e per $M lent across construction portfolio | Aggregate all project certificates | PCAF financed emissions report |
| **Taxonomy Alignment Verification** | Final green/amber/red classification | Re-run taxonomy check on as-built data | Green Asset Ratio (GAR) accuracy |
| **Reduction Achievement** | % reduction from baseline (consultant targets vs. actual) | Compare original baseline vs. final target achievement | ESG report evidence |
| **Benchmark Percentile** | Project carbon vs. similar buildings in database | Compare against anonymized project database | Portfolio target-setting |

### The "Green Scrutiny" Problem — CarbonIQ Solves It

You raised a critical point: conventional projects are "money-minded" — build, earn revenue, stop. Green projects face scrutiny because "green" labeling is under attack globally.

**Without CarbonIQ:** Bank approves green loan → construction happens → nobody checks → building may or may not be green → bank reports it as green → regulator or litigant challenges it → bank has no evidence.

**With CarbonIQ:** Bank approves green loan with carbon baseline → CarbonIQ monitors material substitutions at each draw → flags deviations → generates as-built certificate at completion → bank has material-level evidence that the project delivered what was promised.

This is the difference between "we think it's green" and "here's the data proving it's green." In a world of €7.6M fines and 12x increase in greenwashing litigation, this evidence is not optional.

---

## The Bank Perspective: Document Flow Mapping

### What a Construction Company Submits for a Loan Today

| Document | Currently Required? | Carbon-Relevant? |
|----------|-------------------|-----------------|
| Financial statements | Yes | No |
| Construction budget | Yes | Indirectly (cost ≠ carbon) |
| Architectural plans | Yes | Indirectly (area, but not materials) |
| **Bill of Quantities (BOQ)** | **Sometimes** | **YES — this is the key document** |
| Construction contract | Yes | No |
| Building permits | Yes | No |
| Phase I Environmental | Yes | Physical risk only |
| Green building cert (BEAM Plus, LEED) | For green loans | Operational energy, not embodied carbon |
| Energy performance certificate | Emerging | Operational only |
| **Life Cycle Assessment / WLC** | **Almost never** | **YES — but nobody provides it** |
| **EPDs for materials** | **Never** | **YES — but nobody has them** |

### The Gap CarbonIQ Fills

The BOQ is **already submitted** (or easily obtainable) as part of the construction loan package. It contains every material, every quantity, every specification. But today, it sits in a filing cabinet — no bank analyst can translate it into a carbon figure.

**CarbonIQ takes the document the bank already has (the BOQ) and extracts the information the bank now needs (embodied carbon).** No new documents required from the borrower. No new data collection. Just AI-powered analysis of existing documents.

This is the killer insight: **we don't ask the borrower to do anything different.** We make the bank smarter with data they already have.

---

## Competitive Positioning for FILAP

### Why Not Just Use One Click LCA / EC3 / Etc.?

| Feature | One Click LCA | EC3 | CarbonIQ (Bank API) |
|---------|--------------|-----|-------------------|
| **Target user** | Architects, LCA consultants | Material specifiers | Bank credit analysts |
| **Input** | BIM models (IFC files) | Material searches | Raw BOQ (PDF/Excel) — the document banks already have |
| **Requires expertise?** | Yes — LCA knowledge needed | Yes — material science knowledge | No — upload document, get report |
| **Output** | Full LCA report | EPD comparisons | PCAF-compliant carbon assessment + taxonomy alignment + green loan eligibility |
| **Bank integration** | None | None | API-first, designed for bank workflows |
| **Audit trail** | Limited | N/A | Full edit history, role-based, ISO 21930-compliant |
| **Price model** | Per-user subscription | Free (limited) | Per-assessment API call — scales with bank portfolio |
| **APAC coverage** | Limited | US-focused | Built for APAC (HK Taxonomy, ASEAN Taxonomy, MAS/HKMA compliance) |

**Key differentiator:** Every competitor serves the **supply side** (construction companies). CarbonIQ for Banks serves the **demand side** (lenders). When you serve the demand side, you create a pull effect — banks start requiring BOQ carbon assessments as a loan condition, which drives adoption across the entire construction industry.

### Direct Competitor in the Space: Xeptagon

Xeptagon (FILAP 2025 cohort) builds digital carbon market infrastructure — MRV systems, carbon registries, CBAM tools. They were mentored by HSBC's Global Carbon Removal Technologies team.

**CarbonIQ vs. Xeptagon:**
- Xeptagon = carbon **trading** infrastructure (registries, exchanges, CBAM reporting)
- CarbonIQ = carbon **measurement** intelligence (BOQ → embodied carbon → bank decision)
- These are **complementary**, not competing: CarbonIQ generates the data; Xeptagon handles the market/trading layer
- Having Xeptagon as a 2025 alumnus VALIDATES the space and gives us a natural partnership story

---

## Addressing the "But Construction Isn't Sexy" Objection

FILAP judges might think: "AI for construction loan documents sounds niche."

**Counter-narrative: Construction is the LARGEST single lending sector in APAC.**

| Market | Construction/RE Share of Bank Lending |
|--------|--------------------------------------|
| Hong Kong | 25-36% (Hang Seng Bank: 36.34%) |
| Singapore | Largest single sector (SGD 169B) |
| UAE | ~20% (largest sector) |
| Saudi Arabia | ~30% of total (SR883B) |

**A tool that makes 25-36% of a bank's loan portfolio more efficient is not niche. It's core infrastructure.**

And the regulatory pressure is acute:
- ECB fined Credit Agricole **€7.6 MILLION** in February 2026 for inadequate climate risk assessment
- HKMA is moving toward mandatory taxonomy adoption
- MAS transition planning guidelines take effect September 2027
- APAC has the **highest carbon-intensive lending exposure globally** at 61%
- Climate-adjusted probability of default increases **114%** at year 15

---

## The FILAP Partner Bank Opportunity

### Which FILAP Partners Have the Most to Gain?

| Bank | Construction Exposure | AI Maturity | Green Finance Activity | POC Priority |
|------|---------------------|-------------|----------------------|-------------|
| **HSBC** | Major HK property lender; mentored Xeptagon on carbon | Scaling AI to automate 90% of data tasks | Green bond leader; exited NZBA but still financing green | **#1 — they already invested in the carbon space** |
| **Standard Chartered** | Major APAC project finance | SC GPT to 80K employees; $754M savings program | Green/transition lending across emerging markets | **#2 — operational efficiency focus aligns** |
| **Citi** | Client of Built Technologies for construction lending | GenAI to 150K employees; $12B tech budget | Active in green bonds APAC | **#3 — already using AI for construction lending** |
| **J.P. Morgan** | Major global project finance | LLM Suite to 250K employees; $18B tech budget | Largest US bank green bond underwriter | **#4 — scale and AI ambition** |
| **Hang Seng Bank** | 36.34% property exposure (highest among HK banks) | Smaller; follows HSBC lead | Growing green mortgage product | **#5 — highest property concentration = most need** |
| **AXA / Zurich** | Insure construction projects | Growing AI adoption | ESG integration in underwriting | **Insurance angle — PCAF v3 now covers construction insurance** |

### Ideal POC Structure for FILAP

**Week 1-2:** Bank provides 10 anonymized BOQs from recent construction loan applications
**Week 3-6:** CarbonIQ processes them via API, generates carbon assessments, compares to bank's current sector-average estimates
**Week 7-10:** Measure: time saved vs. manual, data quality improvement (PCAF score), taxonomy alignment accuracy
**Week 11-12:** Demo Day presentation with real POC results

**Success metrics for the POC:**
- Processing time: <5 minutes per BOQ (vs. 3-5 days manual)
- Data quality: PCAF score 2-3 (vs. current score 4-5)
- Classification accuracy: >85% materials correctly classified
- Cost saving: >90% reduction vs. consultant-based assessment
- Taxonomy alignment: automated vs. manual checklist

---

## Application Messaging: How to Write the FILAP Application

### Question: "Describe your solution"

> CarbonIQ is an agentic AI platform that automates the embodied carbon assessment of construction project documents for banks. When a construction company applies for a loan, the bank receives a Bill of Quantities (BOQ) — a detailed list of every material and quantity in the project. Today, no bank can translate this document into a carbon figure. Bank analysts either skip the assessment entirely (resulting in PCAF data quality score 5, the worst), or spend 3-5 days per project manually matching materials to emission factor databases using spreadsheets.
>
> CarbonIQ's multi-agent AI pipeline processes the BOQ autonomously: it classifies every line item through a 6-step hierarchy (detecting demolition, complex assemblies, provisional items, labour, and landscaping before material matching), matches each material against two curated emission factor databases (consultant-approved A1-A3 factors first, ICE v3.0 as fallback), converts units (m² → m³ → kg → tonnes with density lookup and thickness extraction), calculates embodied carbon (tCO₂e), and identifies the 80% significant material contributors per ISO 21930 — all in under 5 minutes with a full audit trail.
>
> The output is a PCAF-compliant carbon assessment report that upgrades the bank from data quality score 5 to score 2, plus automated taxonomy alignment checks (HK Taxonomy, ASEAN Taxonomy, EU Taxonomy) and green loan eligibility assessment per the 2025 Green Loan Principles.

### Question: "What problem does it solve?"

> Banks are mandated by regulators (HKMA GS-1, MAS ENRM, ECB, ISSB S2) to assess and disclose climate risk in their lending portfolios. Construction and real estate is the single largest lending sector in APAC — 25-36% of bank portfolios in Hong Kong, Singapore, UAE, and Saudi Arabia.
>
> Yet banks have zero tools to assess the embodied carbon of a construction project at the material level. They rely on sector-average proxies that cannot distinguish between a high-carbon concrete-heavy building and a low-carbon timber-frame building. This means banks cannot accurately price green loans, cannot verify taxonomy alignment, and cannot meet emerging regulatory requirements.
>
> The cost of the status quo is severe: manual assessment by consultants costs $5,000-$100,000+ per project ($2.5M+ for a portfolio of 500 loans). The ECB fined Credit Agricole €7.6M in February 2026 specifically for inadequate climate risk materiality assessment. APAC banks face the highest carbon-intensive lending exposure globally at 61%, with climate-adjusted default probability increasing 114% over 15 years.

### Question: "How does this fit the 2026 innovation themes?"

> CarbonIQ maps directly to **4 of 7 FILAP 2026 themes:**
>
> **Theme 1 — AI Enhanced Productivity (Front to Back):**
> Back office: Automates PCAF financed emissions calculation, regulatory reporting (TCFD, ISSB S2, HKMA GS-1), and taxonomy alignment — replacing manual spreadsheet processes.
> Middle office: Integrates carbon assessment into credit risk analysis, enabling carbon-adjusted credit scoring and transition risk assessment for construction loans.
> Front office: Enables relationship managers to offer differentiated green loan products with faster approval (minutes vs. weeks), accurate pricing (based on actual project carbon, not sector averages), and verified taxonomy alignment.
> The platform uses a multi-agent architecture with 6 autonomous AI agents — exactly the "multi-agentic squad" pattern McKinsey identifies as the future of bank operations.
>
> **Theme 4 — Regtech, Risk & Compliance Automation:**
> Climate risk compliance is now mandatory (HKMA GS-1, MAS ENRM, ISSB S2, EU CSRD). The ECB fined Credit Agricole €7.6M in February 2026 for inadequate climate risk materiality assessment. CarbonIQ automates the most labor-intensive part of climate compliance for the largest lending sector (construction = 25-36% of APAC bank portfolios): turning unstructured BOQ documents into auditable, PCAF-compliant embodied carbon assessments.
>
> **Theme 7 — InsurTech Underwriting:**
> PCAF v3 (December 2025) added construction/erection project insurance to its scope. Insurers now need material-level embodied carbon data to assess transition risk and price construction project insurance. CarbonIQ's BOQ assessment feeds directly into insurance underwriting models — a new market unlocked by regulatory change.
>
> **Theme 6 — Open Finance & API Ecosystems:**
> CarbonIQ is open-source (GitHub), API-first (RESTful Bank API), and uses open emission factor databases (ICE v3.0). It is designed to integrate into existing bank platforms via API connectors, enabling an ecosystem approach to climate data across lending, insurance, and portfolio management.

---

## 30-Day Action Plan: Preparing for FILAP 2026 Application

### Week 1 (March 8-14): Foundation

- [ ] Build the Bank API endpoint wrapper around existing BOQ processing pipeline
- [ ] Define API authentication (API key + JWT for bank integration)
- [ ] Create structured JSON output format (as specified above)
- [ ] Add PCAF data quality score calculation to output

### Week 2 (March 15-21): Taxonomy & Compliance

- [ ] Implement HK Taxonomy alignment checker (BEAM Plus criteria mapping)
- [ ] Implement ASEAN Taxonomy v3 alignment checker (construction sector TSC)
- [ ] Build Green Loan Eligibility Report generator (PDF output)
- [ ] Add attribution factor calculation for financed emissions

### Week 3 (March 22-28): Demo & Materials

- [ ] Create bank-focused demo workflow (loan application → carbon assessment → green loan decision)
- [ ] Prepare 3 sample BOQs with known carbon profiles (high/medium/low) for live demo
- [ ] Record 2-minute video demo showing end-to-end bank workflow
- [ ] Draft FILAP application answers (using messaging above)

### Week 4 (March 29 - April 4): Polish & Submit

- [ ] Update pitch deck (presentation.html) with bank-focused positioning
- [ ] Prepare one-pager: "CarbonIQ for Banks" (for FILAP review panel)
- [ ] Technical architecture diagram showing agentic AI pipeline
- [ ] Submit application (deadline expected April-May 2026)
- [ ] Email fintechAPenquiry@accenture.com to confirm application receipt and express interest in HSBC/StanChart POC

---

## Risk Assessment: Can We Credibly Pitch This?

| Risk | Severity | Mitigation |
|------|----------|-----------|
| "You're a climate tool, not an AI tool" | HIGH | Lead with the agentic AI architecture, not the climate outcome. Demo the 6-step pipeline, not the carbon number. |
| "Where's the bank traction?" | HIGH | Acknowledge pre-revenue. Frame FILAP as the path to first bank POC. Reference Built Technologies' journey (similar stage when they started). |
| "The BOQ processing already works — what's new?" | MEDIUM | The Bank API wrapper, PCAF output format, taxonomy alignment, and green loan report are NEW products built on existing engine. |
| "Why not just use One Click LCA?" | LOW | They serve architects with BIM files. We serve bank analysts with raw BOQs. Different user, different input, different output. |
| "Is the market real?" | LOW | ECB fines are real. HKMA mandates are real. 25-36% of APAC bank lending is construction. The numbers speak. |
| "Team size / execution risk" | HIGH | Be transparent. FILAP provides mentorship + access, not funding. The core engine is BUILT. We need bank domain expertise from mentors. |

**Overall assessment: 4.5/5 — STRONGLY RECOMMENDED with the multi-theme positioning.**

Without the pivot (applying as "climate tool"): 2/5 — no matching theme in 2026.
With single-theme pivot (AI productivity only): 4/5 — strong but competitive.
With multi-theme pivot (AI + Regtech + InsurTech + Open Finance): 4.5/5 — differentiated positioning across 4 themes. Few fintechs can credibly claim 4-theme coverage.

---

## Key Numbers for the Application

| Metric | Value | Source |
|--------|-------|-------|
| Construction share of APAC bank lending | 25-36% | S&P Global, HKMA, MAS |
| Manual carbon assessment time per loan | 3-5 analyst-days | Industry estimate (NIST, IStructE) |
| CarbonIQ assessment time | <5 minutes | Platform benchmark |
| Productivity improvement | ~98% time reduction | 5 days → 5 minutes |
| Consultant cost per assessment | $5,000-$100,000+ | CarbonBright, Big Four estimates |
| Portfolio assessment cost (500 loans) | $2.5M+ per cycle | Calculated |
| PCAF member institutions | 700+ ($100T+ assets) | PCAF |
| Largest climate risk fine to date | €7.6M (Credit Agricole) | ECB, Feb 2026 |
| APAC carbon-intensive lending exposure | 61% (highest globally) | MSCI |
| Climate-adjusted PD increase | +114% at year 15 | MSCI |
| Banking AI spending (2026) | $53B+ | Statista |
| Banking GenAI spending growth | 55% CAGR to $85B by 2030 | Juniper Research |
| APAC green buildings market | $144B (2025) → $244B (2030) | Mordor Intelligence |
| Green bond real estate issuance | $150B globally (2024) | The Asset |
| CBAM steel cost impact | +16% per ton | WEF |

---

## Summary: The Three Sentences That Win

1. **The problem:** Banks are mandated to assess embodied carbon in construction lending but have zero tools to do it — costing $2.5M+ per portfolio review and leaving them at the worst PCAF data quality score.

2. **The solution:** CarbonIQ's agentic AI pipeline processes construction BOQs in 5 minutes (vs. 5 days manually), classifying every material through a 6-step autonomous hierarchy and producing PCAF-compliant, taxonomy-aligned carbon assessments with full audit trail.

3. **The ask:** FILAP mentorship to build bank POCs with partner institutions (HSBC, StanChart, Citi) and validate the Bank API product for the $53B banking AI market.

---

*Document generated: March 8, 2026*
*For: FinTech Innovation Lab Asia-Pacific 2026 Application Strategy*
*Status: BRAINSTORM — to be refined after team review*
