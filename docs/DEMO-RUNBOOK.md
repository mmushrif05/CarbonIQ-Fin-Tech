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

Six steps: the position and the file for the chief executive, then one
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
what is not stated.

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
borrower — Lanka Textiles (Pvt) Ltd — with every field already filled: the
facility and its outstanding, the borrower's equity and debt, its reported
scope 1 and 2, and the climate block, which is the bank's own judgement of
transition risk, physical risk and opportunity alignment with the horizon
it judged each over. Change any figure you like, then press **Record**.

**Say:** *"These are the fields a relationship manager fills when a loan is
awarded. The engine runs before anything is written; a loan the standard
would refuse is refused here with its clause. The climate block feeds the
S2 metrics and changes no figure."*

### 4 · What the standard made of it

The loan just recorded is open: the PCAF option the data it carried earned
and the data-quality score that follows from it, the attribution equation
the engine ran, the factor set with its checksum, and any finding with the
sentence that clears it.

**Say:** *"The score is a category from 1 to 5, set by the option — the
borrower's reported figures earn a 2, a sector factor a 5 — never an
average. What would raise it is written beside it: that is the improvement
plan for this one loan."*

### 5 · Reviewed, approved, frozen

The same loan, with **Send for review** and **Approve** marked. Press them
in turn. The state moves recorded → under review → approved, each move
dated and attributed on the exposure's own trail; an approved loan offers
no edit, recomputation or removal until it is reopened with a recorded
reason.

**Say:** *"Approving is a separate authority from recording — the lock
scope, exactly as a Part C lock is. A figure the bank has approved cannot
move underneath the disclosure."*

### 6 · On the dashboard, and in the file

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
