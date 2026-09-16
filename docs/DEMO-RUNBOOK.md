# Demonstration runbook — the bank's own book

The walkthrough for showing a bank its financed-emissions book inside one
administrator account, in the order a committee reads it. Every figure on
these screens is one an engine returned; nothing on a screen adds, divides
or averages, so what is shown is what the disclosure files.

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
   beside *Load starter book* → press it. Fifteen illustrative exposures across
   §5.1–§5.6 and two sovereign holdings are recorded for FY2025, computed by
   their own engines on the way in; the sidebar group takes the bank's name.
   A second press is refused (`409 STARTER_NOT_EMPTY`) — it never overwrites a
   book somebody has begun.
3. **Record the entity's own facts.** Financed Emissions → the entity form:
   consolidation approach, fiscal year-end, GWP basis, who prepared and who
   approved. Each one you record leaves the *Before filing* list.
4. **Approve a few exposures** from the Lending Book (below), so the approval
   ring and the *Approved by the bank* tile show movement rather than zero.
5. **Download the disclosure PDF once**, so the first render on the day is not
   the first render on the site.

## The walkthrough

### 1 · The overview — one screen, the whole position

*Bank Overview.* The bank's name over the year. Five figures: financed scope
1 and 2 (the headline, named with the boundaries it sums); scope 3 on its own
line, never summed into the headline; coverage of the stated book (Disclosure
Checklist Part A, p.124); economic intensity; what the disclosure still needs;
and how many exposures the bank has approved.

Then the drawings: emissions by asset class with scope 3 as a separate grey
bar beneath each class; the share of each class's outstanding at each PCAF
data-quality score (1 is the highest quality, 5 the lowest; one score per
class, never averaged across classes); outstanding per class beside the
coverage ring and the approval ring; intensity per class. One hue is one
class on every panel.

**Say:** *"Every number here is one the engine returned. The screen draws;
it does not compute."*

### 2 · A class in focus

Press a chip. Every other class dims across the charts and the tiles, and
the class's own panel opens: its lines, its score, its coverage, and the
largest single improvement step — marked *scenario*, because a projected
score is never the reported one. *Open in the book* goes to that class.

### 3 · The lending book — add, edit, review, approve

*Lending Book.* Choose the class. The rows are the exposures behind the
class's figures, each with its attribution factor, its lines, its score with
the option beside it, its checks and where it stands in review.

- **Open a row.** The equation the engine ran, the factor set with its
  checksum, the findings inline with what clears each one.
- **Edit.** The form opens prefilled from the input the register holds.
  Change the outstanding, *Save changes*: the engine reruns and the row
  carries the new figure. Back on the overview, the charts have moved.
- **Send for review → Approve.** The state is a word on the row and on the
  detail. Approving is a separate authority (the `lock` scope), exactly as a
  Part C lock is. An approved exposure offers no edit, recomputation or
  removal — it is frozen until reopened.
- **Reopen.** Asks for the reason, which the server records on the
  exposure's own trail. The trail prints on the detail.
- **Record an exposure.** The form for the class. For a property, key the
  floor area in the unit the valuation states — square feet or square metres —
  and the trace shows the conversion the engine ran.

**Say:** *"A figure the bank has approved cannot move underneath the
disclosure. Reopening it is a recorded decision, not a click."*

### 4 · What stands behind a figure

On the overview, *Behind this figure* under any figure opens the lineage the
disclosure prints: the document reference and its SHA-256 content hash, the
build it was produced by, the standard edition, every factor set with its
version and checksum, the baselines in force with their scope and version
(and *provisional* where the shipped set still stands), the assurance mode,
and how many exposures stand approved.

**Say:** *"This is the same lineage the PDF carries. Two renderings of one
position carry one reference."*

### 5 · The disclosure

*Disclosure — PDF*, *Word*, *Register — CSV*. The document is built in the
PCAF Chapter 6 order and its checklist is answered from the document's own
facts, so it can fail: *APR-1* answers No until every exposure is approved,
*INV-1* answers No by design — the entity's own scope 1, 2 and 3 inventory
(SLFRS S2 §29(a)) is what this disclosure is one input to, not the
disclosure itself.

**Say:** *"The checklist cannot reach a hundred per cent, and that is
correct. It says why on its face."*

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
