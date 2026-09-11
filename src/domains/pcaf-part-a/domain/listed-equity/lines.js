/**
 * §5.1's binding of the shared six-line reporting shape
 * (`../corporate/lines.js`). The pages are this chapter's; the logic is not.
 */

'use strict';

const { build } = require('../corporate/lines');

const { reportingLines } = build({
  reference: 'PCAF Part A Third Edition §5.1, pp.44 and 49–50',
  scope3Clause: 'PCAF Part A Third Edition §5.1, pp.40–41',
  separationRef: '§5.1, pp.49–50',
  category: 'Scope 3 Category 15 (investments) of the reporting financial institution',
});

module.exports = { reportingLines };
