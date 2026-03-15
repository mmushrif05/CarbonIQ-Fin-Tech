# CarbonIQ — Holistic Product Architecture

> **The AI-Native Green Loan Compliance Platform for Construction Finance**
>
> CarbonIQ is not a dashboard. It is not a chatbot. It is an **autonomous carbon intelligence system** that takes responsibility — it analyzes, decides, acts, monitors, and reports. Banks plug in at loan origination. CarbonIQ does the rest.

---

## 1. The Problem We Solve (In One Sentence)

**90%+ of the $5.8 trillion in real estate debt has zero climate KPIs, and no tool exists to measure, monitor, or verify embodied carbon during or after construction — leaving banks exposed to $286B+ in greenwashing litigation risk.**

---

## 2. Product Vision

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   "From the moment a green loan is signed to the last day of its term,     │
│    CarbonIQ autonomously tracks every kilogram of embodied carbon —        │
│    so banks can prove their green loans are actually green."               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. The Three Lifecycle Phases

CarbonIQ operates across the **entire green loan lifecycle** — not just design stage:

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    CarbonIQ — GREEN LOAN LIFECYCLE                          ║
║                                                                             ║
║   PHASE 1              PHASE 2                PHASE 3                      ║
║   PRE-CONSTRUCTION     DURING CONSTRUCTION    POST-CONSTRUCTION            ║
║   (Loan Origination)   (Draw Monitoring)      (KPI Compliance)             ║
║                                                                             ║
║   ┌───────────────┐    ┌───────────────┐      ┌───────────────┐            ║
║   │ BOQ Assessment│    │ Draw-Down     │      │ Annual KPI    │            ║
║   │ Baseline      │    │ Verification  │      │ Reporting     │            ║
║   │ Carbon Budget │    │ Progress      │      │ PCAF Financed │            ║
║   │ Risk Score    │    │ Tracking      │      │ Emissions     │            ║
║   │ KPI Setting   │    │ Anomaly       │      │ Benchmark     │            ║
║   │               │    │ Detection     │      │ Tracking      │            ║
║   └───────┬───────┘    └───────┬───────┘      └───────┬───────┘            ║
║           │                    │                      │                     ║
║           └────────────────────┴──────────────────────┘                     ║
║                                │                                            ║
║                    ┌───────────▼───────────┐                               ║
║                    │   BANK API PORTAL     │                               ║
║                    │   Real-time carbon    │                               ║
║                    │   exposure dashboard  │                               ║
║                    └───────────────────────┘                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

---

## 4. AI Agent Architecture — "AI That Does The Work"

CarbonIQ uses **5 autonomous AI agents**, each with a specific responsibility. They are not chatbots — they execute tasks end-to-end without human prompting.

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                     CarbonIQ AI AGENT SYSTEM                                ║
║                                                                             ║
║  ┌─────────────────────────────────────────────────────────────────────┐    ║
║  │                    ORCHESTRATOR AGENT                               │    ║
║  │  Controls workflow. Decides which agent runs when.                 │    ║
║  │  Monitors all outputs. Escalates only when human input required.   │    ║
║  └────────┬──────────┬──────────┬──────────┬──────────┬───────────────┘    ║
║           │          │          │          │          │                     ║
║  ┌────────▼───────┐ ┌▼─────────▼┐ ┌──────▼───────┐ ┌▼──────────────┐    ║
║  │ CLASSIFIER     │ │ AUDITOR   │ │ MONITOR      │ │ ADVISOR       │    ║
║  │ AGENT          │ │ AGENT     │ │ AGENT        │ │ AGENT         │    ║
║  │                │ │           │ │              │ │               │    ║
║  │ • Reads BOQ    │ │ • Cross-  │ │ • Watches    │ │ • Reduction   │    ║
║  │ • Classifies   │ │   checks  │ │   draw-downs │ │   strategies  │    ║
║  │ • Assigns EF   │ │   all data│ │ • Detects    │ │ • Material    │    ║
║  │ • Converts     │ │ • Flags   │ │   anomalies  │ │   switches    │    ║
║  │   units        │ │   errors  │ │ • Tracks vs  │ │ • Cost-carbon │    ║
║  │ • Calculates   │ │ • Verifies│ │   budget     │ │   tradeoffs   │    ║
║  │   tCO₂e        │ │   EPDs    │ │ • Alerts     │ │ • EPD sourcing│    ║
║  │ • 80% Pareto   │ │ • Audit   │ │   bank if    │ │ • Supplier    │    ║
║  │                │ │   trail   │ │   off-track   │ │   matching    │    ║
║  └────────────────┘ └───────────┘ └──────────────┘ └───────────────┘    ║
║                                                                             ║
║  ┌──────────────────────────────────────────────────────────────────────┐   ║
║  │ REPORTER AGENT                                                       │   ║
║  │                                                                      │   ║
║  │ • Generates bank compliance reports (PCAF, LMA, GRESB format)       │   ║
║  │ • Produces contractor scorecards                                     │   ║
║  │ • Creates annual KPI verification documents                          │   ║
║  │ • Formats data for SPO (Second Party Opinion) providers             │   ║
║  │ • Exports PCAF-ready financed emissions with attribution factor     │   ║
║  └──────────────────────────────────────────────────────────────────────┘   ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### How the Agents Work (Not Chat — Autonomous Execution)

| Traditional Tool | CarbonIQ AI Agent |
|---|---|
| User uploads BOQ → clicks "Parse" → reviews results → fixes errors → clicks "Calculate" | **Classifier Agent** receives BOQ → classifies all items → converts units → calculates emissions → identifies 80% contributors → flags items needing human input → presents completed assessment |
| User manually compares BOQ to budget | **Monitor Agent** automatically compares every draw-down claim against the carbon budget → alerts if material substitution detected → recalculates projected outcome |
| Consultant writes reduction report | **Advisor Agent** analyzes all materials → ranks by impact → suggests specific alternatives with EPD references → quantifies savings → generates the report |
| Manual Excel report for the bank | **Reporter Agent** pulls all project data → formats to PCAF/LMA standard → calculates attribution factor → generates compliance-ready PDF |
| No cross-checking exists | **Auditor Agent** continuously validates: BOQ vs submittals vs EPDs vs invoices → flags discrepancies → maintains tamper-proof audit trail |

---

## 5. Complete System Architecture

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                        CarbonIQ SYSTEM ARCHITECTURE                         ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                             ║
║  USERS                                                                      ║
║  ┌──────┐  ┌──────────┐  ┌────────────┐  ┌──────┐  ┌──────────┐           ║
║  │ Bank │  │Consultant│  │ Contractor │  │Client│  │ Regulator│           ║
║  │Portal│  │Dashboard │  │ Portal     │  │View  │  │ Auditor  │           ║
║  └──┬───┘  └────┬─────┘  └─────┬──────┘  └──┬───┘  └────┬─────┘           ║
║     │           │              │             │           │                  ║
╠═════╪═══════════╪══════════════╪═════════════╪═══════════╪══════════════════╣
║     │           │              │             │           │                  ║
║     └───────────┴──────────────┴─────────────┴───────────┘                  ║
║                              │                                              ║
║                    ┌─────────▼─────────┐                                   ║
║                    │   API GATEWAY     │  Auth, Rate Limit, RBAC           ║
║                    │   (Netlify Edge)  │  Tenant Isolation                 ║
║                    └─────────┬─────────┘                                   ║
║                              │                                              ║
║  ┌───────────────────────────┼───────────────────────────────┐              ║
║  │              CORE ENGINE LAYER                             │              ║
║  │                                                            │              ║
║  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │              ║
║  │  │ BOQ Engine   │  │ Carbon Calc  │  │ 80% Pareto   │    │              ║
║  │  │ parse-boq.js │  │ tender.js    │  │ tender.js    │    │              ║
║  │  │              │  │              │  │              │    │              ║
║  │  │ ECCS 6-step  │  │ Unit convert │  │ ISO 21930    │    │              ║
║  │  │ hierarchy    │  │ EF lookup    │  │ compliance   │    │              ║
║  │  │ AI classify  │  │ tCO₂e calc   │  │              │    │              ║
║  │  └──────────────┘  └──────────────┘  └──────────────┘    │              ║
║  │                                                            │              ║
║  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │              ║
║  │  │ Draw Monitor │  │ KPI Tracker  │  │ PCAF Engine  │    │              ║
║  │  │ (NEW)        │  │ (NEW)        │  │ (NEW)        │    │              ║
║  │  │              │  │              │  │              │    │              ║
║  │  │ Material     │  │ SPT targets  │  │ Attribution  │    │              ║
║  │  │ verification │  │ Annual check │  │ factor       │    │              ║
║  │  │ Budget track │  │ Margin calc  │  │ Scope 3 calc │    │              ║
║  │  └──────────────┘  └──────────────┘  └──────────────┘    │              ║
║  └───────────────────────────┼───────────────────────────────┘              ║
║                              │                                              ║
║  ┌───────────────────────────┼───────────────────────────────┐              ║
║  │              AI AGENT LAYER (Claude Sonnet)                │              ║
║  │                                                            │              ║
║  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │              ║
║  │  │Classifier│ │ Auditor  │ │ Monitor  │ │ Advisor  │    │              ║
║  │  │ Agent    │ │ Agent    │ │ Agent    │ │ Agent    │    │              ║
║  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │              ║
║  │                       ┌──────────┐                       │              ║
║  │                       │ Reporter │                       │              ║
║  │                       │ Agent    │                       │              ║
║  │                       └──────────┘                       │              ║
║  └───────────────────────────┼───────────────────────────────┘              ║
║                              │                                              ║
║  ┌───────────────────────────┼───────────────────────────────┐              ║
║  │              DATA LAYER                                    │              ║
║  │                                                            │              ║
║  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │              ║
║  │  │ Firebase RT  │  │ EF Databases │  │ Document     │    │              ║
║  │  │ Database     │  │              │  │ Store (RAG)  │    │              ║
║  │  │              │  │ A1-A3 (curated)│ │              │    │              ║
║  │  │ Projects     │  │ ICE v3.0     │  │ BOQ chunks   │    │              ║
║  │  │ Entries      │  │ EPD registry │  │ EPD docs     │    │              ║
║  │  │ Audit logs   │  │ PCAF datasets│  │ Submittals   │    │              ║
║  │  │ KPI history  │  │              │  │ Invoices     │    │              ║
║  │  └──────────────┘  └──────────────┘  └──────────────┘    │              ║
║  │                                                            │              ║
║  │  ┌──────────────┐  ┌──────────────┐                       │              ║
║  │  │ Audit Trail  │  │ IoT Bridge   │                       │              ║
║  │  │ (Immutable)  │  │ (Future)     │                       │              ║
║  │  │              │  │              │                       │              ║
║  │  │ Every change │  │ 53 device    │                       │              ║
║  │  │ timestamped  │  │ types        │                       │              ║
║  │  │ who/what/why │  │ sensor→CO₂   │                       │              ║
║  │  └──────────────┘  └──────────────┘                       │              ║
║  └───────────────────────────────────────────────────────────┘              ║
║                                                                             ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║  EXTERNAL INTEGRATIONS                                                      ║
║                                                                             ║
║  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         ║
║  │ Bank CBS │ │ GRESB    │ │ Climate  │ │ PCAF     │ │ EPD      │         ║
║  │ (Core    │ │ Portal   │ │ Bonds    │ │ Reporting│ │ Databases│         ║
║  │ Banking) │ │          │ │ Standard │ │          │ │ (ECO,    │         ║
║  │          │ │          │ │          │ │          │ │ IBU,etc) │         ║
║  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘         ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

---

## 6. Phase 1 — Pre-Construction (Loan Origination)

### What Happens

When a bank considers a green construction loan, CarbonIQ provides the **carbon risk assessment** before the loan is approved.

### Workflow

```
Bank Relationship Manager uploads BOQ from loan application
                    │
                    ▼
        ┌───────────────────────┐
        │  CLASSIFIER AGENT    │
        │                       │
        │  1. Reads entire BOQ  │
        │  2. ECCS 6-step       │
        │     classification    │
        │  3. EF assignment     │
        │     (A1-A3 → ICE)    │
        │  4. Unit conversion   │
        │  5. tCO₂e calculation │
        │  6. 80% Pareto ID    │
        └───────────┬───────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │  OUTPUTS (Automatic)  │
        │                       │
        │  • Carbon Budget      │  Total expected tCO₂e
        │  • Risk Score         │  High/Medium/Low based on:
        │    - Material mix     │    % high-carbon materials
        │    - Data quality     │    % items with valid EF
        │    - Conversion gaps  │    % blocked conversions
        │  • KPI Recommendations│  Suggested SPTs for the loan
        │  • Benchmark Position │  vs. PCAF building dataset
        │  • 80% Material List  │  Items needing EPD tracking
        └───────────────────────┘
```

### Carbon Risk Score (CRS) — The Bank's Decision Tool

```
╔═══════════════════════════════════════════════════════════╗
║           CARBON RISK SCORE (CRS)                        ║
║                                                          ║
║   Score: 0-100        Rating: A+ to F                    ║
║                                                          ║
║   COMPONENTS (weighted):                                 ║
║   ┌─────────────────────────────────────┐                ║
║   │ 30%  Material Carbon Intensity      │ kgCO₂e/m²     ║
║   │      vs. building type benchmark    │                ║
║   ├─────────────────────────────────────┤                ║
║   │ 25%  Data Completeness              │ % items with   ║
║   │      Valid EF + successful          │ conversion     ║
║   │      unit conversion                │                ║
║   ├─────────────────────────────────────┤                ║
║   │ 20%  80% Material Coverage          │ % of 80% items ║
║   │      with EPD or verified EF        │ verified       ║
║   ├─────────────────────────────────────┤                ║
║   │ 15%  Reduction Pathway              │ Credibility of ║
║   │      Feasibility                    │ target vs.     ║
║   │                                     │ material mix   ║
║   ├─────────────────────────────────────┤                ║
║   │ 10%  Regulatory Alignment           │ EN 15978, LMA, ║
║   │                                     │ local codes    ║
║   └─────────────────────────────────────┘                ║
║                                                          ║
║   RATING SCALE:                                          ║
║   A+ (90-100) → Premium green rate                       ║
║   A  (80-89)  → Standard green rate                      ║
║   B  (65-79)  → Green eligible with conditions           ║
║   C  (50-64)  → Sustainability-linked only               ║
║   D  (35-49)  → Standard rate, carbon monitoring req.    ║
║   F  (<35)    → Not eligible for green classification    ║
╚═══════════════════════════════════════════════════════════╝
```

### What Already Exists (Built)

| Component | Status | File |
|---|---|---|
| BOQ parsing + AI classification | **BUILT** | `parse-boq.js` |
| ECCS 6-step hierarchy | **BUILT** | `tender.js` |
| A1-A3 + ICE EF lookup | **BUILT** | `data.js` |
| Unit conversion with density fallback | **BUILT** | `tender.js` |
| 80% Pareto identification | **BUILT** | `tender.js` |
| Emission calculation (tCO₂e) | **BUILT** | `tender.js` |
| Document Intelligence (RAG) | **BUILT** | `intelligence.js` + `carbon-intelligence.js` |
| Carbon Advisor AI | **BUILT** | `carbon-advisor.js` |
| Audit trail | **BUILT** | `tender.js` |
| Carbon Risk Score | **MVP** | New — scoring algorithm |
| Bank Portal UI | **MVP** | New — read-only bank view |
| KPI recommendation engine | **MVP** | New — uses carbon budget data |

---

## 7. Phase 2 — During Construction (Draw Monitoring)

### What Happens

Every time the contractor submits a **draw-down request** (progress payment claim), CarbonIQ's Monitor Agent verifies the materials used match the carbon budget.

### Workflow

```
Contractor submits Draw-Down Claim #N
(materials procured, quantities installed, invoices)
                    │
                    ▼
        ┌───────────────────────┐
        │  MONITOR AGENT        │
        │                       │
        │  1. Extracts materials│
        │     from claim docs   │
        │  2. Matches to BOQ    │
        │     line items        │
        │  3. Checks: Did they  │
        │     use what they     │
        │     said they'd use?  │
        │  4. Recalculates      │
        │     actual tCO₂e      │
        │  5. Updates carbon    │
        │     budget burn-down  │
        │  6. Detects anomalies │
        └───────────┬───────────┘
                    │
                    ▼
        ┌───────────────────────────────────────────┐
        │  ANOMALY DETECTION                         │
        │                                            │
        │  🟢 ON TRACK     Material matches BOQ      │
        │                  Carbon within budget       │
        │                                            │
        │  🟡 WARNING      Material substituted       │
        │                  (e.g., CEM I instead of   │
        │                  CEM II/B — +40% carbon)   │
        │                  → Advisor Agent suggests   │
        │                    alternatives             │
        │                                            │
        │  🔴 ALERT        Carbon budget exceeded     │
        │                  or high-risk substitution  │
        │                  → Bank notified            │
        │                  → KPI breach risk flagged  │
        │                                            │
        │  ⚫ CRITICAL     Undocumented material      │
        │                  No EPD for 80% item       │
        │                  → Loan covenant trigger    │
        └───────────────────────────────────────────┘
```

### Carbon Budget Burn-Down Chart

```
tCO₂e
  │
  │  ─── Budget Line (from Phase 1 assessment)
  │  ╲
  │   ╲     ┌─── Draw #1: On track
  │    ╲    │
  │     ╲───┤
  │      ╲  │
  │       ╲─┤─── Draw #3: Concrete substituted
  │        ╲│    CEM I instead of CEM II/B
  │    ·····╲···· +340 tCO₂e over budget
  │          ╲
  │           ╲── Draw #5: Back on track
  │            ╲  (Advisor suggested recycled
  │             ╲  steel — compensated)
  │              ╲
  │               ╲── Completion: Within budget ✓
  ├────────────────────────────────────────── Time
  Draw#1  #2  #3  #4  #5  #6  #7  Completion
```

### What Already Exists vs. MVP

| Component | Status | Notes |
|---|---|---|
| Material classification engine | **BUILT** | Can classify any material list |
| AI document parsing | **BUILT** | Can read invoices, submittals |
| Carbon calculation | **BUILT** | tCO₂e from quantity + EF |
| Draw-down tracking | **MVP** | New — linked to BOQ baseline |
| Material substitution detection | **MVP** | New — diff engine against baseline |
| Anomaly alerts | **MVP** | New — threshold-based + AI |
| Bank notification API | **MVP** | New — webhook to bank system |
| Budget burn-down visualization | **MVP** | New — chart component |

---

## 8. Phase 3 — Post-Construction (KPI Compliance)

### What Happens

After construction completes, CarbonIQ continues monitoring for the **life of the loan** (typically 5-25 years for construction finance). The Reporter Agent generates annual compliance documents.

### Workflow

```
        ┌───────────────────────────────────────────┐
        │  ANNUAL CYCLE (Automated by Reporter)      │
        │                                            │
        │  Q1: Data collection period opens          │
        │      → Contractor uploads as-built data    │
        │      → Facility manager uploads ops data   │
        │                                            │
        │  Q2: Reporter Agent generates:             │
        │      → Annual KPI performance report       │
        │      → PCAF financed emissions calc        │
        │      → Margin adjustment recommendation    │
        │      → GRESB data export                   │
        │                                            │
        │  Q3: Verification period                   │
        │      → Third-party auditor access          │
        │      → Audit trail available for review    │
        │                                            │
        │  Q4: Bank review                           │
        │      → Margin step-up/step-down applied    │
        │      → Next year targets set               │
        └───────────────────────────────────────────┘
```

### PCAF Financed Emissions Calculation

```
╔════════════════════════════════════════════════════════════╗
║  PCAF CALCULATION (Automated by CarbonIQ)                 ║
║                                                           ║
║  Financed Emissions = Embodied Carbon × Attribution       ║
║                                                           ║
║  ┌─────────────────┐   ┌─────────────────────────┐       ║
║  │ Embodied Carbon │   │ Attribution Factor       │       ║
║  │ (from Phase 1&2)│   │                          │       ║
║  │                 │ × │  Outstanding Loan Amount  │       ║
║  │ Total project   │   │  ─────────────────────── │       ║
║  │ tCO₂e verified  │   │  Property Value at       │       ║
║  │ during          │   │  Origination              │       ║
║  │ construction    │   │                          │       ║
║  └─────────────────┘   └─────────────────────────┘       ║
║                                                           ║
║  = Bank's share of project embodied carbon                ║
║  = Goes into bank's Scope 3 (Category 15) reporting      ║
╚════════════════════════════════════════════════════════════╝
```

### What Already Exists vs. MVP

| Component | Status | Notes |
|---|---|---|
| Project emissions data | **BUILT** | All Phase 1 data persists |
| Reduction tracking | **BUILT** | `pages.js` dashboard |
| AI analysis dimensions | **BUILT** | 5-dimension RAG analysis |
| PCAF calculation | **MVP** | New — attribution factor engine |
| Annual report generator | **MVP** | New — Reporter Agent |
| GRESB data export | **FUTURE** | Phase 2 post-MVP |
| Operational carbon (B-stage) | **FUTURE** | IoT integration |

---

## 9. Bank API Portal — The Revenue Product

This is what the bank sees. A dedicated portal showing their entire green construction loan portfolio.

```
╔═══════════════════════════════════════════════════════════════════════╗
║  BANK PORTAL — GREEN CONSTRUCTION LOAN PORTFOLIO                     ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  PORTFOLIO OVERVIEW                                                   ║
║  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐          ║
║  │ 47      │  │ 12,450   │  │ B+       │  │ $2.1B        │          ║
║  │ Active  │  │ tCO₂e    │  │ Avg CRS  │  │ Green Loan   │          ║
║  │ Loans   │  │ Financed │  │ Rating   │  │ Portfolio    │          ║
║  └─────────┘  └──────────┘  └──────────┘  └──────────────┘          ║
║                                                                       ║
║  LOAN STATUS BREAKDOWN                                                ║
║  ┌───────────────────────────────────────────────────────────┐       ║
║  │ 🟢 On Track (34)      ████████████████████████████░░░░░  │       ║
║  │ 🟡 Warning  (9)       ██████░░░░░░░░░░░░░░░░░░░░░░░░░░  │       ║
║  │ 🔴 Alert    (3)       ███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │       ║
║  │ ⚫ Critical (1)       █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │       ║
║  └───────────────────────────────────────────────────────────┘       ║
║                                                                       ║
║  PCAF DISCLOSURE SUMMARY                                              ║
║  ┌───────────────────────────────────────────────────────────┐       ║
║  │ Scope 3 Cat 15 (Financed Emissions):  8,234 tCO₂e       │       ║
║  │ Data Quality Score:  3.2 / 5.0                            │       ║
║  │ Coverage:  89% of green construction portfolio            │       ║
║  │ YoY Change:  -12% (improving)                             │       ║
║  └───────────────────────────────────────────────────────────┘       ║
║                                                                       ║
║  REGULATORY COMPLIANCE                                                ║
║  ┌──────────────────┬───────┬────────────────────────────┐           ║
║  │ Framework        │Status │ Next Action                 │           ║
║  ├──────────────────┼───────┼────────────────────────────┤           ║
║  │ LMA GLP 2025     │ ✅    │ Annual report due Q2 2026  │           ║
║  │ PCAF Standard    │ ✅    │ v3 migration by Dec 2026   │           ║
║  │ GRESB Reporting  │ 🟡   │ Embodied carbon data req.  │           ║
║  │ CBSL Guidelines  │ ✅    │ Next review Apr 2026       │           ║
║  │ Climate Bonds    │ ⬜    │ Pre-issuance cert. needed  │           ║
║  └──────────────────┴───────┴────────────────────────────┘           ║
║                                                                       ║
║  [View All Loans]  [Export PCAF]  [Generate Board Report]            ║
╚═══════════════════════════════════════════════════════════════════════╝
```

---

## 10. Data Flow — End to End

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║                          CarbonIQ DATA FLOW                                  ║
║                                                                              ║
║  INPUT SOURCES           PROCESSING              OUTPUTS                     ║
║                                                                              ║
║  ┌────────────┐         ┌──────────────┐        ┌──────────────────┐        ║
║  │ BOQ (PDF/  │────────▶│ Classifier   │───────▶│ Carbon Budget    │        ║
║  │ Excel/CSV) │         │ Agent        │        │ (baseline tCO₂e) │        ║
║  └────────────┘         └──────────────┘        └────────┬─────────┘        ║
║                                                          │                   ║
║  ┌────────────┐         ┌──────────────┐                │                   ║
║  │ Material   │────────▶│ Auditor      │───────▶┌───────▼──────────┐        ║
║  │ Submittals │         │ Agent        │        │ Verified Baseline│        ║
║  │ & EPDs     │         └──────────────┘        │ + Risk Score     │        ║
║  └────────────┘                                 └───────┬──────────┘        ║
║                                                          │                   ║
║  ┌────────────┐         ┌──────────────┐                │  TO BANK          ║
║  │ Draw-Down  │────────▶│ Monitor      │───────▶┌───────▼──────────┐        ║
║  │ Claims     │         │ Agent        │        │ Progress Report  │        ║
║  │ (monthly)  │         └──────────────┘        │ + Alerts         │        ║
║  └────────────┘                                 └───────┬──────────┘        ║
║                                                          │                   ║
║  ┌────────────┐         ┌──────────────┐                │                   ║
║  │ As-Built   │────────▶│ Advisor      │───────▶┌───────▼──────────┐        ║
║  │ Records    │         │ Agent        │        │ Reduction Plan   │        ║
║  └────────────┘         └──────────────┘        │ + Alternatives   │        ║
║                                                 └───────┬──────────┘        ║
║  ┌────────────┐         ┌──────────────┐                │                   ║
║  │ Loan Terms │────────▶│ Reporter     │───────▶┌───────▼──────────┐        ║
║  │ (KPIs,SPTs)│         │ Agent        │        │ PCAF Report      │        ║
║  │ Property   │         └──────────────┘        │ KPI Scorecard    │        ║
║  │ Valuation  │                                 │ Board Report     │        ║
║  └────────────┘                                 │ GRESB Export     │        ║
║                                                 └──────────────────┘        ║
║                                                                              ║
║  ┌────────────┐                                 ┌──────────────────┐        ║
║  │ IoT/Sensors│─────────────────────────────────▶│ Real-time Ops   │        ║
║  │ (Future)   │                                 │ Carbon (B-stage) │        ║
║  └────────────┘                                 └──────────────────┘        ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

---

## 11. MVP Definition — What to Build for Competition + DFCC

### MVP Scope (2 Weeks)

The MVP proves the **complete lifecycle** works end-to-end on a single project. It builds on what's already built.

```
╔═══════════════════════════════════════════════════════════════════════╗
║                    MVP SCOPE (2 WEEKS)                               ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  ALREADY BUILT ✅ (80% of engine)                                    ║
║  ─────────────────────────────────                                   ║
║  • BOQ Upload + AI Classification (Classifier Agent core)            ║
║  • ECCS 6-step hierarchy                                             ║
║  • A1-A3 + ICE emission factor lookup                                ║
║  • Unit conversion with density fallback                             ║
║  • 80% Pareto identification (ISO 21930)                             ║
║  • Emission calculation (tCO₂e)                                      ║
║  • Document Intelligence (RAG + 5-dimension AI analysis)             ║
║  • Carbon Advisor AI (reduction strategies)                          ║
║  • Multi-role access (Consultant / Contractor / Client)              ║
║  • Audit trail (edit history, original EF tracking)                  ║
║  • A4/A5 transport + site emissions                                  ║
║  • Project dashboard with reduction tracking                         ║
║  • Firebase auth + multi-tenant isolation                            ║
║  • Security layer (encryption, RBAC, rate limiting)                  ║
║                                                                       ║
║  MVP BUILD 🔨 (New for competition/DFCC)                             ║
║  ────────────────────────────────────────                             ║
║                                                                       ║
║  WEEK 1: Bank Foundation                                             ║
║  ┌───────────────────────────────────────────────────────────────┐   ║
║  │ 1. CARBON RISK SCORE (CRS)                        [2 days]   │   ║
║  │    • Scoring algorithm (5 components, weighted)               │   ║
║  │    • A+ to F rating based on BOQ assessment quality           │   ║
║  │    • Auto-generated after every BOQ import                    │   ║
║  │    • Visual risk gauge in dashboard                           │   ║
║  │                                                               │   ║
║  │ 2. KPI RECOMMENDATION ENGINE                      [1 day]    │   ║
║  │    • Based on CRS + material mix, suggest SPT targets         │   ║
║  │    • Aligned with LMA 2025 + SLLP guidance                   │   ║
║  │    • Output: "Recommended KPIs for this green loan"           │   ║
║  │                                                               │   ║
║  │ 3. BANK PORTAL (Read-Only View)                   [2 days]   │   ║
║  │    • New role: "bank" — sees portfolio overview                │   ║
║  │    • Project list with CRS ratings                            │   ║
║  │    • Click into any project → see carbon budget + 80% items   │   ║
║  │    • PCAF attribution factor input (loan amount / value)      │   ║
║  │    • Export button for compliance report                      │   ║
║  └───────────────────────────────────────────────────────────────┘   ║
║                                                                       ║
║  WEEK 2: Lifecycle Demonstration                                     ║
║  ┌───────────────────────────────────────────────────────────────┐   ║
║  │ 4. DRAW-DOWN MONITORING (Simplified)              [2 days]   │   ║
║  │    • "Submit Progress Claim" button for contractors           │   ║
║  │    • Upload materials used this period                        │   ║
║  │    • Monitor Agent: compare vs baseline, flag changes         │   ║
║  │    • Carbon budget burn-down visualization                    │   ║
║  │    • Alert status (green/yellow/red) visible in bank portal   │   ║
║  │                                                               │   ║
║  │ 5. PCAF CALCULATOR                                [1 day]    │   ║
║  │    • Input: loan amount, property value                       │   ║
║  │    • Calculates attribution factor                            │   ║
║  │    • Outputs: financed emissions for this loan                │   ║
║  │    • Exportable in PCAF format                                │   ║
║  │                                                               │   ║
║  │ 6. COMPLIANCE REPORT GENERATOR                    [2 days]   │   ║
║  │    • Reporter Agent: auto-generates PDF/HTML report           │   ║
║  │    • Includes: CRS, carbon budget, 80% materials, KPIs       │   ║
║  │    • PCAF section with financed emissions                     │   ║
║  │    • Audit trail summary                                      │   ║
║  │    • Formatted for bank board/committee presentation          │   ║
║  └───────────────────────────────────────────────────────────────┘   ║
║                                                                       ║
║  DEMO FLOW (for DFCC meeting + competition)                          ║
║  ──────────────────────────────────────────                          ║
║  1. Upload a real BOQ → AI classifies everything in <30 seconds      ║
║  2. Carbon Risk Score generated automatically → "B+ Rating"          ║
║  3. KPI recommendations appear → "20% reduction target"              ║
║  4. Simulate draw-down → material substitution detected              ║
║  5. Alert appears in Bank Portal → "Warning: CEM I detected"        ║
║  6. Advisor Agent suggests alternative → "Switch to CEM II/B"       ║
║  7. Click "Generate Report" → complete PCAF-ready document           ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
```

---

## 12. Post-MVP Roadmap

```
╔═══════════════════════════════════════════════════════════════════════╗
║                     POST-MVP ROADMAP                                 ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  PHASE A: MARKET ENTRY (Month 1-3 post-MVP)                         ║
║  ─────────────────────────────────────────────                       ║
║  • Multi-project bank portfolio dashboard                            ║
║  • EPD database integration (ECO Platform, IBU)                      ║
║  • GRESB data export format                                          ║
║  • Climate Bonds Standard pre-issuance checklist                     ║
║  • Multi-bank support (loan syndication)                             ║
║  • Bank CBS API integration (pilot with DFCC)                        ║
║                                                                       ║
║  PHASE B: SCALE (Month 3-6)                                         ║
║  ─────────────────────────────────────────────                       ║
║  • Automated draw-down verification (invoice parsing)                ║
║  • Contractor rating system (cross-project performance)              ║
║  • SPO (Second Party Opinion) data package generator                 ║
║  • Regional EF databases (GCC, MENA, APAC)                          ║
║  • Supplier marketplace (low-carbon material matching)               ║
║  • White-label bank branding                                         ║
║                                                                       ║
║  PHASE C: ECOSYSTEM (Month 6-12)                                    ║
║  ─────────────────────────────────────────────                       ║
║  • IoT integration (53 device types, sensor-to-carbon)               ║
║  • Operational carbon (B-stage) monitoring                           ║
║  • Building performance warranty tracking                            ║
║  • Carbon credit eligibility assessment                              ║
║  • Digital MRV for green bond reporting                               ║
║  • Regulatory filing automation (CBSL, MAS, HKMA)                   ║
║                                                                       ║
║  PHASE D: PLATFORM (Month 12+)                                      ║
║  ─────────────────────────────────────────────                       ║
║  • Multi-country regulatory mapping                                  ║
║  • Blockchain-anchored audit trail (optional)                        ║
║  • Insurance product integration (construction all-risk)             ║
║  • Secondary market green bond verification                          ║
║  • AI model fine-tuning on 10,000+ BOQ assessments                  ║
║  • Open API for third-party green finance tools                      ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
```

---

## 13. Revenue Model

```
╔═══════════════════════════════════════════════════════════════════════╗
║                     REVENUE MODEL                                    ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  TIER 1: PER-PROJECT LICENSE (Bank pays)                             ║
║  ────────────────────────────────────────                             ║
║  • Phase 1 (Pre-Construction Assessment):     $3,000 - $5,000       ║
║  • Phase 2 (Draw Monitoring, per year):       $2,000 - $4,000       ║
║  • Phase 3 (Post-Construction, per year):     $1,000 - $2,000       ║
║  • Full lifecycle (3-year typical):           $9,000 - $15,000      ║
║                                                                       ║
║  TIER 2: PORTFOLIO LICENSE (Bank-wide)                               ║
║  ────────────────────────────────────────                             ║
║  • Up to 50 projects:      $120,000/year                             ║
║  • Up to 200 projects:     $350,000/year                             ║
║  • Unlimited:              $600,000/year                             ║
║  • Includes: Bank Portal, PCAF reports, API access                   ║
║                                                                       ║
║  TIER 3: CONSULTANT/CONTRACTOR (Free → Premium)                     ║
║  ────────────────────────────────────────                             ║
║  • Community (Open Source):  Free (5 projects, basic features)       ║
║  • Professional:             $200/month (unlimited projects)         ║
║  • Enterprise:               Custom (SSO, API, white-label)         ║
║                                                                       ║
║  AT SCALE (500 bank projects):                                       ║
║  • Per-project revenue:      $2.5M - $7.5M/year                     ║
║  • Portfolio licenses:       $1.2M - $3.6M/year (10-30 banks)       ║
║  • Total addressable:        $3.7M - $11.1M/year                    ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
```

---

## 14. Competitive Moat

```
╔═══════════════════════════════════════════════════════════════════════╗
║                     WHY CarbonIQ WINS                                ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  MOAT 1: FULL LIFECYCLE (No competitor does all 3 phases)            ║
║  ─────────────────────────────────────────────────────────            ║
║  One Click LCA → Design stage only, architect-facing                 ║
║  EC3 → Material comparison tool, US-focused                          ║
║  Normative → EU taxonomy reporting, no construction monitoring       ║
║  CarbonIQ → Pre + During + Post construction, bank-facing            ║
║                                                                       ║
║  MOAT 2: AI-NATIVE (Not bolted on — built around AI)                ║
║  ─────────────────────────────────────────────────────                ║
║  • 5 autonomous agents, not a chatbot                                ║
║  • 3 production AI engines already running                           ║
║  • AI classifies, converts, calculates, monitors, reports            ║
║  • Human reviews and approves — AI does the work                     ║
║                                                                       ║
║  MOAT 3: OPEN-SOURCE CORE (Community + Trust)                        ║
║  ─────────────────────────────────────────────────                    ║
║  • Core assessment engine is open source                             ║
║  • Banks can audit the calculation methodology                       ║
║  • Regulators can verify compliance logic                            ║
║  • Community contributes EF data and regional factors                ║
║  • Enterprise features (bank portal, API) are proprietary            ║
║                                                                       ║
║  MOAT 4: DATA NETWORK EFFECT                                         ║
║  ────────────────────────────                                         ║
║  • Every BOQ processed improves AI classification accuracy           ║
║  • Every project creates benchmarking data                           ║
║  • Banks see cross-project and cross-contractor patterns             ║
║  • Regional EF database grows with each deployment                   ║
║                                                                       ║
║  MOAT 5: REGULATORY ALIGNMENT                                        ║
║  ─────────────────────────────                                        ║
║  • Built on EN 15978 / ISO 21930 (not proprietary methodology)       ║
║  • PCAF-ready output format                                          ║
║  • LMA GLP 2025 compliant                                            ║
║  • GRESB data structure ready                                        ║
║  • Climate Bonds Standard v4.0 aligned                               ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
```

---

## 15. Security & Compliance Architecture

```
╔═══════════════════════════════════════════════════════════════════════╗
║                     SECURITY ARCHITECTURE                            ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  ALREADY BUILT ✅                                                    ║
║  • Firebase Auth with email/password                                 ║
║  • RBAC (consultant, contractor, client, bank roles)                 ║
║  • Multi-tenant data isolation (org-level)                           ║
║  • AI data privacy (anonymization before API calls)                  ║
║  • CSRF protection                                                   ║
║  • Rate limiting (per-user, per-endpoint)                            ║
║  • Payload size validation                                           ║
║  • Prompt injection detection                                        ║
║  • Field-level encryption for sensitive data                         ║
║  • Immutable audit trail                                             ║
║                                                                       ║
║  MVP ADDITIONS                                                       ║
║  • Bank role with read-only portfolio access                         ║
║  • API key authentication for bank system integration                ║
║  • Data residency controls (regional Firebase instances)             ║
║  • Compliance report signing (digital signature)                     ║
║                                                                       ║
║  FUTURE                                                              ║
║  • SOC 2 Type II certification                                       ║
║  • ISO 27001 alignment                                               ║
║  • Bank-grade encryption (AES-256 at rest, TLS 1.3 in transit)      ║
║  • SSO/SAML integration for enterprise banks                         ║
║  • Audit log export for bank compliance teams                        ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
```

---

## 16. Technology Stack

| Layer | Current | MVP Addition |
|---|---|---|
| **Frontend** | Single-page app (`index.html`), vanilla JS | Bank portal view, CRS dashboard, burn-down chart |
| **Backend** | Netlify serverless functions (Node.js) | Draw-down API, PCAF calc, report generator |
| **AI** | Claude Sonnet (3 production engines) | Monitor Agent, Reporter Agent prompts |
| **Database** | Firebase Realtime Database | KPI history, draw-down records, bank config |
| **Auth** | Firebase Auth + custom RBAC | Bank role, API key auth |
| **Security** | Encryption, CSRF, rate limiting, AI privacy | Report signing, API auth |
| **Hosting** | Netlify (global CDN) | Same |
| **Documents** | RAG pipeline (chunking + retrieval) | Invoice/submittal parsing for draw-downs |

---

## 17. Key Metrics for Competition Judging

| Metric | Value | Source |
|---|---|---|
| **Market gap** | 90%+ of RE debt has no climate KPIs | WEF 2024 |
| **Greenwashing litigation** | 12x increase in 3 years | Sustainalytics |
| **PCAF signatories** | 500+ financial institutions globally | PCAF 2025 |
| **Green borrower default** | 32% lower than standard | Industry data |
| **CarbonIQ engine readiness** | 80% of core built and running | This codebase |
| **AI engines in production** | 3 (Classifier, Intelligence, Advisor) | Live |
| **Material database** | 200+ materials (A1-A3 + ICE v3.0) | `data.js` |
| **Time to assess 1 BOQ** | <30 seconds (AI-powered) | Measured |
| **Competitor coverage** | 0 platforms cover full loan lifecycle | Research |
| **First-mover in bank-facing** | No competitor serves banks directly | Research |

---

## 18. One-Slide Summary (For Presentations)

```
╔═══════════════════════════════════════════════════════════════════════╗
║                                                                       ║
║   CarbonIQ — AI-Native Green Loan Compliance for Construction        ║
║                                                                       ║
║   THE PROBLEM     90% of $5.8T real estate debt has zero climate     ║
║                   monitoring. Banks face $286B+ greenwashing risk.    ║
║                                                                       ║
║   THE SOLUTION    5 AI agents that autonomously classify, monitor,   ║
║                   and report embodied carbon across the entire        ║
║                   green loan lifecycle — pre, during, and post        ║
║                   construction.                                       ║
║                                                                       ║
║   WHAT'S BUILT    80% of core engine. 3 AI engines in production.   ║
║                   200+ materials. <30 second BOQ assessment.         ║
║                                                                       ║
║   THE MOAT        Only platform covering all 3 lifecycle phases.     ║
║                   AI-native. Open-source core. PCAF/LMA aligned.    ║
║                                                                       ║
║   THE ASK         Pilot with 1 bank (DFCC) → 10 projects →          ║
║                   prove unit economics → scale to 500 projects       ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
```

---

*This architecture document serves as the technical foundation for the DSIA 2026 competition submission and the DFCC bank presentation. The MVP scope is designed to be achievable in 2 weeks while demonstrating the complete lifecycle vision.*
