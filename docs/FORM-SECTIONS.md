# Reading a long form one section at a time

`ui/js/form-steps.js` · `ui/css/form-steps.css`

A long form used to run down one column: a person filling one scrolled past
every section to reach the button, and the field they were typing into and
the answer the engine gave were never on screen together.

A screen that opts in shows **one section at a time**, with a numbered rail
naming the rest, and Back/Next beneath it. Nothing is computed here and no
markup is moved — the sections are the markup the screen already had.

This document is for whoever maintains those screens. You should be able to
add, rename, reorder or remove a section without opening the module.

---

## The two shapes

There are only two, and which one you want depends on the screen.

### 1. One form with sections inside it

Put `data-steps="auto"` on the `<form>` (or on any element that holds the
fields). Sections then begin at each of these, whichever the form uses:

| What you write | Section title |
|---|---|
| `<fieldset>` … `<legend>The exposure</legend>` | the legend |
| `<h5 class="partc-subhead">The facility</h5>` | the heading |
| any element with `data-step-title="…"` | that attribute |

Whatever sits **above the first** of those is the opening section. Name it
with `data-step-first` on the form:

```html
<form id="paForm" data-steps="auto" data-step-first="The exposure">
  <fieldset><legend>1 · The exposure</legend>   …fields… </fieldset>
  <fieldset><legend>2 · Attribution</legend>    …fields… </fieldset>
</form>
```

A leading number in a title is dropped, because the rail numbers the chips
itself — `1 · The exposure` becomes `The exposure`.

### 2. A page whose numbered cards *are* the flow

Some screens are not one form but a run of cards down the page — Part C's
intake, the Insurance Book. Put `data-step-group="<a name>"` on **each card**.
Cards sharing a name are one flow, in the order they appear.

```html
<section class="partc-card" data-step-group="insurance-book"> … </section>
<section class="partc-card" data-step-group="insurance-book"> … </section>
```

The title is the card's own first heading, with any step-number badge
(`.partc-step`, `.step-number`) left out.

---

## How to change something

| You want to | Do this |
|---|---|
| **Add a section** | Add a `<fieldset>`/heading in the form, or `data-step-group` on the card |
| **Rename one** | Change the legend/heading — or add `data-step-title` to override it |
| **Reorder** | Move the markup; order on screen is order on the rail |
| **Remove one** | Remove the heading (its fields join the section above) or the attribute |
| **Keep something out of the rail** | `data-fs-keep` on it, or give it the class `partc-actions` |
| **Turn it off for a screen** | Delete `data-steps` / `data-step-group`. The form goes back to one column and still works |

### Titles that are filled in at run time

A heading completed by JavaScript (`Projects — <span id="…"></span>`) is
empty when the rail is first drawn, so it reads as a dash or as `Step`.
Give those cards an explicit `data-step-title`.

---

## What the mark on a chip means

Each chip can carry a mark. There are four states and every one of them is
literally true — none is this module's opinion of your figures.

| Mark | State | What it means |
|---|---|---|
| **✓** green | `answered` | Something was entered here and nothing the form insists on is blank |
| **·** grey | `started` | Something was entered, but a required field here is still empty |
| **i** amber | `noted` | The **engine** raised a material finding about a figure here. The record is valid; the report will say so |
| **!** red | `attention` | The **browser** refuses a control here. Record will not go through until it is fixed |
| *(none)* | — | Nothing entered yet, or this section holds no fields at all |

Two of these come from outside and neither is guessed:

- **attention** is the browser's own `validity.valid`. Note the module reads
  `el.validity.valid` and never calls `el.checkValidity()` — the *method*
  dispatches an `invalid` event, which this module listens for, which
  re-draws the rail, which reads validity again. That recursion rendered the
  rail to a stack overflow once.
- **noted** is the engine's. A finding carries the name of the figure it is
  about (`field: 'emissions.scope3'`), and a control claims a figure with
  `data-engine-path`, so the two meet without anything inferring a link. The
  page hands them over:

  ```js
  FormSteps.flag(form, material.map(f => f.field).filter(Boolean));
  ```

  A name no control claims marks nothing. The engine's answer is printed in
  full beneath the form either way, so nothing is lost by not guessing.

**Why an error and a note are not the same mark.** `SCOPE_3_NOT_REPORTED` is
material and can never be cleared — a borrower that does not measure its
scope 3 never will, the stated reason is the remedy's content rather than a
way to remove it. Under one mark that section would sit lit as "needs
attention" forever over something already done, and a mark that is always
lit is a mark nobody reads. As a *note* the same permanence is correct: the
report will always say so.

**A form nobody has touched is not a form full of mistakes.** An empty
required field only counts once someone has typed something or pressed the
button.

**"Answered" is not "every box filled".** Most of these fields are optional,
and a section that can never be ticked is a tick nobody trusts.

---

## Four rules the module keeps, and why

These are here because each was a real defect during the build. Keep them in
mind if you change the module itself.

1. **The Record button is never inside a section.** Swallowed into the last
   one it vanishes for every other section, and the button appears to do
   nothing. Anything with `partc-actions` or `data-fs-keep` stays out.

2. **A required field on a section you are not looking at.** The browser
   refuses to submit a form it cannot focus the offending control in, and
   reports that to the console rather than to the person. So the section
   holding the first failing control opens *before* the browser validates.

3. **`.fs-off` only ever hides.** `[hidden]` is `display:none` from the
   user-agent sheet and any class that sets `display` beats it. Putting a
   section back only removes `.fs-off`, so an element the page itself hid
   stays hidden.

4. **A section with nothing visible in it is not a section.** The lending
   book carries one block per asset class and hides the rest; the Insurance
   Book reveals cards as the work proceeds. The rail re-reads itself rather
   than opening onto a blank panel — a card flow watches its cards' `hidden`
   attribute, so no page has to remember to tell it.

---

## Where it is switched on

| Screen | Shape | Sections |
|---|---|---|
| Lending Book — record an exposure | form | 5–6, per asset class |
| Financed Emissions — reporting entity | form | 4 |
| Sovereign Book | form | 2 |
| GCF intake | form | 5 |
| PCAF Part A engine | form (`<fieldset>`) | 7, two of them conditional |
| PCAF calculator | form | 2 |
| PCAF Part C intake | card flow | 5 |
| Insurance Book | card flow | 6, revealed as you go |
| Walkthrough (bank) | card flow | 7 steps |
| GCF Walkthrough | card flow | 10 steps |

### The walkthroughs are a special case worth knowing about

Their steps are a card flow like any other, but the walkthrough **already
owns a current step** — the strip on every screen reads it, and `Open` acts
on it. So the rail follows that state and never writes it:

- moving the rail **browses the plan**; it does not change what is being
  presented;
- `Start`, the strip's `Next`, and a step's own `Open` are what present it,
  and the rail moves to match through `syncControls()`.

One-way, walkthrough → rail. Two-way syncing between a component's index and
a page's own state is where this would have gone wrong.

Each track names its own flow with its page prefix (`wt-…`, `gwt-…`), so the
bank's seven steps and the GCF's ten never share a rail — both fragments can
sit in one document.

### Deliberately not switched on

- **New project** already has its own four-step wizard. Two steppers on one
  form would fight each other.
- **Monitoring** is three read-only panels and one short form.
- **NDC & SDG** is eleven fields in a multi-column grid — four rows, not a
  long scroll.
- Every screen with fewer than about ten fields. A wizard over three fields
  is worse than three fields.

---

## Tests

- `tests/form-steps.test.js` — the rules above, swept over the source.
- `e2e/form-steps.spec.js` — the record form driven by hand in a browser:
  every section reachable, the rail following the asset class, a loan
  recorded section by section, and the required-field trap.
- `e2e/form-sections.spec.js` — the other screens, each one driven.

## Gating the button that records

A form whose record button is always live answers a press with a refusal from
the engine, and where that refusal names a clause rather than a field, the
person pressing it learns nothing. So a form may name its own record control
and let the component hold it shut until the record is answerable.

Three edits, and no code:

```html
<form id="pr-form" data-steps="auto" data-steps-gate="pr-form-submit">
  ...
  <label>Amount
    <input id="pr-f-outstanding" type="number"
           data-fs-required data-fs-label="Outstanding amount at year-end"></label>
  ...
  <div class="fs-checklist" data-fs-checklist data-fs-keep hidden></div>
  <div class="partc-actions">
    <button type="submit" id="pr-form-submit">Record</button>
  </div>
</form>
```

- **`data-steps-gate="<id>"`** names the button. While anything is outstanding
  it is disabled and reads *Record — 3 still needed*.
- **`data-fs-required`** on a field makes it a requirement. **`data-fs-label`**
  is the words the checklist uses; without it the field's own `<label>` is
  read, which is usually enough.
- **`data-fs-checklist`** is where the list is drawn. It carries `data-fs-keep`
  so it belongs to the form rather than to whichever section happens to be last.
- **`data-fs-group="<name>"`** makes several fields *one* requirement, met as
  soon as any of them holds something. The company value is the standard's own
  example: total equity and total debt, **or** the total balance sheet where
  those cannot be obtained (footnote 44). Listing them separately would tell a
  bank two fields are missing when it has already answered the question.

### Two rules worth knowing before you add one

**A requirement is read only where its field is visible.** Native `required` is
deliberately not used for this: the register form carries one block per asset
class and hides the rest, and a natively required control inside a hidden block
stops the browser submitting a form nobody can fix — it reports that to the
console rather than to the person pressing the button.

**A requirement that depends on an answer rather than on the class lives in the
page's module, not on the field.** Most requirements belong to a block that is
shown or hidden with its asset class, so declaring them on the field is enough.
Two in the register are not: the held sector is required on the sector path
alone, and the company value on every option that earns an attribution factor —
which is all of them but Option 3b. Both are set and cleared in
`applyKnown()` in `ui/js/parta-register.js`, which is the one place that knows
which path the form is on.

### What a page still owns

The gate disables the button; it does not replace the page's own submit
handler. A submit that arrives another way — a keyboard press, a stale button —
should ask `FormSteps.missing(form)` and say what is outstanding rather than
sending a body the engine will refuse. `FormSteps.revealMissing(form)` opens
the section holding the first one and puts the cursor in it.

### How the register's requirements were arrived at

Not by reading the engines and not by judgement: every field of the starter
book's own inputs was blanked in turn and the engine's refusal recorded, per
asset class. What a class asks for is what its engine actually refuses
without — `EVIC_MARKET_CAP_REQUIRED`, `DQ_OPTION_REQUIRED`,
`BUILDING_TYPE_NOT_HELD`, and so on — and nothing else is declared, so no
legitimate record is held up by a field the standard does not need.

Two of them turned out to be a **choice** rather than a field, which is the
finding that matters and the reason `data-fs-group` exists:

| Refusal | Answered by | Reaching |
|---|---|---|
| `ORIGINATION_VALUE_REQUIRED` | the origination value, **or** the latest valuation | — |
| `BUILDING_ENERGY_INPUT_REQUIRED` | metered energy **or** floor area **or** the number of buildings | Option 1b · 2b · 3 |

A bank that has answered the question one way must not be told it is missing
the other two.

**Motor vehicle loans carry only the outstanding amount and its date.** The
engine's other refusal, `VEHICLES_REQUIRED`, is answered by the vehicle block
as a whole rather than by any one field, and every control in it is a select
with a valid default or a genuinely optional figure — there is nothing there
a person can leave blank that the engine then refuses.

