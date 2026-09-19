# Demonstration runbook — the bank's own book

The walkthrough for showing a bank its financed-emissions book inside one
administrator account, in the order a **chief executive** reads it: the
position first, the SLFRS S2 file they will actually file second, and the
technical screens after. Every figure on these screens is one an engine
returned; nothing on a screen adds, divides or averages, so what is shown is
what the disclosure files.

The site is **https://carboniqfintech.netlify.app**. `GET /health` reports
the running commit, so *"the fix did not work"* and *"the fix has not been
deployed"* can be told apart in one request.

## Before the day

1. **Sign in** with your administrator account. If the account was created by
   the build (`FIRST_ADMIN_EMAIL` / `FIRST_ADMIN_PASSWORD`), delete
   `FIRST_ADMIN_PASSWORD` and `FIRST_ADMIN_RESET` from the Netlify environment
   once you are in: while `RESET` stands, every build sets the password back.
   Your password lives in the database, not in that variable, so deleting it
   does not affect your sign-in.
2. **Load the bank's book once.** Bank Overview opens on the starter's own
   card when the organisation holds no lending book: type the bank's legal
   name, press *Load starter book*, confirm the browser's question. One press
   records fifteen illustrative exposures across §5.1–§5.6 and two sovereign
   holdings for FY2025, each computed by its own engine on the way in; states
   the book total, the boundary, the base year, and an illustrative preparer
   and approver; and records the illustrative SLFRS S2 statements — all 27 of
   them — so the file reads whole from the first day. The year selector moves
   to 2025 and the sidebar group takes the bank's name. A second press is
   refused (`409 STARTER_NOT_EMPTY`); it never overwrites a book somebody has
   begun. If the organisation already holds a book, the overview opens on the
   year holding the most of it, never on an emptier later year.
3. **Replace what is illustrative with the bank's own words**, as far as the
   day needs. Financed Emissions → the entity form names who prepared and who
   approved; *Climate-related disclosure* holds the four pillars, each
   statement marked *illustrative* wherever it is printed until one word of
   it is the bank's. Edit at least the governance paragraph, so the pillar
   band on the overview shows one pillar the bank has stated beside three
   still illustrative. Items that stay on *Before filing* by design: *Approve
   N exposures* until every row is approved, the two exposures the starter
   leaves unclassified, and the sovereign holdings being in USD against an
   LKR book total — their outstanding is excluded from the coverage share
   rather than converted at a rate the system does not hold.
4. **Download the SLFRS S2 disclosure PDF once**, so the first render on the
   day is not the first render on the site.
5. **The walkthrough is a tab in the product.** *Walkthrough*, at the foot
   of the bank's group in the sidebar, reads the day's readiness off the
   reporting year — the book, the bank's name, who prepared and approved,
   the approvals, what the disclosure still lists, whether the document
   renders — with a button to the screen that answers each row. *Start the
   walkthrough* puts a strip under the page title on every screen with the
   step, what to do and, behind *Notes*, what to say; *Next* opens the next
   screen with the step already applied and the one control it asks for
   marked. It survives a reload; *End* takes it away.
6. **Or let the runbook drive itself.** `npm run rehearse` performs steps 2–4
   and the whole walkthrough below against the site, in a browser, and leaves
   a full-page screenshot of every step and a report beside them:

   ```bash
   BASE=https://carboniqfintech.netlify.app EMAIL=you@bank.lk PASSWORD=… \
   BANK="Legal Name PLC" npm run rehearse
   ```

   It writes what the runbook writes — the starter book, one governance
   statement replaced, the example loan recorded and approved, one edit, one
   reopen, one recorded property — so run it against the organisation you
   will demonstrate, once, before the day.

   Driving it against a **local** production-shaped instance rather than the
   site needs that instance's own origin on `ALLOWED_ORIGINS`. Without it the
   browser's sign-in is refused and the screen says *"CORS: Origin … not
   allowed"* — the server behaving correctly, and a message worth recognising
   because every step after it then fails on the sign-in screen. On Netlify
   the origin is the site's own and nothing has to be set.

## The walkthrough

Seven steps: the position and the file for the chief executive, then one
loan from the door to the file. The product's *Walkthrough* tab drives
exactly these; every step changes the screen, and the control it asks you
to press is marked.

### 1 · The position — the whole book on one screen

*Bank Overview.* The bank's name over the reporting year, set as the cover
of the file is. Six figures: financed scope 1 and 2 (the headline, named
with the boundaries it sums); scope 3 on its own line, never summed into
the headline; coverage of the stated book (Disclosure Checklist Part A,
p.124); economic intensity; what the disclosure still asks for; and how
many exposures the bank has approved. Beneath, the four SLFRS S2 pillars,
each with a bar of what the bank has stated, what is still illustrative and
what is not stated. Every bar on the screen answers a hover or a keyboard
focus with its readout, and every chart has a *Table* toggle beside it, so a
figure can be read without a pointer and without colour.

**Say:** *"Every number here is one the engine returned. The screen draws;
it does not compute."*

The sign-in screen also offers the sample book to any visitor by address.
That is the public preview; set `PREVIEW_ACCESS=off` on Netlify if the room
should not see it.

### 2 · The file — the SLFRS S2 disclosure, in one press

Press **SLFRS S2 disclosure — PDF**, the marked button. The document opens
on its cover: the reporting entity, who prepared and approved it, and a
reference derived from the content itself. It reads in the standard's own
order — governance, strategy, risk management, metrics and targets — with
financed emissions inside the fourth pillar as the scope 3 category 15
metric, and everything PCAF asks around that figure in the annexes.
*Behind the S2 file* has opened the index beneath the figures: every
paragraph of the standard and where in the document it is answered.

**Say:** *"That is the file. One document, one press. The same position
rendered twice carries the same reference, so a filed copy can be matched
to what was on the screen. A paragraph the bank has not answered is printed
as not stated with its clause; nothing is written on the bank's behalf."*

The same button offers Word, and *Register — CSV* is the exposure-level data
annex a verifier samples from.

### 3 · A loan comes in

*Lending Book*, at business loans. The record form has opened for one
borrower — Lanka Textiles (Pvt) Ltd — with every field already filled. The
client asked for 250 million over five years: the **facility** is recorded as
sanctioned, drawn on 15 March and repaid in equal quarterly instalments, and
*Outstanding at year-end* holds what is owed on 31 December — 212.5 million
after three instalments — because that, and not the amount asked for, is the
numerator the standard attributes on (Part A §5.2, p.56). The preview beneath
the form draws the sanctioned, drawn and outstanding amounts on one scale,
states that no undrawn commitment applies to a fully drawn facility, and shows
the life of the loan — the scheduled balance and the attribution falling to
nought at maturity — hatched, as a projection. Change any figure you like,
then press **Record**.

At origination, before a ledger balance exists, the form offers **Use the
scheduled balance**: the year-end figure the repayment schedule expects. An
exposure recorded on it carries a material finding until the loan account's
balance replaces it, and the disclosure lists it under *Before filing*.

**Say:** *"What the client asks for is the commitment. What the standard
measures is what is owed at the year-end, disbursed less repayments, so the
attribution declines to nothing as the loan is repaid, and each year is a
fresh measurement. The undrawn part of a facility is reported apart under
§6.2 and never added to the financed figure. The engine runs before anything
is written; a loan the standard would refuse is refused here with its
clause."*

### 4 · The borrower that does not know its emissions

*Lending Book* again. The record form has opened for a second borrower —
Ruhunu Rice Millers (Pvt) Ltd — with no emissions figures of its own.
**Not known — estimate from its industry** is selected, the industry is set
to rice milling, and beneath the form the preview shows what the standard
makes of it before anything is written: Option 3a at score 4, the held
sector factor per unit of the borrower's revenue, the factor set named with
its version and checksum, the checks, and what would raise the score. Clear
the revenue field and the preview falls to Option 3b at score 5 on the
outstanding alone; put it back, then press **Record**.

**Say:** *"Most borrowers on this book cannot state their emissions, and
the loan is priced anyway. The sector factor library and the baselines
behind it are the regional judgement this instrument holds — provisional,
and disclosed as such on every figure that rests on them. The score says
how far the figure is from the borrower's own: a reported figure would earn
a 2, a verified one a 1. The list beneath the score is what to go back to
the borrower for."*

The same form records a reported borrower: choose **Reported by the
borrower** and key its scope 1, 2 and 3. Every change re-asks the engine,
and a loan the standard would refuse says so beneath the form with its
clause before Record is pressed.

### 5 · What the standard made of it

The loan just recorded is open: the PCAF option the data it carried earned
and the data-quality score that follows from it, *estimated on the sector
library* beside the score, the attribution equation the engine ran, the
factor set with its checksum, and any finding with the sentence that
clears it.

**Say:** *"The score is a category from 1 to 5, set by the option — the
borrower's reported figures earn a 2, a sector factor a 4 or a 5 — never an
average. What would raise it is written beside it: that is the improvement
plan for this one loan."*

### 6 · Reviewed, approved, frozen

The same loan, with **Send for review** and **Approve** marked. Press them
in turn. The state moves recorded → under review → approved, each move
dated and attributed on the exposure's own trail; an approved loan offers
no edit, recomputation or removal until it is reopened with a recorded
reason.

**Say:** *"Approving is a separate authority from recording — the lock
scope, exactly as a Part C lock is. A figure the bank has approved cannot
move underneath the disclosure."*

### 7 · On the dashboard, and in the file

*Bank Overview* with business loans in focus: the new loan is in the class's
figures, the approved count has moved, and the next press of **SLFRS S2
disclosure — PDF** carries it in Annex A and in the register annex a
verifier samples from. Every other class dims across the charts and the
tiles; the class's own panel shows its lines, its score, its coverage and
its largest improvement step, marked *scenario*.

**Say:** *"That is the process behind the number: recorded through the
engine, reviewed, approved, and only then in the file."*

### After the walkthrough, for the analysts

*Financed Emissions* is what the team uses after a loan is awarded: every
asset class side by side, the entity's own facts as a form, the SLFRS S2
statements pillar by pillar, and the disclosure as PDF, Word or JSON with
the exposure register as CSV. *Behind this figure* under the headline on
the overview opens the lineage the document prints: the reference and its
SHA-256 content hash, the build, the standard edition, every factor set
with its checksum, the baselines in force, the assurance mode. The
document's checklist is answered from its own facts, so an item can answer
No — *APR-1* until every exposure is approved, and the S2 provenance item
until every illustrative statement is the bank's.

## The GCF walkthrough — the accredited entity's pipeline

The second walkthrough, for a Direct Access Entity: one candidate, from the
door to the Fund. It is the **GCF Walkthrough** page under *Capital & GCF*,
beside the GCF Overview and the Pipeline tab — the bank's own walkthrough
stays under the reporting entity's name and carries the SLFRS S2 steps
alone — and the same strip follows you across the real screens; every step
changes the screen and marks the control it asks you to press. The SLFRS S2 walkthrough above runs unchanged
in the same organisation for the same audience; run it second, over the
bank's own lending book.

### Before the day

1. **Sign in** with the administrator account. An administrator holds the
   `validate` permission, so one sign-in runs the whole assessment; an
   *assessor* account holds `validate` and nothing that writes the book, and
   is the right account for the person who will sign off in production.
2. **Load the entity's own pipeline once.** GCF Overview opens on the shipped
   illustrative set, marked as one; press *Load starter projects* and confirm
   the browser's question. Three realistic Sri Lankan candidates are recorded
   through the same validated seam a keyed candidate goes through — recorded,
   not sample, and every figure editable. A second press is refused
   (`409 STARTER_NOT_EMPTY`). If the organisation already holds candidates,
   the overview shows them and the button is not offered.
3. **Record the entity's own facts** on the Pipeline tab under *Reporting*:
   the entity's name (it is the cover of the disclosure), the accreditation
   (every gate reads the entity's own once recorded, and the shipped B.36/10
   envelope only until then), and the governance, strategy, risk-management
   and targets statements SLFRS S2 asks for. Until they are stated the
   disclosure prints *not stated* with the clause, and the register counts
   them as the bank's own gaps.
4. **Open the GCF Walkthrough and read the readiness rows.**
   Every row is a field a route returned: the pipeline recorded, the entity's
   name, the accreditation, the walkthrough's own candidate (recorded or not
   yet), a signed assessment, what is blocking, the entity's statements, and
   the disclosure with its checklist count. Download
   the GCF disclosure once from the overview so the first render on the day
   is not the first render on the site.
5. **Check the origin** the presenter's browser will use is on
   `ALLOWED_ORIGINS`; production CORS refuses any other, and the symptom is
   that every step fails on the sign-in screen.

### The ten steps — the dashboard first, then one candidate

The dashboard over every candidate first, for the chief executive; then one
candidate — the served example, a tea-factory biomass boiler conversion with
rooftop solar — followed from the door to the Fund. Every step opens the real
screen with that candidate on it and marks the one control to press, and the
readiness rows and the register move as the facts are recorded.
Under the Pipeline tab's strip — Intake first, then the rest — a chip row
names the candidate in focus; the walkthrough sets it to the example, every
tab marks that candidate's own rows, and *All candidates* clears it.

1. **Where we stand** — *GCF Overview.* Every candidate: the money by
   source, the gate as a verdict beside a word and a mark, the ten stages,
   who has signed, lifetime mitigation with the adaptation co-benefit on its
   own line, and the file the pipeline yields. **Say:** *"Accreditation is a
   gate, not a score — Board decision B.36/10. An excluded candidate is one
   the entity cannot carry as the accredited entity, never one ranked down."*
2. **What is blocking, and who holds the key** — the register open behind the
   figure, by owner and by candidate. **Say:** *"Every item is one the
   engines raised, with the clause and the fact that clears it. This is the
   worklist between a pipeline entry and a submission, written down."*
3. **A candidate comes in** — *Pipeline tab, Intake*, the form filled from
   the example the API serves, every figure with its evidence tier; press
   **Record**. This is the candidate every later step follows. **Say:** *"A
   bare number is refused at the door. The tiers are GCF appraisal classes
   and never PCAF's 1–5 scale."*
4. **On the cycle** — the candidate open on its own, the board folded: held,
   partial, missing with the clause; the next step and who takes it; the
   Fund's dates as projections. **Say:** *"Held means the record holds the
   fact; whether it is enough is for the Secretariat and the iTAP."*
5. **Screened and structured** — *The decision*, with the candidate marked
   in the rankings: two rankings never merged, which two for a Concept Note,
   three criteria named unscored; *Instruments* beside it. **Say:** *"One
   league table on carbon per dollar puts every adaptation project last; the
   sort key decides that, not the projects."*
6. **Assessed and signed** — the assessor's form with its controls marked.
   Press **Start review**, rate the six criteria in words, record a
   recommendation, press **Validate and sign off**. **Say:** *"The ratings
   are words and never a number. It is the bank's own appraisal, signed by a
   named assessor — not a decision of the Fund."*
7. **The NDA is informed** — the candidate's NDA form, set to *informed*
   with today's date; press **Save**. The readiness row turns from missing to
   held and the register loses the item. **Say:** *"The NDA is the Ministry
   of Environment through the Climate Change Secretariat; informing it at the
   concept is the Operation Manual's first step. The letter itself is the
   NDA's to issue and stays on the register until it does."*
8. **The Concept Note package** — A–H held, partial or external, and the
   external worklist; press **PDF**. **Say:** *"This does not write the
   Concept Note. The external list is what only people can supply."*
9. **Submitted — the stage moves, dated** — the move control set to *Concept
   note submitted*, today's date and the note in; press **Record the move**.
   The move is dated into the history with who made it, and the Fund's
   six-week feedback window is projected from it. **Say:** *"A move is a
   recorded event, never an edit. The dates that follow it are projections
   drawn as such."*
10. **In the file** — back on the overview, the candidate one stage further
    along the rail, the signed count moved; press **GCF disclosure — PDF**.
    **Say:** *"A pipeline is not the entity's inventory: §29(a) is absent
    with where the figure comes from, avoided and reduced are stated apart,
    and the checklist can answer No."*

**To rehearse again from the door**, open the GCF Walkthrough and press
*Remove it* on the walkthrough-candidate row: the candidate is deleted from
the pipeline and step 3 records it afresh. Recording it a second time without
removing it updates the same candidate in place.

`npm run rehearse:gcf` drives exactly this against a site — `BASE`, `EMAIL`,
`PASSWORD` — with a full-page screenshot at every step and a report of what
refused.

### If something refuses on the GCF day

| Seen | Meaning | Do |
|---|---|---|
| The starter projects were not loaded | The organisation already holds recorded candidates | Use the book that is there; the shipped set is never merged with it |
| `409 SAMPLE_NOT_EDITABLE` | The shipped illustrative set is read-only | Load the starter projects or adopt the set first |
| `403 SCOPE_REQUIRED` on *Validate* | The account's role holds no `validate` scope | Sign in as an administrator or an assessor |
| `409 NOTHING_TO_RETURN` | The assessment is not validated, or the recommendation is clean | A return needs a validated assessment with conditions or against |
| `422 FORBIDDEN_LANGUAGE` on the disclosure | An entity statement claims endorsement | Edit the statement under Reporting; the refusal names the phrase |
| A screen says a list could not be read | 100 requests a minute per caller | Wait a minute and reload; nothing is lost |

## Language

- **Always** *PCAF-conformant*. **Never** *PCAF certified, approved or
  endorsed* — the software refuses those words in every artefact.
- The shipped factor tables and several baselines are **provisional** and say
  so on screen and in the document. That is a disclosure, not a defect.
- **Assurance mode** is *self-declared* by default: the figures rest on the
  entity's own inputs. *Verified* is a request the tool provider grants when
  every governed value resolves to a released baseline and the entity has
  recorded who assured the figures.
- Do not contrast the tool with a spreadsheet. State what the figure is,
  cite the standard that governs it, and stop.

## If something refuses

| Seen | Meaning | Do |
|---|---|---|
| `409 STARTER_NOT_EMPTY` | The year already holds exposures | Use the year selector; the book is already loaded |
| `409 EMPTY_YEAR` | No class holds exposures for that year | Choose the year the book was loaded into |
| `403 SCOPE_REQUIRED` on *Approve* | The account's role holds no `lock` scope | Sign in as an administrator, or grant the role on Accounts |
| `409 APPROVED_FROZEN` | The exposure is approved | *Reopen* with a reason, then change it |
| Signed out | Sessions end at 60 minutes idle, 12 hours absolute | Sign in again |
| A figure reads `—` | The server returned no figure | It is absent, not zero — the caption says what it needs |
| An S2 share reads `—` | No exposure in the book is classified yet | Record a verdict on the Lending Book; a share over an unclassified book would be a number about nothing |
| A pillar reads *Illustrative* | The statement still equals the content shipped with the tool | Edit it on Financed Emissions; one changed word makes it the bank's |
| `409 CLIMATE_NOT_EMPTY` | Climate facts are already recorded | The illustrative set loads once; edit what is there |
| A screen says a list could not be read | 100 requests a minute per caller; a very fast walkthrough can reach it | Wait a minute and reload; the figure is not lost |
