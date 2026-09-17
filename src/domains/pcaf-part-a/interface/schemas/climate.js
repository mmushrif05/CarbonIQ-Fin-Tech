// @ts-check
/**
 * The SLFRS S2 climate facts, validated from the item registry itself.
 *
 * The schema is built from `domain/climate/items.js` rather than written
 * beside it, so a field added to the registry is accepted by the route on the
 * same commit and a field removed stops being accepted on the same commit.
 * Hand-written, this would be the second list of twenty-six field names in the
 * repository and the one that goes stale — and the way that shows is a form
 * saving a field the route silently drops.
 *
 * Every field is optional, because a form that renders one pillar saves one
 * pillar. Unknown keys are refused rather than ignored: a caller misspelling
 * `governance.oversite` is owed the 400 rather than a quiet no-op.
 */

'use strict';

const Joi = require('joi');
const { ITEMS, ROW_SHAPES, listFor } = require('../../domain/climate/items');
const { idsOf } = require('../../domain/climate/vocabulary');

const enumOf = name => Joi.string().valid(...idsOf(listFor(name))).allow(null, '');

/** A figure the entity states, or states as absent with a reason. */
const figure = Joi.object({
  value: Joi.number().allow(null),
  unit: Joi.string().max(40).allow(null, ''),
  basis: enumOf('inventoryBases'),
  period: Joi.string().max(40).allow(null, ''),
  note: Joi.string().max(1000).allow(null, ''),
  absentReason: Joi.string().max(1000).allow(null, ''),
}).unknown(false).allow(null);

const money = Joi.object({
  amount: Joi.number().allow(null),
  currency: Joi.string().max(10).allow(null, ''),
  note: Joi.string().max(1000).allow(null, ''),
  absentReason: Joi.string().max(1000).allow(null, ''),
}).unknown(false).allow(null);

const carbonPrice = Joi.object({
  appliedTo: Joi.array().items(enumOf('carbonPriceUses')).max(8),
  price: Joi.number().allow(null),
  currency: Joi.string().max(10).allow(null, ''),
  note: Joi.string().max(1000).allow(null, ''),
}).unknown(false).allow(null);

const remuneration = Joi.object({
  linked: Joi.boolean().allow(null),
  sharePct: Joi.number().min(0).max(100).allow(null),
  note: Joi.string().max(1000).allow(null, ''),
}).unknown(false).allow(null);

/** One row of a repeating block, from the shape the registry declares. */
function rowSchema(name) {
  const keys = {};
  for (const f of ROW_SHAPES[name] || []) {
    keys[f.key] = f.kind === 'number' ? Joi.number().allow(null)
      : f.kind === 'enum' ? enumOf(f.list)
        : Joi.string().max(f.max || 2000).allow(null, '');
  }
  return Joi.array().items(Joi.object(keys).unknown(false)).max(60);
}

/** The schema for one item, by the kind the registry gives it. */
function schemaFor(item) {
  switch (item.kind) {
    case 'text': return Joi.string().max(item.max || 4000).allow(null, '');
    case 'enum': return enumOf(item.list);
    case 'number': return Joi.number().allow(null);
    case 'figure': return item.path === 'crossIndustry.capitalDeployed' ? money : figure;
    case 'carbonPrice': return carbonPrice;
    case 'remuneration': return remuneration;
    case 'list': return rowSchema(item.of);
    default: return Joi.any();
  }
}

/* Assembled by walking each item's dotted path, so the shape of the request is
   the shape of the record and neither can be changed without the other. */
function build() {
  /** @type {Record<string, any>} */
  const groups = {};
  for (const item of ITEMS) {
    const [group, key] = item.path.split('.');
    groups[group] = groups[group] || {};
    groups[group][key] = schemaFor(item);
  }
  const keys = {};
  for (const [group, fields] of Object.entries(groups)) keys[group] = Joi.object(fields).unknown(false);
  return Joi.object(keys).unknown(false);
}

const climateSchema = build();

module.exports = { climateSchema };
