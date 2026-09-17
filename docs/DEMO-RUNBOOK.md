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
2. **Load the bank's book once.** Bank Overview → type the bank's legal name
   beside *Load starter book* → press it → confirm the browser's question.
   Fifteen illustrative exposures across §5.1–§5.6 and two sovereign holdings
   are recorded for FY2025, computed by their own engines on the way in; the
   year selector moves to 2025 and the sidebar group takes the bank's name.
   A second press is refused (`409 STARTER_NOT_EMPTY`) — it never overwrites a
   book somebody has begun.
3. **Record the entity's own facts.** Financed Emissions → the entity form.
   The starter book has already stated the consolidation approach, the fiscal
   year-end (`MM-DD`), the GWP basis and a boundary note to confirm; what
   *Before filing* still asks for is who prepared and who approved. Record
   them and the item leaves the list. Two items stay by design: *Approve N
   exposures* until every row is approved, and the sovereign holdings being
   in USD against an LKR book total — their outstanding is excluded from the
   coverage share rather than converted at a rate the system does not hold.
4. **State the bank's SLFRS S2 facts, or load the illustrative set.**
   Financed Emissions → *Climate-related disclosure*. Four pillars —
   governance, strategy, risk management, metrics and targets — 26 statements
   in all, each naming the paragraph that asks for it. On a book that holds
   none, *Load illustrative content* fills all but one, and every one of them
   is then **marked illustrative wherever it is printed**, on screen and in
   the document, until the bank's own words replace it. Edit at least the
   governance paragraph before the day so the strip on the overview shows a
   pillar the bank has stated.
5. **Approve a few exposures** from the Lending Book (below), so the approval
   ring and the *Approved by the bank* tile show movement rather than zero.
6. **Download the SLFRS S2 disclosure PDF once**, so the first render on the
   day is not the first render on the site.
7. **The same walkthrough is a tab in the product.** *Walkthrough*, at the
   foot of the bank's group in the sidebar, reads the day's readiness off the
   reporting year — the book, the bank's name, who prepared and approved,
   the approvals, what the disclosure still lists, whether the document
   renders — with a button to the screen that answers each row. *Start the
   walkthrough* puts a strip under the page title on every screen with the
   step, what to do and, behind *Notes*, what to say; *Next* opens each
   screen with the step already applied. It survives a reload; *End* takes
   it away.
8. **Or let the runbook drive itself.** `npm run rehearse` performs steps 2–6
   and the whole walkthrough below against the site, in a browser, and leaves
   a full-page screenshot of every step and a report beside them:

   ```bash
   BASE=https://carboniqfintech.netlify.app EMAIL=you@bank.lk PASSWORD=… \
   BANK="Legal Name PLC" npm run rehearse
   ```

   It writes what the runbook writes — the starter book, the illustrative S2
   statements with one replaced, two approvals, one reopen, one recorded
   property — so run it against the organisation you will demonstrate, once,
   before the day.

   Driving it against a **local** production-shaped instance rather than the
   site needs that instance's own origin on `ALLOWED_ORIGINS`. Without it the
   browser's sign-in is refused and the screen says *"CORS: Origin … not
   allowed"* — the server behaving correctly, and a message worth recognising
   because every step after it then fails on the sign-in screen. On Netlify
   the origin is the site's own and nothing has to be set.

## The walkthrough

Eight steps. The product's *Walkthrough* tab drives exactly these, opening
each screen with the step already applied.

### 1 · The position — the whole book on one screen

*Bank Overview.* The bank's name over the reporting year. Six figures:
financed scope 1 and 2 (the headline, named with the boundaries it sums);
scope 3 on its own line, never summed into the headline; coverage of the
stated book (Disclosure Checklist Part A, p.124); economic intensity; what
the disclosure still needs; and how many exposures the bank has approved.

**Say:** *"Every number here is one the engine returned. The screen draws;
it does not compute."*

The sign-in screen also offers the sample book to any visitor by address.
That is the public preview; set `PREVIEW_ACCESS=off` on Netlify if the room
should not see it.

### 2 · The SLFRS S2 file, downloaded

Press **SLFRS S2 disclosure — PDF**. One press, one document. The cover names
the reporting entity, who prepared it and who approved it, and carries a
reference derived from the content itself.

**Say:** *"That is the file. One document, one press. The same position
rendered twice carries the same reference, so a filed copy can be matched to
what was on the screen."*

The same button offers Word, and *Register — CSV* is the exposure-level data
annex a verifier samples from.

### 3 · What S2 asks, and where it is answered

The strip beneath the figures carries the four S2 pillars with what the bank
has stated, what is still illustrative and what is not stated. Pressing a
pillar opens the form that answers it.

*Behind the S2 file* opens the index: every S2 paragraph, what it asks, the
section of the document that answers it, and whether it is answered. The
financed-emissions paragraphs point at sections the document has always
printed.

**Say:** *"Nothing was rewritten to make this an S2 file. The financed
emissions answer §29(a)(vi) as they stand; what we added is what S2 asks that
an emissions engine cannot compute — and a paragraph the bank has not
answered is printed as not stated with its clause, never filled in."*

### 4 · The climate view

*Climate risk and opportunity.* Three bars — outstanding vulnerable to
transition risk (§29(b)), vulnerable to physical risk (§29(c)), aligned with
climate-related opportunities (§29(d)) — each split into what was assessed
and what has not been. Beneath, the same book *by industry*, with lending to
carbon-related industries marked.

**Say:** *"The share is taken over the outstanding actually assessed, and
what is unassessed is drawn beside it. A book nobody has classified reads as
unclassified here, never as safe."*

The carbon-related boundary is the four non-financial groups of the TCFD 2021
implementing guidance, and the figure says so: the standard leaves that
boundary to the reporting entity.

### 5 · What is collected when a loan is awarded

*Lending Book*, at business loans. This is the origination screen, and the
point of the step is what a relationship manager fills in.

- **The record form.** The PCAF inputs the engine prices a loan from, and
  beneath them the **climate block** — transition risk, physical risk,
  opportunity alignment, each *vulnerable / not vulnerable / not assessed*
  with the horizon the bank judged it over, and the Sri Lanka taxonomy
  activity code where one applies. For a property, key the floor area in the
  unit the valuation states and the trace shows the conversion the engine ran.
- **Open a row.** The equation the engine ran, the factor set with its
  checksum, the findings inline with what clears each one.
- **Edit.** The form opens prefilled from the input the register holds.
  Change the outstanding, *Save changes*: the engine reruns.
- **Send for review → Approve.** Approving is a separate authority (the
  `lock` scope), exactly as a Part C lock is. An approved exposure offers no
  edit, recomputation or removal until it is reopened.
- **Reopen.** Asks for the reason, which the server records on the exposure's
  own trail.

**Say:** *"The climate block is the bank's judgement about the loan, not a
figure. It feeds the S2 §29(b)–(d) lines and changes nothing the engine
computes. A figure the bank has approved cannot move underneath the
disclosure; reopening it is a recorded decision, not a click."*

### 6 · How it reaches the dashboard

Back on the overview with that class in focus. Every other class dims across
the charts and the tiles, and the class's own panel opens: its lines, its
score, its coverage, and the largest single improvement step — marked
*scenario*, because a projected score is never the reported one.

### 7 · What stands behind a figure

*Behind this figure* under the headline opens the lineage the disclosure
prints: the document reference and its SHA-256 content hash, the build it was
produced by, the standard edition, every factor set with its version and
checksum, the baselines in force with their scope and version (and
*provisional* where the shipped set still stands), the assurance mode, and
how many exposures stand approved.

**Say:** *"This is the same lineage the PDF carries. Two renderings of one
position carry one reference."*

### 8 · The detail, for the analysts

*Financed Emissions* — what the team uses after a loan is awarded. Every
asset class side by side, the entity's own facts as a form, the SLFRS S2
statements pillar by pillar, and the disclosure as PDF, Word or JSON with the
exposure register as CSV.

The document's checklist is answered from its own facts, so an item can
answer No: *APR-1* until every exposure is approved, the S2 items until the
bank has stated each pillar, and *INV-1* until the bank states its own gross
scope 1 and location-based scope 2.

**Say:** *"The checklist can fail, and today it does. That is the document
telling you what is still outstanding rather than claiming it is complete."*

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
