# PCAF Part A — source notes

Working reference for the Part A (Financed Emissions) build. Extracted from the
documents listed below, with the page citation the source itself gives, so every
rule we implement can be checked against the published standard.

**These are notes, not the standard.** The documents are PCAF's and are not
reproduced here. Download them from
<https://carbonaccountingfinancials.com/resources> and attach the relevant one
when working on a clause.

---

## 1. Documents held, and what each is for

| Document | Date | What it gives us | Status |
|---|---|---|---|
| **Global GHG Accounting and Reporting Standard, Part A: Financed Emissions — Third Edition** | Dec 2025 | Chapter 5 methodologies: asset classes, attribution formulas, data-quality tables. **The calculator core.** | **NOT YET HELD** |
| **PCAF Disclosure Checklist (DCL), Part A** | May 2025 | Chapter 6 reporting requirements as Yes/No items with page cites (pp.122–129) | Held |
| **DCL Frequently Asked Questions** | May 2025 | What the DCL is for and how it is submitted | Held |
| **Supplemental guidance: financed avoided emissions & forward-looking metrics** | Dec 2025 | Avoided emissions, Use of Proceeds, EER/EAE | Held |

### Version mismatch to watch

The Third Edition (launched **2 December 2025**) expands Part A from **seven to
ten asset classes** and adds four methodologies — **Use of Proceeds,
Securitizations, Sub-Sovereign Debt, and IFRS-aligned reporting of undrawn loan
commitments**. The DCL we hold is **May 2025** and still refers to "the seven
asset classes" (Coverage item 2, p.124). Treat the DCL as authoritative for the
*shape* of the reporting requirements and confirm the asset-class count against
the Third Edition before we publish anything that counts them.

---

## 2. What the Disclosure Checklist is

PCAF's own template of Part A's key reporting requirements, drawn from
**Chapter 6 (pp.122–129)**. A signatory completes it and may submit it to the
PCAF Secretariat alongside a draft or final financed-emissions disclosure.

Rules that govern how it is answered — these are the rules our generator must
follow:

- Every question is answered **Yes or No**.
- A **No** on any *Reporting Requirement* category (General Disclosure Criteria,
  Coverage, Absolute Emissions, Avoided Emissions and Emission Removals,
  Recalculation and Significance Threshold) **requires a sufficient
  justification** in the checklist, ideally also in the public disclosure.
- A **No** on a *Reporting Recommendation* may be left unexplained, though
  justification is encouraged.
- **Non-applicable** is recorded as **No** with "non-applicable" in the comment.
- Per question, the signatory should indicate **the pages of the report** where
  the disclosure appears.
- Header fields: signatory name · report title · relevant pages · publication
  date · URL.

Two things PCAF states explicitly, which we must not overstate in marketing:

- Completed checklists are **confidential** and are never published by PCAF.
- Secretariat review of a DCL **is not a form of assurance** — PCAF describes it
  as a quality review, not an audit.

---

## 3. Reporting requirements ("shall")

A No here needs a justification.

### General disclosure criteria
1. Uses the **operational control** or **financial control** consolidation
   approach, per the GHG Protocol Corporate Value Chain (Scope 3) Standard. (p.123)

### Coverage
1. Includes absolute financed emissions for **all asset classes relevant to the
   portfolio** covered in Chapter 5, and **justifies any exclusions**. (p.124)
2. Discloses the **percentage of total loans and investments covered** by the
   inventory across the asset classes relevant to the portfolio. (p.124)

### Absolute emissions
1. Discloses absolute financed emissions — **scope 1 and 2** — of its loans and
   investments. (p.125)
2. Discloses absolute **scope 3** financed emissions, including the specific
   **mandatory sectors** where required by the relevant Chapter 5 methodology. (p.125)
3. **Disaggregates** absolute financed emissions **by asset class or by sector**. (p.125)
4. Disaggregates **by sector**, particularly for the most emission-intensive
   sectors — energy, power, cement, steel, automotive. (p.125)

### Avoided emissions and emission removals
1. Where reported, they are shown **separately from the scope 1, 2 and 3
   inventories** (Annex 10.2 gives an example). (p.126)
2. Reported **without taking into account carbon credits** generated for those
   same emissions. (p.126)

### Recalculation and significance threshold
1. Has a **baseline recalculation protocol** defining when base-year financed
   emissions must be recalculated, for consistency, comparability and relevance
   over time, in line with the GHG Protocol Scope 3 Standard. (p.124)
2. **Establishes and discloses the significance threshold** that triggers base
   year recalculation, as part of that protocol. (p.124)

---

## 4. Reporting recommendations ("should")

### Emission intensity
1. Expresses **economic emission intensity** at portfolio, asset class or sector
   level, in **tCO2e per million invested or loaned** — tCO2e/M€, tCO2e/$M or any
   other currency. (p.127)

### Data and data quality
1. Reports a **weighted data quality score, weighted by outstanding amount**. (p.128)
2. Reports the weighted data quality score of **scope 3 financed emissions
   separately** from that of scopes 1 and 2, where applicable. (p.128)

> **Note the difference from Part C.** Part A weights the disclosed data-quality
> score by **outstanding amount**; Part C weights by **premium** (Box 6-3, p.107),
> with ceded premium for treaty reinsurance (Box 6-4, p.108). The scope 3 /
> scope 1&2 separation is common to both. Do not share a weighting function
> between the two engines.

---

## 5. Supplemental guidance — avoided emissions and forward-looking metrics

December 2025, supplemental to Part A. Two families:

**Financed avoided emissions.** Avoided emissions are the GHG Protocol's
"positive GHG emissions impact of a product relative to the situation where that
product does not exist". *Financed* avoided emissions are those attributable to
an institution providing the capital. The GHG Protocol Corporate Standard does
not yet standardise avoided emissions; it publishes a neutral framework, and
WBCSD publishes corporate guidance. Includes **Use of Proceeds (UoP)** accounting
guidance.

**Forward-looking emissions metrics.** GFANZ has proposed **Expected Emissions
Reductions (EER)**; **Expected Avoided Emissions (EAE)** sits alongside it. These
assess the future decarbonisation potential of an exposure and are intended to
complement, not replace, an emissions inventory.

**Why this matters commercially.** Avoided emissions, Use of Proceeds and
forward-looking metrics are the measurement layer under **transition finance** —
the same ground as the Emirates NBD Transition Finance Framework. If we build
Part A, this supplement is the bridge from a financed-emissions calculator to a
transition-finance product, and PCAF has now given it a method.

**Accounting rule already clear:** avoided emissions and removals are reported
**separately** from the scope 1/2/3 inventory and are **never netted** against
it (DCL, p.126). They must not double-count carbon credits raised on the same
emissions.

---

## 6. Still needed before the calculator can be built

The three documents held give us Chapter 6 — *what must be reported*. They do not
give Chapter 5 — *how it is calculated*. Outstanding:

1. The ten asset classes and their exact names
2. Attribution formula per asset class — numerator, denominator, and whether the
   denominator is measured **at origination** or **current**
3. The **data-quality table per asset class**, defining scores 1 to 5
4. Which scopes are required per asset class, and the **mandatory sectors** for
   scope 3 referred to by Absolute Emissions item 2
5. Undrawn loan commitments — the IFRS-aligned treatment (new in 3rd ed.)
6. Use of Proceeds, Securitizations, Sub-Sovereign Debt methodologies (new)
7. The inventory-fluctuation guidance (new)
8. How an attribution factor above 1 must be handled — disclosed, capped, or refused
9. Annex 10.2 — the worked example for reporting avoided emissions

**Source:** Part A Third Edition, December 2025 —
<https://carbonaccountingfinancials.com/files/standard-launch-2025/PCAF-PartA-2025-Full-Document-Clean.pdf>

---

## 7. Consequences for the build

- The **DCL maps directly onto the machinery already built for Part C**
  (`services/partc-checklist.js`): a self-assessment answered from the same facts
  the report sections render, so an item cannot answer Yes to something the
  document does not contain, and anything but Yes carries its reason. Part A's
  version is the same pattern against a different requirement set.
- **Auto-completing a signatory's DCL is a concrete deliverable in its own
  right** — PCAF expects it to take a signatory 30–40 minutes by hand, and it is
  submitted with every disclosure.
- **Coverage percentage is a requirement, not a nicety** (p.124). The engine must
  know the denominator — total loans and investments — not only what was assessed.
- **Recalculation protocol and significance threshold are "shall"** items. Part C
  already models both on entity settings; Part A can reuse that shape.
- Avoided emissions need their **own container**, never summed into the inventory.

