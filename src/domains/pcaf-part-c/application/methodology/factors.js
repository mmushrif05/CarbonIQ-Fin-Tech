/**
 * Every factor row the statement cites, harvested from the store, and the open items.
 */

'use strict';

const factorStore        = require('../../domain/factors');

/**
 * Enumerate every factor row across the store.
 *
 * A table declares tier, unit and reference once at the top and its rows
 * inherit them — the shape the JSON is actually written in. An earlier
 * version only collected nodes that carried their own `tier`, so five whole
 * tables, including the IPCC AR5 global warming potentials and the RICS
 * Table 18 waste rates, never appeared in the evidence at all.
 */
function _harvestFactorRows() {
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '..', '..', '..', '..', '..', 'data', 'factors');
  const out = [];

  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch (_) { return out; }

  for (const file of files) {
    const table = file.replace(/\.json$/, '');
    let json;
    try { json = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')); } catch (_) { continue; }

    const push = (key, node, inherited) => {
      out.push({
        table,
        module: json.module || _moduleForTable(table),
        key,
        value: node.value,
        unit: node.unit || inherited.unit || null,
        tier: node.tier || inherited.tier || 'n/a',
        reference: node.reference || node.source || inherited.reference || null,
        note: node.note || null
      });
    };

    // Carry the table's own declarations down to its rows.
    const walk = (node, trail, inherited) => {
      if (Array.isArray(node)) return node.forEach((n, i) => walk(n, trail.concat(String(i)), inherited));
      if (!node || typeof node !== 'object') return;

      const here = {
        tier:      node.tier      || inherited.tier,
        unit:      node.unit      || inherited.unit,
        reference: node.reference || node.source || inherited.reference
      };

      if ('value' in node && typeof node.value !== 'object') {
        return push(trail.join('.') || table, node, here);
      }
      for (const [k, v] of Object.entries(node)) {
        if (k === 'description') continue;
        walk(v, k === 'rows' ? trail : trail.concat(k), here);
      }
    };

    walk(json, [], {});
  }
  return out;
}

/** Which lifecycle module a table feeds, for grouping the evidence. */
function _moduleForTable(table) {
  if (/transport|vehicle|density|mass/.test(table)) return 'A4';
  if (/waste/.test(table))                          return 'A5.3';
  if (/a5|site-energy/.test(table))                 return 'A5';
  if (/refrigerant/.test(table))                    return 'B1';
  if (/service-lives/.test(table))                  return 'B4';
  if (/water|occupan/.test(table))                  return 'B7';
  if (/beyond|b2|b5|b8/.test(table))                return 'Beyond PCAF';
  return 'general';
}


/**
 * Open items, read out of the factor store rather than listed by hand.
 *
 * A factor whose reference calls itself interim, a placeholder, a literature
 * assumption or a disabled module is an item of research still to do. Reading
 * them from the data means the roadmap shrinks on its own as factors are
 * replaced, instead of going stale in a document nobody updates.
 */
function _openItems(rows) {
  const flagged = rows.filter(r => /interim|placeholder|LITERATURE ASSUMPTION|INDICATIVE|DISABLED|HONESTY FLAG|research/i.test(String(r.reference || '')));

  // Group by the source text, since one flagged source usually covers a set.
  const grouped = new Map();
  for (const r of flagged) {
    const key = String(r.reference);
    if (!grouped.has(key)) grouped.set(key, { reference: key, tier: r.tier, module: r.module, keys: [] });
    grouped.get(key).keys.push(r.key);
  }

  const fromFactors = [...grouped.values()].map(g => ({
    kind: 'factor',
    module: g.module,
    item: g.keys.length > 3 ? `${g.keys.slice(0, 3).join(', ')} and ${g.keys.length - 3} more` : g.keys.join(', '),
    why: g.reference,
    resolution: /DISABLED/i.test(g.reference)
      ? 'Deliberately excluded. Reinstated only if a defined module and a robust factor appear.'
      : /placeholder|Sri Lanka/i.test(g.reference)
        ? 'Replace with a measured Sri Lankan figure. Ranked in the data-gap ledger by the emissions flowing through it.'
        : 'Replace with a primary or local measurement; the interim value is disclosed until then.',
    factors: g.keys.length
  }));

  const scope = [
    {
      kind: 'scope',
      module: 'A1–A3',
      item: 'Embodied product emissions are not computed.',
      why: 'Outside PCAF Part C for insurance-associated emissions. A separate service covers them for lending, with no import path into this engine.',
      resolution: 'Candidate future work if PCAF extends the insurance boundary. Kept out today so the reported figure matches the standard exactly.'
    },
    {
      kind: 'scope',
      module: 'B4.1',
      item: 'Component-by-component replacement is not included; B4 covers HVAC refrigerant re-release only.',
      why: 'B4.1 like-for-like replacement (RICS §5.2.4) needs a component schedule that a bill of quantities does not carry.',
      resolution: 'Add when a component schedule with service lives is available from the design team.'
    }
  ];

  return { total: fromFactors.length + scope.length, entries: [...fromFactors, ...scope] };
}


/**
 * Every factor row in the store, with its tier and named source.
 *
 * The annual disclosure needs the same register the methodology publishes;
 * exporting the harvest keeps one implementation rather than a second that
 * could disagree about what the store contains.
 */
function allFactorRows() {
  return factorStore.allRows ? factorStore.allRows() : _harvestFactorRows();
}

module.exports = { _harvestFactorRows, _moduleForTable, _openItems, allFactorRows };
