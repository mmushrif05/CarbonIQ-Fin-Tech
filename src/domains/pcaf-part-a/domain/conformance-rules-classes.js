// @ts-check
/**
 * PCAF Part A — the rules of the classes built after §5.2 on the same register — §5.6 motor vehicle loans (A-MV-*), with room for the next.
 *
 * One part of the §5.2 conformance matrix, kept in its own file so no rule
 * file passes five hundred lines; `conformance-rules.js` composes it into the
 * one list `conformance.js` computes over. Every rule maps a clause to the
 * code that enforces it and the test that proves it, and
 * `tests/pcaf-parta-conformance.test.js` fails the build if a citation does
 * not resolve.
 */

'use strict';

const CLASS_RULES = [
  // ---- §5.6 Motor vehicle loans ------------------------------------------
  {
    id: 'A-MV-01',
    clause: '§5.6 Table 5.6-1 (p.94); Annex Table 10.1-6',
    rule: 'The motor-vehicle option-to-score table is its own: 1a and 1b both score 1 — the one Part A '
      + 'table where two options do — 2a scores 2, 2b 3, 3a 4 and 3b 5. The option is derived per vehicle '
      + 'from the data actually supplied, never chosen from a list, and no other class’s table is substituted.',
    implementation: 'data/pcaf-parta/dq-motor-vehicles.json loaded by src/domains/pcaf-part-a/domain/reference.js; src/domains/pcaf-part-a/domain/motor-vehicles/index.js — assessVehicle() derives the option from fuel consumed, efficiency basis and distance basis',
    test: 'tests/parta-motor-vehicles.test.js › two options score 1, and the rest are 2a→2, 2b→3, 3a→4, 3b→5 — the table is its own',
    status: 'implemented',
  },
  {
    id: 'A-MV-02',
    clause: '§5.6 fn 146 (p.94)',
    rule: 'A "local" distance statistic is the province, state or small-country level, so a Sri-Lanka-wide '
      + 'annual-km figure is local: make/model efficiency read off the registration certificate with the '
      + 'registry’s Sri Lankan distance baseline is Option 2a, score 2; a regional statistic is 2b. The '
      + 'statistic’s vintage and provenance travel on the trace.',
    implementation: 'src/domains/pcaf-part-a/application/vehicle-factors.js — resolves vehicle_annual_distance_km from the baseline registry; src/domains/pcaf-part-a/domain/motor-vehicles/index.js — the registry’s figure is taken as a local statistic and named with its scope and version',
    test: 'tests/parta-motor-vehicles.test.js › make/model efficiency × the Sri-Lanka-wide statistic is Option 2a, score 2 — local under fn 146',
    status: 'implemented',
  },
  {
    id: 'A-MV-03',
    clause: '§5.6 (p.93) — combination of options',
    rule: 'Where a borrower’s vehicles are assessed under different options the borrower’s score is the '
      + 'lowest data quality in the mix — the one class where the standard states a combination rule — '
      + 'and the mix is printed beside the score rather than averaged into it.',
    implementation: 'src/domains/pcaf-part-a/domain/motor-vehicles/index.js — assessMotorVehicles() takes the worst vehicle’s option for the facility and carries the mix and the rule on dataQuality',
    test: 'tests/parta-motor-vehicles.test.js › a borrower’s vehicles under different options carry the lowest quality in the mix (p.93)',
    status: 'implemented',
  },
  {
    id: 'A-MV-04',
    clause: '§5.6 (p.91) — attribution; (p.96) — hybrids and electric vehicles',
    rule: 'Attribution is outstanding over the total value at origination; where that value is unknown '
      + '100 % attribution is assumed, the standard’s own default, and the trace says the default was taken. '
      + 'A non-plug-in hybrid burns petrol only; a plug-in with no manufacturer usage split is 100 % '
      + 'combustion; an electric vehicle’s electricity is scope 2 on the grid factor in force.',
    implementation: 'src/domains/pcaf-part-a/domain/motor-vehicles/index.js — the assumed-100pct denominator state and the electricShare rule in assessVehicle()',
    test: 'tests/parta-motor-vehicles.test.js › the value at origination unknown is 100 % attribution, the standard’s default, and the trace says so (p.91)',
    status: 'implemented',
  },

];

module.exports = { CLASS_RULES };
