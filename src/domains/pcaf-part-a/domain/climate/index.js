// @ts-check
/**
 * The SLFRS S2 climate facts: the vocabulary they are chosen from, the
 * registry of what the standard asks for, the normaliser that records an
 * answer, and the illustrative pack a trial starts from.
 *
 * The pack is held to the same registry the record is, through `checked()`,
 * so a committed file that names a field the registry does not hold, or puts
 * an id outside its vocabulary, fails at load rather than reaching a page.
 */

'use strict';

const Joi = require('joi');
const { checked } = require('../../../../shared/reference-data');
const vocabulary = require('./vocabulary');
const items = require('./items');
const facts = require('./facts');

const raw = require('../../../../../data/pcaf-parta/climate-illustrative.json');

/* Guidance keys are stripped before the pack is anything but prose, the same
   rule the GCF recording template follows: the explanation belongs in the file
   a person edits, and never in the record. */
function strip(value) {
  if (Array.isArray(value)) return value.map(strip);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) if (!k.startsWith('_')) out[k] = strip(v);
    return out;
  }
  return value;
}

/**
 * The pack, normalised through the same function a caller's patch goes
 * through — so it cannot hold a shape the registry would refuse from anyone
 * else — and then checked to be non-empty, because an illustrative pack that
 * silently normalised to nothing would offer a button that does nothing.
 */
const ILLUSTRATIVE = Object.freeze(checked('data/pcaf-parta/climate-illustrative.json',
  facts.normaliseWhole(strip(raw)), Joi.object().min(1).unknown(true)));

/** How many of the registry's items the shipped pack actually answers. */
const ILLUSTRATIVE_ITEMS = facts.readiness(ILLUSTRATIVE, ILLUSTRATIVE).illustrative;

/** The entity's facts, with each item marked stated, illustrative or absent. */
const readiness = climate => facts.readiness(climate, ILLUSTRATIVE);

module.exports = {
  ...vocabulary,
  ...items,
  normalise: facts.normalise,
  isEmpty: facts.isEmpty,
  readiness,
  ILLUSTRATIVE,
  ILLUSTRATIVE_ITEMS,
};
