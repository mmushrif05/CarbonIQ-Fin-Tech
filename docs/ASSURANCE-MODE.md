# Assurance mode

Every document this application produces says on its face what it may be
taken for. There are two modes and no third, and the choice is the **tool
provider's**, not the reporting entity's.

| | What it says | Recommended |
|---|---|---|
| `self_declared` | The figures rest on the reporting entity's own baseline and its own values. Neither the tool provider nor Datum Solutions has confirmed those inputs. | No |
| `verified` | Every governed value the document reads resolves to a released baseline, and the entity has recorded who assured the figures, to what standard and at what level. | Yes |

The default is `self_declared`. A deployment that has configured nothing gets
the weaker claim, and a document built with no position at all falls back to
the same sentence rather than to silence — absent the check, nothing has been
checked, and printing nothing reads as the stronger claim.

## Self-declared is permitted, and it is not recommended

An entity may run on its own baseline and its own values. What it may not do
is publish a figure whose standing is unstated, because a reader supplies the
missing half generously. So the mode is freehand and the document is explicit:

> Self-declared. The figures in this document rest on the reporting entity's
> own baseline and its own values. Neither the tool provider nor Datum
> Solutions has confirmed those inputs, and nothing here should be read as
> their opinion on them. The method is as stated and every figure is traced to
> what it was computed from; what has not been established is whether those
> inputs are right.

The mode carries a caution beside it for a screen to show: an assurance
provider reading a self-declared document has to establish the inputs
themselves, which is the work `verified` exists to have already done.

## Verified is a request, not an assertion

Asking for `verified` does not grant it. Two conditions are checked on every
document, and either one unmet resolves the position back to `self_declared`
and prints the reason:

| Condition | Unmet when |
|---|---|
| `baselines_released` | a governed value is still the provisional set this tool ships with — the reason names which |
| `assurance_declared` | the reporting entity has not recorded who assured these figures |

A downgraded document does not simply say "self-declared". It says it was
configured otherwise and why, because a reader is entitled to the cause:

> … This deployment is configured as verified; it is reported self-declared
> because a governed value is still the provisional set this tool ships with:
> `taxonomy.intensityBands`; the reporting entity has not recorded who assured
> these figures.

Both reasons are given, not the first — a reader who fixes one and finds a
second waiting has been told half the answer.

These are conditions about **governance**, not about how local every factor
is. A provisional *emission factor* is disclosed as provisional and travels
with its manifest; it is not a bar to the mode, because the point of a
governed regional baseline is that it is released over time. What is a bar is
claiming a governed position nobody has taken.

## Who sets it

| | Route | Scope | Whose fact |
|---|---|---|---|
| The operating mode | `PUT /v1/assurance/mode` | `admin` | the tool provider's |
| The entity's assurance declaration | `PUT /v1/assurance` | `write` | the reporting entity's |

They sit under one prefix because a reader answering *"what may this document
claim"* needs both, and two prefixes for one question is how two screens come
to disagree. They are different facts with different owners, and the scopes
say so. A reporting entity that could set its own mode to `verified` would be
self-declaring by another name.

`ASSURANCE_MODE` on the environment is the deployment-wide default; a value
recorded for an organisation overrides it. A mode the runtime cannot store is
refused rather than accepted, because the next document would print the old
one without saying so.

`GET /v1/assurance/mode` returns the resolved position — mode, label, what was
requested, whether it was downgraded, the reasons, the sentence, the two modes
and what `verified` requires.

## Where it is applied

| | |
|---|---|
| `src/shared/assurance-mode.js` | the vocabulary, the two conditions and the resolver |
| `src/platform/reporting/assurance-mode.js` | what the provider set, and the evidence read from two records |
| `src/domains/baseline/application/assurance-position.js` | the one place the evidence is assembled |
| `src/domains/pcaf-part-c/reporting/report-standard/` | the cover, in PDF and in Word |
| `tests/assurance-mode.test.js` | the rule, the evidence, both document paths, and the scope |

Every document builder goes through one function. Two assemblies of the same
evidence are two answers to one question, and a per-assessment report and an
annual disclosure drawn from one book must not state different postures.
