# The GCF Pipeline — A Tutorial

**Understanding what we built, why it works the way it does, and the ideas underneath it.**

Written to be read start to finish by someone who has never worked on climate
finance. No prior knowledge assumed. Every technical term is defined the first
time it appears.

CarbonIQ FinTech · Datum Solutions · Commit `2d317f0`

---

## How to read this

There are eleven parts. They build on each other, so read in order the first
time.

| Part | What you will understand after it |
|---|---|
| 1 | Who the Green Climate Fund is and why DFCC needs this |
| 2 | The exact gap we were asked to fill |
| 3 | The one principle everything else follows from |
| 4 | What a carbon number actually *is*, and how they go wrong |
| 5 | Baselines: the idea that makes a tCO₂e figure mean anything |
| 6 | The three carbon boundaries, and why adding them is nonsense |
| 7 | NDCs and Sri Lanka's NDC 3.0, explained properly |
| 8 | How you choose which projects to back |
| 9 | Why a pipeline is not the bank's own inventory |
| 10 | The seven tabs — what each one is for |
| 11 | How we know any of it is right |

Parts 4 to 9 are the domain. Part 10 is the software. **If you only want to
know what the tabs do, read Part 10** — but it will make far more sense after
Parts 5 and 6.

---

# Part 1 — The world this lives in

## 1.1 What the Green Climate Fund is

The **Green Climate Fund (GCF)** is the largest climate fund in the world. It
was set up under the UN climate convention to move money from wealthy countries
to developing ones, for two purposes:

- **Mitigation** — reducing greenhouse gas emissions. Solar instead of coal.
- **Adaptation** — coping with climate change that is already happening.
  Flood defences, drought-resistant agriculture, coastal protection.

GCF aims for a roughly even split between the two. That balance matters later,
and it is the reason for one of the strictest rules in our system.

## 1.2 You cannot apply to GCF directly

This is the first thing that surprises people. A company with a good solar
project cannot email GCF. Money flows only through an **Accredited Entity (AE)**
— an institution GCF has vetted and approved to handle its funds.

There are two kinds:

- **International Accredited Entities** — the World Bank, UNDP, large
  international banks.
- **Direct Access Entities (DAEs)** — institutions *in* the developing country
  itself. GCF prefers these, because the point is to build local capability
  rather than route everything through foreign institutions.

**DFCC Bank PLC is the only accredited DAE in Sri Lanka.** That is the
commercial fact this entire project rests on.

## 1.3 Accreditation is narrow, not general

Being accredited does not mean "DFCC can do anything with GCF money". GCF
accredits an institution for **specific things**, and DFCC's scope is:

| Dimension | DFCC's accreditation |
|---|---|
| Board decision | **B.36/10** |
| Project size | **Medium** — up to USD 250 million |
| Environmental & social risk | **Category B / I-2** |
| Modalities | Basic · project management · on-lending and blending |
| **Grant modality** | **Not held** |

Three of these need explaining.

**Project size is a ceiling, not a band.** GCF's size categories nest inside
each other:

```
micro   ≤ USD  10 million
small   ≤ USD  50 million
medium  ≤ USD 250 million     ← DFCC
large   >  USD 250 million
```

A medium-accredited entity may carry micro, small *and* medium projects. It
cannot carry a large one. (We got this wrong at first. See Part 11.)

**Environmental and social category** describes how much harm a project might
do to people or nature:

- **Category A** — potentially severe, irreversible, or unprecedented impacts.
  A large dam that displaces villages.
- **Category B** — limited impacts, mostly reversible, manageable with standard
  measures. Most solar farms and building retrofits.
- **Category C** — minimal or no impacts.
- **I-1, I-2, I-3** — the same scale for *financial intermediaries* (banks
  lending onward), depending on what their sub-projects look like.

DFCC is accredited to **B/I-2**. A category A project is **outside DFCC's
accreditation entirely.** DFCC cannot be the accredited entity for it. Not
"it's risky" — it is simply not something DFCC may do.

**Modalities** are the financial instruments an entity may deliver. DFCC holds
on-lending and blending — it can take GCF money and lend it onward, and it can
mix concessional money with commercial money. **DFCC does not hold the grant
modality**, which means it cannot deliver a design that depends on giving money
away rather than lending it.

That single unticked box turns out to be the most interesting finding in the
whole project. Hold on to it; we return to it in Part 8.

## 1.4 What DFCC asked for

DFCC published a Terms of Reference (dated 21 November 2025) for delivery
partners. Two lots concern us.

**Lot 1, Milestone 4 — Sustainability Reporting.** The stated gap, in DFCC's
own words:

> *"Lack of proper systems and procedures to capture data for sustainable
> reporting."*

Read that carefully. It does not say "we need a better report". It says the
**data capture** is missing. You cannot report what you never recorded.

**Lot 2 — Pipeline development.** Screen candidate projects, evaluate five to
seven innovative financial instruments, produce at least two high-potential
concepts, and draft **up to two Concept Notes** — showing viability *with and
without* concessional support.

---

# Part 2 — The gap, stated precisely

Imagine a loan officer at DFCC in 2027, asked: *"What were the emissions
outcomes of the projects we put to GCF last year?"*

Today the answer lives in:

- someone's spreadsheet, with formulas nobody can now explain
- a consultant's report from eighteen months ago
- three email threads
- one person's memory

Every individual number might be right. But nobody can say **where any number
came from**, and that is what a regulator, an auditor or GCF actually asks.

So the gap is not "we need a calculator". The gap is:

> **There is no place where a figure is recorded together with the evidence
> behind it, such that anyone can later follow the figure back to its source.**

Everything in Parts 3 to 9 is a consequence of taking that seriously.

---

# Part 3 — The principle everything follows from

Here is the single idea. If you remember nothing else, remember this.

> **A regulatory document contains exactly three kinds of statement:**
>
> **MEASURED** — computed from data the system holds, and traceable to it.
>
> **DECLARED** — a fact only the reporting organisation can know. What its
> board approved. Who sits on its risk committee. What it has committed to.
> Software cannot compute these and must not invent them.
>
> **ABSENT** — required by the standard, and not available. **Saying so is
> itself a disclosure.** A plausible-looking number in its place is not.

## 3.1 Why this is not obvious

Every instinct in software design pushes the other way. A blank field looks
broken. A dashboard with gaps looks unfinished. The natural move is to fill it
with something reasonable.

In climate reporting, that instinct is dangerous. Here is what happened in an
earlier version of our own product:

- The scope 1 / 2 / 3 emissions split was the financed-emissions total
  multiplied by **0.08 / 0.14 / 0.78** — three constants somebody picked — and
  printed under a cited clause of GRI 305 and IFRS S2.
- The governance section described a board meeting quarterly, a three-person
  ESG team reporting to the Chief Risk Officer, a $340M pipeline and 12% of the
  book in flood zones. All of it was typed into the source code.
- The compliance section asserted `'Compliant'` **to the regulator that decides
  compliance.**
- A compliance checklist marked every item as met — including the scope
  breakdown that was only "present" because it had been invented.

None of this was dishonest in intent. Somebody needed the page to look
finished. But every one of those statements would have been a serious problem
in front of an assurance provider, and **none of them announced itself.** They
looked exactly like real numbers.

That is the failure mode. Not missing data — *confident wrong data.*

## 3.2 What the principle costs

Applying it makes the product look less impressive. Our disclosure report
answers "no" to seven of its ten checklist items when nothing has been recorded.
A competitor's screenshot will show ten green ticks.

We think ours is the one you can defend. That is the whole product argument.

---

# Part 4 — What a carbon number actually is

## 4.1 The unit

Everything is measured in **tCO₂e** — tonnes of carbon dioxide equivalent.

"Equivalent" because carbon dioxide is not the only greenhouse gas. Methane
traps roughly 28 times more heat than CO₂ over a century; some refrigerant gases
trap thousands of times more. So each gas is converted into "the amount of CO₂
that would do the same warming" and everything is added in one unit.

**kgCO₂e** is the same thing in kilograms. 1,000 kg = 1 tonne.

## 4.2 The basic equation

Almost every carbon figure in existence is:

```
emissions  =  activity  ×  emission factor
```

- **Activity** — how much of something. 500 tonnes of cement. 38,750 MWh of
  electricity. 120 km of truck haulage.
- **Emission factor** — how much CO₂e per unit of that thing. 0.9 tCO₂e per
  tonne of cement. 0.53 tCO₂e per MWh of Sri Lankan grid electricity.

Multiply, and you have emissions.

**Worked example.** Our Jaffna solar project generates 38,750 MWh a year. Sri
Lanka's grid emits about 0.53 tCO₂e per MWh. So the electricity it displaces
would have caused:

```
38,750 MWh  ×  0.53 tCO₂e/MWh  =  20,537.5 tCO₂e per year
```

The project record says 20,500 — a 0.18% difference from rounding. Our engine
recomputes this and reports that the two agree. If someone had typed the grid
factor as 0.95, the engine would report a 79% divergence and the error would be
caught before it reached a submission.

## 4.3 Where carbon numbers go wrong

Three ways, in rough order of frequency.

**Wrong emission factor.** The single most common error. Grid factors differ by
country and by year. Cement factors differ by type. Someone copies a European
factor into a Sri Lankan calculation, and every number downstream is wrong by
40%. Nothing announces it — the total still looks plausible.

**A benchmark quietly becoming a fact.** You cannot find the real number, so you
use a published sector average as a placeholder, meaning to replace it. Three
months later it is in a submission and nobody remembers it was a placeholder.

**Adding things that should not be added.** Two figures that are both correct,
summed into a third that means nothing. This is the subtle one, and Part 6 is
about it.

## 4.4 Our answer: every figure carries its evidence tier

In our system you cannot record a bare number. Every figure is:

```json
{ "value": 20500, "tier": "modelled" }
```

The schema **refuses** a figure with no tier. Four tiers:

| Tier | Meaning |
|---|---|
| **measured** | Metered, surveyed or audited. Traceable to a record. |
| **modelled** | Computed from project parameters by a named method. |
| **benchmark** | A published sector or national default standing in for a real value. |
| **declared** | Stated by the sponsor; not independently verified here. |

`measured` is strongest, `declared` weakest.

This directly kills failure mode two. A benchmark value carries the word
"benchmark" everywhere it goes — onto the screen, into the Concept Note package,
into the disclosure. It cannot quietly become a measured fact, because the label
travels with the number.

**One important warning.** These four tiers are *not* PCAF's 1–5 data quality
scale, which appears elsewhere in this product for insurance work. We
deliberately used words rather than numbers here, precisely so nobody quotes a
GCF appraisal tier as if it were a PCAF score. Two different scales for two
different purposes; mixing them would be a real error.

---

# Part 5 — Baselines: the idea that makes a tCO₂e figure mean anything

This part is the heart of the tutorial. If Part 4 was arithmetic, this is
judgement.

## 5.1 The problem

Someone says: *"This solar project saves 20,500 tonnes of CO₂ a year."*

Compared to **what?**

The project does not remove 20,500 tonnes from the atmosphere. It generates
electricity, and generating electricity with solar panels produces almost no
emissions. The "saving" only exists relative to a story about what would have
happened otherwise.

That story is called the **counterfactual**, and the emissions it would have
caused are the **baseline**.

> **A tCO₂e figure with no baseline is not a small number. It is not a number
> at all.**

## 5.2 Our counterfactual, stated

For the Jaffna project the record says:

> **Baseline:** Grid electricity displaced at the Sri Lankan national average
> emission factor.
>
> **Counterfactual:** Without the project, the same demand is met from the
> national grid.

Now the figure means something. It says: *if this project does not happen, that
electricity comes from the grid at 0.53 tCO₂e/MWh, and those emissions occur.*

You can argue with it — perhaps the grid gets cleaner, perhaps demand would not
have existed. That is exactly the point. **A stated counterfactual can be
argued with. An unstated one cannot.**

## 5.3 Three types, and why the difference is not pedantry

Our schema forces every mitigation figure to declare which of three it is.

**REDUCED** — emissions that were happening, and now happen less.

> Colombo district cooling. The buildings were metered for twelve months before
> the retrofit. They used a measured amount of electricity; afterwards they use
> less. Real emissions genuinely went down.

**AVOIDED** — emissions that would have happened, and now will not.

> Jaffna solar. Nobody's emissions decreased. New clean generation means future
> grid generation does not occur. The atmosphere has less than it would have,
> but no existing emission stopped.

**REMOVAL** — carbon taken *out* of the atmosphere and stored.

> Mangrove restoration. Growing trees absorb CO₂ and lock it into wood, roots
> and sediment. This is the only one of the three that physically reduces the
> stock of carbon in the air.

**Why it matters.** Consider two claims:

- "We reduced emissions by 100,000 tonnes."
- "We removed 100,000 tonnes."

The second is a much stronger claim. Removal is scarce, expensive and
physically different. A country's climate commitment usually treats reduction
and removal as **separate targets** — Sri Lanka's does, as we will see in Part
7 — and adding them produces a figure the country never committed to.

Which type applies is decided **by the counterfactual, not by the engine.** The
software cannot work out whether trees are being planted or diesel displaced. A
person decides, records it, and the type travels with the figure forever.

## 5.4 Where the software helps

The engine cannot judge the counterfactual, but it can check arithmetic. Where
an independent path exists, it recomputes:

```
annual   = generation × grid emission factor
lifetime = annual × asset life
```

and reports whether the recorded figure agrees.

Where no path exists — Colombo's figure comes from metered building data we do
not hold — it reports **"unverifiable, and here is why"**, rather than passing
silently.

> **A check that passes because it had nothing to check is worse than no check.**
> It creates confidence with no basis.

One more case worth seeing. The Dry Zone irrigation project records 3,200
tCO₂e/yr and 64,000 lifetime. The engine cannot verify that, because no asset
life is recorded. Rather than assuming twenty years to make it work, it reports:

> *Implied life: 20 years. This is a consequence of the two figures, not a
> declared input, and should be recorded before this reaches a submission.*

That is the discipline in miniature: it tells you what it would have had to
assume, instead of assuming it.

---

# Part 6 — Three carbon boundaries, and why you must never add them

This is the part that most people find genuinely surprising.

## 6.1 One project, three completely different carbon questions

Take the Colombo district cooling project. All three of these are true at once:

**Question 1 — What does the project achieve?**
It cuts building energy use. **26,400 tCO₂e per year avoided.**
This is *mitigation*, measured against the counterfactual.

**Question 2 — What did building it cost?**
Manufacturing the chillers, pipework and pumps, transporting them, installing
them, all produced emissions. **44,900 tCO₂e, once.**
This is *embodied carbon* — the A1–A5 lifecycle modules.

**Question 3 — What does the bank carry?**
DFCC lends money. Under carbon accounting rules a lender carries a *share* of
its borrower's emissions, proportional to its share of the financing.
This is *financed emissions*.

Three real numbers. Three different questions.

## 6.2 The tempting mistake

The obvious move is:

```
26,400 saved per year  −  44,900 to build  =  "net benefit"
```

**Do not do this.** The resulting figure is defined by no standard, comparable
to nothing, and reportable to nobody. You have subtracted a *one-time
construction* cost from an *annual operating* benefit — different units on a
time axis — and you have mixed two accounting boundaries that every standard
keeps apart.

The honest way to relate them is a **payback period**:

```
44,900 ÷ 26,400  ≈  1.7 years
```

*After about twenty months of operation, the project has saved more carbon than
building it cost.* That is a real, defensible statement. It relates the two
figures without merging them.

## 6.3 How the software enforces it

Not by asking developers to be careful. Structurally:

- Mitigation, embodied and financed live in **separate keys** all the way up.
- **No function returns a figure combining two boundaries.**
- Financed emissions are explicitly **named as living elsewhere** — the response
  says "these are the bank's own attributed exposure and they are in the capital
  book" — rather than being quietly absent.
- A test sweeps the entire roll-up looking for any number equal to a forbidden
  combination, and fails the build if one appears.

That last point is the pattern to notice. **The rule is not documented and
hoped for; it is checked.**

## 6.4 Why "named as absent" matters

If financed emissions were simply missing, a reader would not know whether they
were zero, irrelevant, or forgotten. By stating *"this is a different question,
computed on a different basis, and it lives over there"*, the response teaches
the reader something instead of leaving a hole.

This is Part 3's principle applied to structure rather than to a number.

---

# Part 7 — NDCs and Sri Lanka's NDC 3.0

## 7.1 What an NDC is

Under the **Paris Agreement (2015)**, every country states what it will do about
climate change. That statement is its **Nationally Determined Contribution
(NDC)**.

- **Nationally determined** — the country decides for itself. There is no global
  authority assigning targets.
- **Contribution** — its share of the global effort.

Countries update their NDC every few years, and each one is meant to be more
ambitious than the last. Sri Lanka is now on its third.

## 7.2 Sri Lanka's NDC 3.0 — issued September 2025

Two commitments, over the ten-year period **2026–2035**:

| Commitment | Unconditional | Conditional | Total |
|---|---|---|---|
| **Reduction** of GHG emissions against business-as-usual | 8.11% | 11.98% | **20.09%** |
| **Increase in net carbon removal** | 0.96% | 3.53% | **4.49%** |

Two more terms:

- **Unconditional** — Sri Lanka will do this with its own resources.
- **Conditional** — Sri Lanka will do this *if* international finance and
  technology are provided. This is precisely where GCF money fits.

## 7.3 The rule: these two are never added

20.09% and 4.49% are two separate commitments. Adding them gives a number Sri
Lanka has never committed to.

It is an easy mistake — both are percentages, both are climate targets, both are
in the same document. But one is about *emitting less* and the other about
*absorbing more*. They are different physical things with different targets.

Our system holds them in **two separate ledgers**, from the project record all
the way to the output, and **there is no field anywhere holding their sum.**
A test sweeps the entire source tree for the combined figure and fails the build
if it appears.

**This rule was broken once, during the build, in exactly the place you would
expect.** The main ledgers were correct. But a small footnote line summarising
the adaptation co-benefit added the irrigation project's *avoided* diesel to the
mangrove project's *removal* — one number, two commitment types. It was caught
and split.

> A discipline holds in the headline where everyone is watching. It dies in the
> footnote.

## 7.4 The percentages hide something important

The targets are percentages against **business as usual (BAU)** — a projection
of what Sri Lanka's emissions would be with no additional climate action.

So a 20.09% reduction means: 20.09% below that projected line.

Now the natural question: *"Our pipeline delivers 658,000 tonnes. What
percentage of the national target is that?"*

**We cannot compute it**, and this is worth understanding.

To turn tonnes into a percentage you need the denominator — the absolute tonnage
of the BAU scenario over 2026–2035. That figure is published by Sri Lanka's
Ministry of Environment. **We do not hold it.**

So the system reports:

> *Share of the national target: not stated. The NDC targets are percentages
> against a business-as-usual scenario. Expressing a project as a share of them
> requires the absolute BAU tonnage for 2026–2035, which is published by the
> Ministry of Environment and is not held by this system.*

And it names what would be needed to answer. If someone supplies the BAU
tonnage, the system computes the share immediately — and carries it at evidence
tier **declared**, because the answer is only as good as the number handed to it.

This is Part 3 again. The tempting move is to find a plausible BAU figure
somewhere and use it. The honest move is to say what is missing.

## 7.5 The window: only overlapping years count

The commitment runs **2026 to 2035** — ten years.

The Jaffna solar plant has a **twenty-five year** life. Its total lifetime
mitigation is large. But how much counts toward a 2026–2035 commitment?

**Only the years inside the window.**

```
Annual mitigation                   12,345 tCO₂e   (journey-test example)
Asset life                          25 years
Years falling inside 2026–2035      10
Contribution to the NDC period      123,450 tCO₂e
```

Counting the whole twenty-five years would claim **308,625 tonnes** — two and a
half times the honest figure — against a target that only runs for ten.

The system applies the window automatically and prints the assumption:

> *Assumed operating from 2026 for its declared 25-year life, of which 10 years
> fall inside 2026–2035. Only years inside the window count against a 2026–2035
> commitment.*

Note what that sentence does. It states the assumption rather than hiding it, so
a reader who knows the plant will not commission until 2029 can correct it.

## 7.6 One more honesty rule

NDC 3.0 **states no net-zero year.** The previous NDC (2021) said net zero by
2050. The new one does not carry that forward.

So our system asserts no net-zero commitment. An absent commitment is reported
absent, not inherited from a superseded document.

**Why this needed a rule.** The superseded 2021 targets (4.5% / 14.5%, net zero
2050) were live in **seven source files and three test files** — including the
Green Loan Certificate, which printed them onto a document carrying a SHA-256
audit hash. Nothing announced the drift, because the tests asserted the same
superseded figures the code produced. Both sides of the check were wrong
together.

That is the most instructive bug in this project. **A test only protects you if
it knows something the code does not.**

---

# Part 8 — Choosing projects

Five candidates. Up to two Concept Notes. How do you choose, and how do you
defend the choice?

## 8.1 First: a gate, not a score

Some things are not "worse". They are **not allowed**.

A category A project is outside DFCC's accreditation. If we scored it and it
scored well, it would still be undeliverable. So the gate runs first and sorts
every candidate into three sets:

| Result | Meaning |
|---|---|
| **Eligible** | Passes. Rank it. |
| **Flagged** | Eligible, but something must be resolved or verified. |
| **Excluded** | DFCC cannot carry this as the accredited entity. |

**Why not just rank it low?** Because a score can be outweighed. If a category A
project scored badly on safeguards but brilliantly on impact, a weighted total
might still put it top — and it would be undeliverable. Worse, systematically
down-ranking anything with social impact drifts a pipeline toward projects that
touch nobody, which is the opposite of what GCF exists to fund.

**Why "flagged" exists.** A finding is not always a verdict. Our mangrove
project appears to need a grant element, and DFCC has no grant modality. We do
*not* strike it out on our own reading of a checkbox. We flag it:

> *This may not be deliverable by DFCC as the accredited entity. Flagged rather
> than excluded: misreading an accreditation scope is a serious error and this
> must be verified with DFCC or the NDA.*

## 8.2 Second: two ranked lists, never one

This is the rule that follows from Part 1's "GCF aims for a balanced portfolio".

To rank projects you need a sort key. The obvious one is **tCO₂e per dollar**.

Apply it to all five and look at what happens:

| Project | Stream | tCO₂e/yr per $M of GCF ask |
|---|---|---|
| Colombo cooling | mitigation | 1,760 |
| Jaffna solar | mitigation | 1,708 |
| Western e-bus | mitigation | 1,454 |
| Mangrove restoration | adaptation | 414 |
| Dry Zone irrigation | adaptation | 178 |

Both adaptation projects sink to the bottom. **Every time. Guaranteed.**

Not because they are bad projects. Because adaptation is not *for* carbon.
Irrigation rehabilitation exists so farmers survive drought. Mangrove
restoration exists so a coast survives storm surge. Judging them on carbon per
dollar is like ranking hospitals by fuel economy.

So the system produces **two lists that are never merged**, and adaptation is
ranked on a completely different metric:

| Stream | Impact metric |
|---|---|
| Mitigation | annual tCO₂e per USD million of GCF ask |
| Adaptation | **direct beneficiaries** per USD million of GCF ask |

On the second metric the Dry Zone project ranks **first in its stream** — 3,444
direct beneficiaries per million dollars, ahead of the mangrove project's 2,036.

The same project, honestly assessed, is last on the carbon axis and first among
adaptation projects on the beneficiary axis. That is not a contradiction. It is
what happens when you ask the right question.

*(A caution, since this tutorial preaches against overclaiming: the e-bus
project reaches 11,154 people per million dollars — more than either adaptation
project. That does not make it "better adaptation". It is a mitigation project
serving a dense city, and beneficiary counts across streams measure different
things. This is exactly why the two lists are never merged: no single number
ranks a bus fleet against a mangrove forest.)*

## 8.3 The ranking is partial, and says so

GCF assesses proposals against **six investment criteria**:

| # | Criterion | Can we compute it? |
|---|---|---|
| 1 | Impact potential | **Yes** — tonnes or beneficiaries per dollar |
| 2 | Paradigm-shift potential | **No** |
| 3 | Sustainable development potential | **No** |
| 4 | Needs of the recipient | **No** |
| 5 | Country ownership | **Partly** — NDC sector alignment |
| 6 | Efficiency and effectiveness | **Yes** — mobilisation ratio |

Three of the six cannot be computed from a project record. "Paradigm shift" asks
whether this project changes how a whole market behaves — a judgement made by
people who know the sector.

The system does not score them. It **names them, with the reason each cannot be
scored**, so nobody mistakes a partial ranking for a GCF assessment. The output
says plainly:

> *This ranking is an input to a decision, not the decision.*

**And one more detail worth understanding.** If a project is missing a component
— say nobody recorded its GCF ask — that component is **dropped and the
remaining weights renormalised.** It is not scored zero.

Scoring absence as zero would rank the project down for a field nobody filled
in. That is a fact about your data entry, not about the project.

## 8.4 The weighting belongs to the reader

There is no "correct" weighting. A credit committee that cares most about
readiness should weight readiness. So the weights are adjustable, and the
weighting used **travels with the answer** — so a screenshot carries the
assumptions that produced it.

## 8.5 The answer, and the disagreement

Run it on the default weighting and the system recommends **GCF-P3 (Colombo
cooling)** and **GCF-P2 (Dry Zone irrigation)** — one from each stream.

But the pipeline record says somebody chose **GCF-P1 and GCF-P3**.

**They disagree.** And the system says so, loudly:

> *The recorded selection and the computed ranking differ. Neither is wrong on
> its face: the ranking uses only the three GCF criteria that can be computed
> from the record, and the three it cannot score — paradigm shift, needs of the
> recipient, sustainable development — are where a sector judgement legitimately
> overrides a score. The divergence is reported so it is argued rather than
> absorbed.*

This is, I think, the most valuable single output of the whole system. It does
not claim the human was wrong. It identifies **exactly where the disagreement
lives** — in the three criteria the machine cannot see — and puts it on the
table to be discussed.

A system that silently agreed with whatever was recorded would be useless. A
system that overrode the human would be arrogant. This one says: *here is the
gap, and here is what is in it.*

## 8.6 Instruments: matching structures to barriers

A project needs GCF money because something specific blocks commercial finance.
Name the blocker, and the right instrument follows.

We use one shared vocabulary of **barriers**:

| Barrier | Meaning |
|---|---|
| `tenor` | Local banks lend for 7 years; the asset lasts 25 |
| `offtake_risk` | The revenue counterparty may not pay |
| `currency` | Costs in USD, revenue in LKR, no affordable hedge |
| `perceived_technology_risk` | Proven abroad, no local operating record |
| `upfront_capex` | Capital needed now, savings arrive over years |
| `no_revenue_stream` | The outcome is a public good with no cash flow |
| `fragmented_borrowers` | Many small borrowers, transaction cost too high |

And **seven financial structures**, each declaring which barriers it addresses:

| Structure | Addresses | Needs grant modality? |
|---|---|---|
| Concessional on-lent credit line | tenor, upfront capex | No |
| Partial credit guarantee / first-loss | offtake risk, technology risk, fragmented borrowers | No |
| Blended sustainability-linked loan | upfront capex, technology risk | No |
| Subordinated / mezzanine tranche | offtake risk, technology risk, tenor | No |
| **Results-based payment** | **no revenue stream**, technology risk | **YES** |
| Green bond warehouse and refinance | tenor, fragmented borrowers | No |
| Local-currency / FX facility | currency, tenor | No |

**Coverage is always reported with what it leaves standing.** A structure
covering two of three barriers is 67% — but the uncovered barrier is what
actually kills the deal, so it is named beside the percentage rather than
buried in it.

## 8.7 The finding: a mandate gap

Look at the mangrove project.

- Its barriers: `no_revenue_stream`, `fragmented_borrowers`.
- The best deliverable structure — a partial credit guarantee — covers
  `fragmented_borrowers`. Coverage 50%.
- **`no_revenue_stream` is left standing.**
- The only structure addressing it is **results-based payment**.
- Results-based payment **requires the grant modality DFCC does not hold.**

The same is true of the Dry Zone irrigation project.

So the system reports:

> **Mandate gap.** *Outcome is not monetised — GCF-P2, GCF-P4. No structure DFCC
> can currently deliver addresses these barriers. Where they recur across the
> pipeline this is a mandate question — whether to seek the grant modality, or
> to partner with an accredited entity that holds it — rather than a deal
> question.*

Read that again, because it is the whole argument for building this.

**Both of DFCC's adaptation projects rest on outcomes nobody pays for, and DFCC
structurally cannot deliver the one instrument that reaches them.** That is not
a scoring problem. It is a strategic question about DFCC's accreditation scope
— and it emerged from the data rather than being asserted by anyone.

Nobody typed that conclusion in. It fell out of one vocabulary of barriers
shared between projects and instruments, plus one checkbox on an accreditation.

## 8.8 Minimum concessionality: the appraisal can say no

GCF applies **minimum concessionality**: a project that is already viable on
commercial terms should not receive concessional money, and one that needs less
should not be given more. Otherwise you are subsidising something that would
have happened anyway.

So every project record must state whether it is viable **without** GCF support,
and why. If it says viable, the system reports:

> *Under GCF's minimum concessionality principle this should not receive
> concessional finance: doing so would displace commercial capital rather than
> mobilise it.*

An unassessed project cannot be put forward at all.

> **An appraisal that can only say yes is not an appraisal. It is a sales tool.**

---

# Part 9 — Why a pipeline is not the bank's own inventory

This is a short part but a legally important one.

## 9.1 Scope 1, 2 and 3

Corporate carbon accounting divides an organisation's emissions into three:

- **Scope 1** — direct. Fuel burned in your own boilers and vehicles.
- **Scope 2** — indirect from energy you buy. The emissions from generating
  your electricity.
- **Scope 3** — everything else in your value chain. Suppliers, business
  travel, and — for a bank — **the emissions of everything it finances**
  (Category 15).

For a bank, scope 3 Category 15 dwarfs everything else. Its own offices are a
rounding error beside its loan book.

## 9.2 The mistake to avoid

Our pipeline shows 65,800 tCO₂e/yr of mitigation. Sitting in a disclosure with
an empty scope 3 box next to it, the temptation is obvious.

**It does not go there. It is not the bank's inventory.**

- **SLFRS S2 §29(a)** asks for the entity's *own* absolute gross scope 1, 2 and
  3 emissions.
- **GRI 305-5** covers reductions in the *organisation's own* emissions from its
  own initiatives.

Project mitigation is neither. It is an outcome achieved by third-party projects
the bank helped finance. Putting it on an inventory line would **report an
emission the entity does not have, in place of one it does.**

## 9.3 What we do instead

The inventory lines are reported **absent, with the clause requiring them and
where the figure actually comes from**:

> *Absolute gross scope 3 emissions, including Category 15 — not measured.
> Financed emissions are scope 3 Category 15 in full and are reported from the
> capital book on PCAF Part A attribution, not from this pipeline.*
> `SLFRS S2 §29(a)(i)(3)`

And the pipeline is disclosed where it genuinely belongs:

| Line | Standard reference | Value |
|---|---|---|
| Assets aligned with climate opportunities | SLFRS S2 §29(d) | USD 196.5M |
| Capital deployed toward climate opportunities | SLFRS S2 §29(e) | USD 196.5M |
| Emissions avoided/reduced by financed projects | *stated separately* | 65,800 tCO₂e/yr |

That third line is **never netted against anything**. Both GRI and PCAF require
avoided emissions to be stated apart from the inventory and never deducted from
it.

## 9.4 The checklist that can fail

The report answers a ten-item checklist **from its own content**, so it cannot
claim to contain something it does not.

With nothing recorded, seven of ten items answer "no". Once the bank records its
governance, strategy and targets, six close.

**The inventory item never closes** — and that is correct. This report is *one
input to* an SLFRS S2 disclosure, not the disclosure itself. A checklist that
could reach 100% would be claiming otherwise. The report says so on its own
face:

> *It is NOT a complete SLFRS S2 disclosure: the entity's own scope 1, 2 and 3
> inventory is not held here and is reported absent below, with where it comes
> from. This report is one input to the entity's disclosure, not the disclosure
> itself.*

---

# Part 10 — The seven tabs

Now the software. Each tab answers one question, and they are ordered as a
banker would actually work.

**Everything reads from one set of project records.** Nothing is re-keyed
between tabs, so no two screens can disagree.

### Tab 1 — Pipeline · *What have we got?*

The candidate pool. Every project with its cost, GCF ask, stage, screening
status and **weakest evidence tier** — so you can see at a glance which project
rests on the shakiest data.

Below it, "To resolve": every flag, in words, with what to do about it.

*Read this first. It is the inventory of what you are working with.*

### Tab 2 — Emissions · *What will these projects achieve?*

Part 6 made visible. Three boundaries as three separate cards — mitigation,
embodied, financed-and-named-as-elsewhere — with the adaptation co-benefit on
its own line, never in the headline.

Then NDC contribution as **two ledgers** (Part 7), and an arithmetic check table
showing which figures were recomputed, which agreed, and which could not be
verified and why.

### Tab 3 — The decision · *Which two, and why?*

Part 8. The weighting controls at the top — yours to change. Below them the
recommendation with its basis, the disagreement with the recorded selection in a
warning box, the two ranked lists side by side, and the three criteria that
could not be weighed.

*This is where the system actually answers Lot 2.*

### Tab 4 — Instruments · *How do we structure them?*

The mandate gap first, because it is the finding that matters. Then a table:
each project's barriers, the recommended structure, its coverage, and **what it
leaves standing.**

Below, minimum concessionality per project — including any project that does not
need GCF at all.

### Tab 5 — Reporting · *What do we tell the regulator?*

Part 9. The three lines the pipeline legitimately fills, the warning that
project mitigation is not an inventory figure, the checklist with its honest
"no"s, and a gaps table naming every missing item with the clause requiring it.

On the right, a form to record the entity-level facts only the bank can state.
Fill it in and watch the gaps close — except the inventory ones, which cannot.

### Tab 6 — Concept Note · *What do we still need?*

Pick a project and get its inputs in GCF's section A–H order, each marked:

- **HELD** — we have it, traceable to a record
- **PARTIAL** — some of it, and what is missing
- **EXTERNAL** — cannot come from this system at all

For the mangrove project: **63 inputs — 43 held, 1 partial, 19 external.**

The nineteen are the point. The NDA no-objection letter. The gender assessment.
The ESIA. Signed co-financing commitments. The FPIC process record. DFCC's own
open accreditation conditions. Each with what is needed and from whom.

**That list is the worklist between a pipeline entry and a submission** — and
until somebody writes it down, it lives in one person's head. Downloadable as
PDF or Word.

The one *partial* is instructive: beneficiary disaggregation by sex is recorded
as "53% women (benchmark)". But that is a district population share, not a
project beneficiary count. GCF requires it disaggregated at source. Marking it
"held" would put a benchmark into a GCF core indicator, so it is marked partial
with the reason.

### Tab 7 — Intake · *Recording a new project*

The form. Note that **every numeric field has an evidence-tier selector beside
it** — you cannot enter a number without saying where it came from, because the
schema refuses it.

At the bottom, what this deployment can actually persist. A deployment that
cannot store data **refuses writes with an error** rather than accepting them
and losing them.

---

# Part 11 — How we know any of this is right

## 11.1 Tests that check rules, not just outputs

**1,722 automated tests across 80 suites.** Most check ordinary behaviour. The
interesting ones check *rules*:

- Sweep the whole roll-up for any number equal to mitigation-minus-embodied.
- Sweep the entire source tree for the combined NDC percentage.
- Assert the adaptation impact metric mentions beneficiaries and never tonnes.
- Assert that an adaptation project is excluded from the carbon headline **even
  if somebody forgets to tick the co-benefit box** — the stream is the fact, the
  flag is only a claim.

## 11.2 A conformance matrix that cannot rot

**32 rules**, each naming the ToR clause it satisfies, the file enforcing it and
the test proving it. The build fails if a cited file *or a cited test name*
stops resolving — including a test renamed inside a file that still exists.

It earned itself immediately: it caught a citation in its own introducing commit
that differed from the real test name by a curly apostrophe.

## 11.3 An end-to-end journey test

Every other suite tests one module. One walks the whole path — record, screen,
rank, structure, roll up, contribute to the NDC, disclose, package, export,
import — following a distinctive number (12,345) through every module that reads
it.

> **Unit tests cannot catch a disagreement between modules**, and every defect in
> this codebase that reached a screen did so with its own unit test passing.

## 11.4 Four bugs, and what each taught

**The size gate.** We flagged four of five projects for being *below* DFCC's
$50–250M band. GCF sizes are nested ceilings; a medium entity may carry small
projects. *A flag that fires on a non-issue is a flag readers learn to skip.*

**The footnote.** The reduction/removal split was correct in both headline
ledgers and broken in the co-benefit footnote. *A discipline dies where nobody
is watching.*

**The invisible bar.** A score bar drawn on an inline `<span>` rendered as
nothing at all — `height` and `background` do not apply to an inline box. It
read as a score of zero rather than a missing element. *Found by looking at the
page, not by reading the code.*

**The overflowing select.** A dropdown sizes itself to its **widest option**, not
its container. One long project name pushed the whole page 78 pixels wide on a
phone.

The last two share a lesson: **the layout defects were found by driving the
product and none by reading it.** Reading tells you what you intended. Driving
tells you what happened.

## 11.5 What is still open

Honesty applies to ourselves too:

- `npm run lint` is broken repo-wide (ESLint 9 wants a new config format). CI
  reports success only because the job is `continue-on-error`.
- Two disagreeing Sri Lankan embodied-carbon threshold sets exist in the
  codebase (520/780 vs 600/900 kgCO₂e/m²). Unreconciled.
- `services/pcaf.js` still labels its output "PCAF v3" and should stop claiming
  to be PCAF until Part A is properly built.
- **Our own two files word GCF's Mitigation Core Indicator 1 slightly
  differently** — one says "reduced or avoided", the other "reduced, avoided or
  removed". The exact wording must be checked against the published IRMF before
  either reaches a submission.
- The illustrative pipeline is **not DFCC's book.** Realistic in shape,
  internally consistent, entirely invented.

---

# The whole thing in ten sentences

1. GCF money reaches Sri Lanka only through DFCC, whose accreditation is narrow
   and specific.
2. DFCC's stated problem is not calculation but **data capture** — no place
   where a figure lives with its evidence.
3. So every figure carries an **evidence tier**, and a bare number is refused at
   the door.
4. A tCO₂e figure means nothing without a **baseline and counterfactual**, and
   reduced, avoided and removed are three different claims.
5. A project has **three carbon boundaries** — what it achieves, what building it
   cost, what the bank carries — and adding any two produces a figure defined by
   no standard.
6. Sri Lanka's NDC has **two separate commitments** that are never summed, over
   a ten-year window that only counts overlapping years.
7. **Accreditation is a gate, not a score**, and adaptation is never ranked on
   carbon because any such ranking defunds it.
8. Half of GCF's investment criteria **cannot be computed**, so they are named
   unscored rather than invented — and the ranking says it is an input to a
   decision, not the decision.
9. **A pipeline is not the bank's inventory**, so inventory lines are reported
   absent with the clause requiring them.
10. Everything the system cannot know is **reported absent** — and the honest gap
    list is more useful to the person filling it in than any invented number
    would be.

---

## Glossary

**Accredited Entity (AE)** — an institution GCF has approved to handle its
funds. **DAE** is one based in the recipient country.

**Baseline** — the emissions that would have occurred without the project.

**BAU** — business as usual: projected emissions with no additional climate
action.

**BOQ** — bill of quantities: the priced schedule of materials and works on a
construction project.

**Concept Note** — the short proposal submitted to GCF before a full Funding
Proposal.

**Conditional / unconditional** — parts of an NDC that do, or do not, depend on
international support.

**Counterfactual** — the story of what happens if the project does not.

**Embodied carbon** — emissions from making, moving and installing an asset
(lifecycle modules A1–A5).

**Emission factor** — emissions per unit of activity. tCO₂e per MWh, per tonne,
per km.

**ESIA / ESMP** — Environmental and Social Impact Assessment / Management Plan.

**Financed emissions** — the share of a borrower's emissions a lender carries,
proportional to its share of the financing.

**FPIC** — Free, Prior and Informed Consent: the process by which indigenous
communities agree to a project affecting them. A process, not a document.

**GRI 305** — the Global Reporting Initiative's emissions disclosure standard.

**IRMF** — GCF's Integrated Results Management Framework: how it measures
results.

**Mitigation / adaptation** — reducing emissions / coping with climate change
already happening.

**NDA** — National Designated Authority: a country's official GCF counterpart.
Issues the no-objection letter.

**NDC** — Nationally Determined Contribution: a country's climate pledge under
the Paris Agreement.

**PCAF** — Partnership for Carbon Accounting Financials. Part A covers lending,
Part C covers insurance.

**Results area** — GCF's eight categories. Mitigation: EP energy, LT transport,
BA buildings/cities/industry, FL forests and land use. Adaptation: VC
livelihoods, HW health/food/water, IB infrastructure, EE ecosystems.

**Scope 1 / 2 / 3** — direct emissions / from purchased energy / everywhere else
in the value chain, including financed emissions at Category 15.

**SLFRS S1 / S2** — Sri Lanka's adoption of the ISSB sustainability standards,
effective 1 January 2025.

**tCO₂e** — tonnes of carbon dioxide equivalent. All greenhouse gases converted
to a common unit by warming effect.

**Tenor** — the length of a loan.

---

*Every figure in this tutorial was read from the running code at commit
`2d317f0`. Where something is unbuilt, uncertain or inconsistent, it says so.*
