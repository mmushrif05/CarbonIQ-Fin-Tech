'use strict';

/**
 * The platform's database — one export surface. Nothing above `platform/`
 * requires a file in this directory directly except through here, and
 * nothing anywhere requires `pg` except `client.js`.
 */
module.exports = {
  client: require('./client'),
  collections: require('./collections'),
  errors: require('./errors'),
  migrate: require('./migrate'),
  documents: require('./document-store'),
  auditChain: require('./audit-chain'),
};
