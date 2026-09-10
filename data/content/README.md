# The wording a deployment owns

`report-text.json` — optional. Where it exists, it replaces the default
wording of the keys it names; where it does not, every default stands. It is
read once at boot, because it is a deployment's setting rather than a
per-request one.

```json
{
  "text": {
    "report.preparedBy": "Prepared by Ceylon Insurance PLC"
  }
}
```

The overridable keys, what each is for and who owns it are declared in
`src/shared/content.js`. The list is deliberately short. Most of the prose in
this system is not wording: a sentence like *"no row in this table sums them"*
states a scope rule PCAF sets, and a sentence a compliance officer can edit
out of a disclosure is a rule they can edit out of a disclosure. Those stay in
source, where the tests that hold them to the standard can reach them.

Two refusals, both loud rather than silent:

- a key that is not on the list is refused **by name**, with the list — an
  operator whose edit is quietly dropped concludes the feature does not work;
- an override carrying PCAF endorsement language is refused, because the
  content layer must not be the route by which *"PCAF approved"* returns to a
  page. Conformance, never endorsement.

`tests/content-layer.test.js` holds both.
