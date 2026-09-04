# Sri Lanka Green Finance Taxonomy — the source document, and what it actually says

**Source of record:** `SLGFT-Sri-Lanka-Green-Finance-Taxonomy-May2022.pdf` (repository root)

| | |
|---|---|
| Title on the cover | **Sri Lanka Green Finance Taxonomy** |
| Date on the cover | **May 2022** |
| Pages | 26 |
| PDF created | 2022-05-04 |
| SHA-256 | `1b4f7f78b77b5ab3a40867b054b1052f5cecfb42e33d33b3354cc766acc9803a` |

This file exists so that every taxonomy claim in the codebase can be checked
against the document rather than against somebody's recollection of it. That is
the same reason `docs/PCAF-PART-A-SOURCES.md` exists.

---

## 1. What the document contains

**Four environmental objectives**

1. Climate change mitigation
2. Climate change adaptation
3. Pollution prevention and control
4. Ecological conservation and resource efficiency

**Six guiding principles**

Substantial contribution · Do no significant harm (DNSH) · Respect Sri Lanka's
green development priorities · Science-based screening · Compatible with
international standards and practices · Dynamic adjustment

**Benchmarks the taxonomy was built against** — stated on its own contents page:

- *Climate change mitigation* — IPSF Common Ground Taxonomy (2021), **Sri Lanka
  updated NDCs (2021)**, EU Taxonomy Climate Delegated Act (2021), China Green
  Bond Endorsed Project Catalogue (2021)
- *Climate change adaptation* — **Sri Lanka updated NDCs (2021)**, National
  Adaptation Plan 2016–2025, IFC Climate Smart Agriculture Financing
  Opportunities in Sri Lanka (2021)
- *Other green objectives* — Green Bond Endorsed Project Catalogue (2021),
  Colombia Green Taxonomy (draft 2021), IFC Guidelines for Blue Finance (2022)

**Activity table columns** — Number · Macro-sector · Activity · Description ·
*Metric & Threshold for Sri Lanka*.

Activity codes take the form `{Objective}{MacroSector}.{Activity}` — `M6.3` is
the third activity of macro-sector 6 under the mitigation objective.

---

## 2. The construction thresholds, verbatim

This is the section the application depends on, so it is quoted exactly.

### M6.1 — Renovation of existing buildings

> Energy-saving renovation of existing buildings and energy-use systems of
> buildings.
>
> **Threshold:** The building renovation leads to a reduction of primary energy
> demand (PED) / energy consumption / GHG emissions of **at least 30%**.

### M6.2 — Acquisition and ownership of buildings

> Buying real estate and exercising ownership of that real estate.
>
> **Threshold:** **Green SL Rated buildings: Gold and Platinum.**

### M6.3 — Construction of new buildings

> Construction of new buildings.
>
> **Threshold:** The GHG emissions / energy consumption / Primary Energy Demand
> (PED) of the building resulting from the construction, is **at least 10%
> lower** than the threshold set by a relevant national/international **nearly
> zero-energy building** requirements.

### M6.7 — Infrastructure for electric rail transport

Scope: electrified rail only, with criteria on the infrastructure itself.

---

## 3. What is NOT in this document

> **There is no absolute embodied-carbon threshold in kgCO₂e/m² anywhere in the
> Sri Lanka Green Finance Taxonomy, May 2022.**

A full-text sweep of all 26 pages returns exactly one figure expressed per unit
area, and it is unrelated: *"the power density of the electricity generation
facility is above 5 W/m²"* (activity M4.5, hydropower).

The construction thresholds are of two kinds, and **neither is an absolute
carbon intensity**:

| Kind | Where | Form |
|---|---|---|
| **Relative** | M6.1, M6.3 | A percentage improvement against a stated reference |
| **Certification** | M6.2 | Green SL Rated Gold or Platinum |

This matters because a relative threshold cannot be evaluated from a carbon
intensity alone. To answer *"is this new building M6.3-aligned?"* you need the
relevant nearly-zero-energy benchmark for Sri Lanka and the building's
performance against it — not a kgCO₂e/m² figure on its own.

---

## 4. Two claims in this codebase that this document does not support

Recorded rather than silently corrected, because changing either alters what an
existing caller receives, and because a later edition of the taxonomy may exist
that this repository does not hold.

### 4.1 Absolute kgCO₂e/m² bands

The codebase carries **two different** absolute threshold sets, and the source
document contains **neither**:

| Where | Green | Transition | Attributed to |
|---|---|---|---|
| `config/constants.js:118–125` | 520 | 780 | "CBSL Compliant" |
| `config/constants.js:205, 220–221` | 600 | 900 | SLGFT activity `M1.1` |
| **This document** | — | — | **No absolute band exists** |

Two further problems visible from the source:

- The activity code `M1.1` is used in `constants.js` for "Green Buildings — New
  Construction". In the document, construction sits in **macro-sector 6**
  (`M6.1`, `M6.2`, `M6.3`, `M6.7`), not macro-sector 1.
- The label "Green (CBSL Compliant)" asserts compliance. Compliance against the
  taxonomy is determined by the Central Bank, not by this software — the same
  failure `services/report-integrity.js` exists to prevent elsewhere.

### 4.2 The version string "SLGFT v2024"

`services/certificate.js` stamps `taxonomy: 'SLGFT v2024'` onto the Green Loan
Certificate — a document that carries a SHA-256 audit hash — and `CLAUDE.md`
describes the version as "SLGFT v2024" throughout.

**The document in this repository is dated May 2022.** Either a 2024 edition
exists and is not held here, or the version string is wrong. Until the
first is evidenced, a certificate should not assert an edition nobody in this
repository can produce.

That is the same class of error as the superseded NDC targets: a version claim
printed onto an audit-hashed document, with nothing checking it.

---

## 5. What was corrected against this document

Applied in commit following this note. The rule was: **where the document
speaks, its values and wording win; where it is silent, our own figures stand
but stop claiming to be the taxonomy's.**

| Was | Now | Basis |
|---|---|---|
| `M1.1` Green Buildings — New Construction, 600 kgCO₂e/m² | `M6.3` Construction of new buildings, ≥10% below a nearly zero-energy benchmark | Document §M6.3 |
| `M1.2` Green Buildings — Renovation, ≥30% | `M6.1` Renovation of existing buildings, ≥30% PED/energy/GHG | Document §M6.1 — the 30% was right, the code was not |
| *(absent)* | `M6.2` Acquisition and ownership — Green SL Rated Gold and Platinum | Document §M6.2 |
| `M6.1` Clean Transportation Infrastructure | `M6.7` Infrastructure for electric rail transport | M6.1 is renovation |
| `A2.1` Flood-Resilient Construction | `A3.1` Climate-resilient warehouse and storage | **A2.1 is a financial-services activity — affordable climate insurance** |
| `E1.1`, `E3.1`, `A2.2` | removed | Not in the document; E1.6–1.8 are agriculture, E3.5–3.6 waste |
| `M4.1` Solar PV, `M4.2` CSP, `M4.3` Wind | kept, `code: null`, `inSourceDocument: false` | Not in this document. Its numbering skips M4.1–M4.4, so these are likely in the full taxonomy under codes we cannot confirm — unevidenced, not excluded |
| *(absent)* | `M4.5` hydropower, `M4.6` bio-energy, with full criteria | Document §M4.5, §M4.6 |
| `version: 2024` | `version: '2022-05'`, `edition: 'May 2022'` | The cover |
| Certificate stamp `SLGFT v2024` | `SLGFT May 2022`, derived from the constant | The stamp is inside the SHA-256 hash, so `LEGACY_STAMP` keeps already-issued certificates verifying |
| `Green (CBSL Compliant)` | `Green (intensity screen)` | Compliance is the Central Bank's determination |
| 520/780 and 600/900 | **unchanged**, relabelled as this product's own screen | The document sets no absolute threshold — but changing the numbers would rescore live projects |

`tests/slgft-source-fidelity.test.js` (22 tests) now pins all of it to the
document, including the PDF's SHA-256. The previous tests asserted the same
invented codes the constants held, so neither side caught the drift — the NDC
failure exactly.

---

## 6. What to do next

Decisions for the reporting entity, not for this software:

1. **Establish whether a post-2022 edition of the SLGFT exists.** If it does,
   add it here alongside this one and date both. If it does not, the `v2024`
   string must go.
2. **Decide what the absolute bands are and where they come from.** If
   520/780 or 600/900 originate in a CBSL direction, a green bond framework or
   an internal credit policy, that source belongs in this folder and the
   constants should cite it. If they came from neither, they are not taxonomy
   thresholds and should not be labelled as such.
3. **Decide whether the product screens on M6.1/M6.3 as written.** Doing so
   needs the nearly-zero-energy benchmark for Sri Lanka, which this repository
   does not hold — so until it does, an M6.3 determination is *absent*, not
   computable.

Until 1 and 2 are settled, the safe reading is: this product applies **its own
carbon-intensity bands**, which are a useful internal screen, and it should not
describe their output as SLGFT alignment or CBSL compliance.

---

*Every quotation above was extracted from the PDF in this repository. Page
numbering follows the document's own footer.*
