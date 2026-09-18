// @ts-check
/**
 * The gap register — what is blocking each project, and who holds the key.
 *
 * The ToR's stated gap for Lot 1 Milestone 4 is "lack of proper systems and
 * procedures to capture data", and the shape that gap takes in practice is a
 * worklist that lives in one person's head: which project is waiting on the
 * NDA's letter, which on a gender action plan nobody has commissioned, which
 * on a sign-off the assessor has not given. Four engines already answer those
 * questions one project at a time — what the stage needs (`readiness.js`),
 * what the six criteria lack (`criteria.js`), whether the assessment is signed
 * (`validation.js`) and what the assessor sent back (`return-loop.js`). This
 * module lays their answers side by side for the whole pipeline and counts.
 *
 * ── Composed, never judged ─────────────────────────────────────────────────
 *
 * Nothing here decides whether a fact is missing. Every item is one an engine
 * raised, carried with the clause that asks for it and the remedy that clears
 * it, and a test holds each to the engine it came from. A register that judged
 * afresh would be a second engine, and two engines disagreeing about whether a
 * letter is on file is how a committee stops trusting the screen.
 *
 * ── Who closes it is a closed vocabulary ───────────────────────────────────
 *
 * The question a chief executive asks of a blocked pipeline is not "what is
 * missing" but "who do I call". So every item names an owner from `OWNERS` —
 * the bank, the sponsor, the NDA, the Fund, the co-financiers, a gender
 * specialist, the affected communities, the assessor — and an item with an
 * owner outside that list is refused at construction rather than filed under
 * free text nobody can group on.
 *
 * ── Two horizons, never one count ──────────────────────────────────────────
 *
 * What blocks the next step (`now`) and what the stage after that will ask for
 * (`next`) are different facts: the first is a call to make this week, the
 * second is a plan. They are counted apart, and the headline is the first.
 */

'use strict';

const readiness = require('./readiness');
const criteria = require('./criteria');
const validation = require('./validation');
const returnLoop = require('./return-loop');
const cycle = require('./cycle');

/** Who can close a gap. The order is the order a register lists them in. */
const OWNERS = Object.freeze({
  dfcc: { label: 'DFCC Bank', who: 'The bank’s own deal team, sustainability unit or credit function' },
  sponsor: { label: 'Project sponsor', who: 'The developer or executing entity that owns the project' },
  nda: { label: 'National Designated Authority', who: 'The Ministry of Environment, through the Climate Change Secretariat' },
  fund: { label: 'Green Climate Fund', who: 'The Secretariat, the independent Technical Advisory Panel and the Board' },
  co_financiers: { label: 'Co-financiers', who: 'Each counterparty named on the financing plan' },
  gender_specialist: { label: 'Gender specialist', who: 'The specialist engaged for the gender assessment and action plan' },
  communities: { label: 'Affected communities', who: 'Consent reached through a facilitated process with the communities themselves' },
  assessor: { label: 'Assessor', who: 'The named person holding the validate permission' },
});
const OWNER_IDS = Object.freeze(Object.keys(OWNERS));

/** Where an item came from — the engine that raised it. */
const SOURCES = Object.freeze(['readiness', 'criteria', 'assessment', 'return', 'disclosure']);
const HORIZONS = Object.freeze(['now', 'next']);

const STATE_LABEL = Object.freeze({ draft: 'Draft', under_review: 'Under review', validated: 'Validated' });

/**
 * The sub-criteria the register reads off `criteria.js`, and who answers each.
 * Only the ones no stage requirement already asks for — the narratives for
 * the three unscored criteria, and the adaptation asset figures — so one
 * missing fact is one item and not two.
 */
const CRITERIA_OWNER = Object.freeze({
  scale_replication: 'dfcc', enabling: 'dfcc', cobenefits: 'dfcc', vulnerability: 'dfcc', assets_area: 'sponsor',
});

/**
 * One register item. Refuses an owner, a source or a horizon outside the
 * vocabulary, because a register nobody can group on is a list.
 * @param {{source:string, horizon:string, id:string, what:string, clause:string, remedy:string, status:string, owner:string}} fields
 */
function item(fields) {
  const { source, horizon, id, what, clause, remedy, status, owner } = fields;
  if (!OWNER_IDS.includes(owner)) throw new Error(`Gap "${id}" names an owner outside the vocabulary: "${owner}". One of: ${OWNER_IDS.join(', ')}.`);
  if (!SOURCES.includes(source)) throw new Error(`Gap "${id}" names a source outside the vocabulary: "${source}".`);
  if (!HORIZONS.includes(horizon)) throw new Error(`Gap "${id}" names a horizon outside the vocabulary: "${horizon}".`);
  if (!remedy) throw new Error(`Gap "${id}" carries no remedy — a gap that names no fix is a complaint.`);
  return { source, horizon, id, what, clause, remedy, status, owner, ownerLabel: OWNERS[owner].label };
}

/** A readiness requirement as a register item — the owner is the requirement's own. */
const fromReadiness = (b, horizon) => item({
  source: 'readiness', horizon, id: b.id, what: b.label, clause: b.clause, remedy: b.remedy, status: b.status, owner: b.owner,
});

/**
 * Every open item on one project, read off the four engines.
 * @param {any} project
 * @param {{now?: string}} [opts]
 */
function projectGaps(project, { now = new Date().toISOString() } = {}) {
  const r = readiness.assess(project, { now });
  const c = criteria.assess(project);
  const v = validation.current(project);
  const items = [];

  for (const b of r.blockers) items.push(fromReadiness(b, 'now'));
  if (r.next) for (const b of r.next.items.filter(i => i.status !== readiness.HELD)) items.push(fromReadiness(b, 'next'));

  for (const crit of c.criteria) {
    for (const s of crit.sub) {
      if (!CRITERIA_OWNER[s.id] || s.status === 'evidenced') continue;
      items.push(item({
        source: 'criteria', horizon: 'now', id: `${crit.id}.${s.id}`, what: s.label,
        clause: `GCF investment criterion — ${crit.label}`,
        remedy: s.status === 'absent' ? `Record ${s.label.toLowerCase()}.` : `Complete ${s.label.toLowerCase()} — it is only partly held.`,
        status: s.status, owner: CRITERIA_OWNER[s.id],
      }));
    }
  }

  if (v.state !== 'validated') {
    items.push(item({
      source: 'assessment', horizon: 'now', id: 'assessment_unsigned',
      what: `Assessment ${(STATE_LABEL[v.state] || v.state).toLowerCase()} — not signed off`,
      clause: 'The assessor validates the assessment before anything is submitted',
      remedy: v.state === 'draft' ? 'Send the assessment for review; the assessor then rates the six criteria and validates it.' : 'The assessor rates the six criteria, records a recommendation and validates the assessment.',
      status: 'missing', owner: 'assessor',
    }));
  } else {
    for (const g of returnLoop.gaps(project).items.filter(x => x.kind === 'rating')) {
      items.push(item({
        source: 'return', horizon: 'now', id: `rating.${g.criterionId}`, what: `${g.criterion} — rated weak by the assessor`,
        clause: 'Assessor validation — returned to the sponsor', remedy: g.remedy, status: 'partial', owner: 'sponsor',
      }));
    }
  }

  const info = cycle.stageInfo(project.stage);
  return {
    id: project.id, code: project.code, name: project.name, stream: project.stream,
    stage: project.stage, stageLabel: r.stageLabel, cycle: info ? info.cycle.n : null, daysInStage: r.daysInStage,
    assessment: { state: v.state, stateLabel: STATE_LABEL[v.state] || v.state },
    now: items.filter(i => i.horizon === 'now').length,
    next: items.filter(i => i.horizon === 'next').length,
    items,
  };
}

/**
 * The register for the whole pipeline: by project, furthest along first —
 * because the gap nearest the Board is the one that costs most — and by owner.
 *
 * `entityGaps` are the disclosure's own absences, handed in by the caller
 * because the disclosure is built a layer above this one. Only the facts the
 * bank has not stated are kept; a line the disclosure reports absent by rule
 * (the entity's own inventory, which no pipeline can supply) is not a gap
 * anyone can close here and is left out. They are the bank's to close and
 * are counted apart from the projects.
 * @param {any[]} projects
 * @param {{now?: string, entityGaps?: Array<{path:string, what:string, status?:string, standardRef?:string|null}>}} [opts]
 */
function register(projects, { now = new Date().toISOString(), entityGaps = [] } = {}) {
  const byProject = projects.map(p => projectGaps(p, { now }))
    .sort((a, b) => (b.cycle || 0) - (a.cycle || 0) || (b.daysInStage || 0) - (a.daysInStage || 0));

  /* Only what the bank has not *stated* is a gap it can close here. The
     inventory lines the disclosure reports absent are absent by rule — the
     entity's own scope 1, 2 and 3 come from the capital book on PCAF Part A
     attribution, not from a pipeline — and listing them as open items would
     hand the bank eight calls to make that nobody can answer. */
  const entity = (entityGaps || []).filter(g => g.status !== 'not_measured').map(g => item({
    source: 'disclosure', horizon: 'now', id: g.path, what: g.what, clause: g.standardRef || 'SLFRS S2',
    remedy: 'Record it on the entity facts; nothing is written on the bank’s behalf.', status: 'missing', owner: 'dfcc',
  }));

  const all = byProject.flatMap(p => p.items.map(i => ({ ...i, projectId: p.id, code: p.code })));
  const byOwner = OWNER_IDS.map(owner => {
    const mine = all.filter(i => i.owner === owner);
    const nowItems = mine.filter(i => i.horizon === 'now');
    return {
      owner, label: OWNERS[owner].label, who: OWNERS[owner].who,
      now: nowItems.length + (owner === 'dfcc' ? entity.length : 0),
      next: mine.filter(i => i.horizon === 'next').length,
      entity: owner === 'dfcc' ? entity.length : 0,
      projects: [...new Set(nowItems.map(i => i.code))],
    };
  }).sort((a, b) => b.now - a.now);

  const now_ = all.filter(i => i.horizon === 'now').length;
  return {
    totals: {
      now: now_ + entity.length,
      project: now_,
      next: all.filter(i => i.horizon === 'next').length,
      entity: entity.length,
      projects: byProject.length,
      blocked: byProject.filter(p => p.now > 0).length,
    },
    byOwner,
    byProject,
    entity: { count: entity.length, items: entity },
    owners: OWNERS,
    note: 'Every item is one an engine raised — the stage requirements, the six criteria, the assessor’s validation or the disclosure — with its clause and the fact that clears it. Nothing is judged afresh here, and a gap does not stop a stage move.',
  };
}

module.exports = { OWNERS, OWNER_IDS, SOURCES, HORIZONS, CRITERIA_OWNER, item, projectGaps, register };
