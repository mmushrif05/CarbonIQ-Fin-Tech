// @ts-check
/**
 * §5.2's binding of the shared six-line reporting shape
 * (`../corporate/lines.js`). Table 5.2-3 (p.63) is this chapter's own example
 * and reports the same six.
 */

'use strict';

const { build } = require('../corporate/lines');

const { reportingLines } = build({
  reference: 'PCAF Part A Third Edition §5.2, pp.58 and 62–63',
  scope3Clause: 'PCAF Part A Third Edition §5.2, p.56',
  separationRef: '§5.2, pp.62–63',
  category: 'Scope 3 Category 15 (investments) of the reporting financial institution',
});

module.exports = { reportingLines };
