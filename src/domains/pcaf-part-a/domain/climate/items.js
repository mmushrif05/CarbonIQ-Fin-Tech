// @ts-check
/**
 * Every SLFRS S2 fact the reporting entity states, declared once.
 *
 * The normaliser that records an answer, the readiness the dashboard shows,
 * the provenance that tells the entity's own words from illustrative trial
 * content, and the sections the disclosure prints all read this one registry.
 * Declared three times they would drift, and the way that drift shows is a
 * screen reporting a pillar complete while the document prints it absent.
 *
 * Each item carries the paragraph that requires it, because a bank asked to
 * write four paragraphs about governance is entitled to know which clause it
 * is answering, and a reviewer is entitled to check the answer against the
 * standard rather than against our wording of it.
 *
 * `kind` is what the value is, not how a screen draws it: `text` is the
 * entity's own prose, `enum` is one id from a vocabulary list, `number` is a
 * figure, and `list` is a repeating block whose rows the entity adds. The form
 * chooses its own controls from that.
 */

'use strict';

const v = require('./vocabulary');

/** The four pillars, in the order S2 itself reads. */
const PILLARS = Object.freeze([
  { id: 'governance', label: 'Governance', paragraphs: 'S2 §5–7' },
  { id: 'strategy', label: 'Strategy', paragraphs: 'S2 §8–23' },
  { id: 'riskManagement', label: 'Risk management', paragraphs: 'S2 §24–26' },
  { id: 'metricsTargets', label: 'Metrics and targets', paragraphs: 'S2 §27–37' },
]);

/**
 * One row per fact. `path` is the key inside `climate`, dotted; it is the
 * identity of the item everywhere — in the store, in the provenance list and
 * on the form control that answers it.
 */
const ITEMS = Object.freeze([
  // ── Governance (§6) ──────────────────────────────────────────
  { path: 'governance.body', pillar: 'governance', paragraph: 'S2 §6(a)', kind: 'text', max: 300,
    label: 'The body or individual responsible for oversight',
    help: 'Name the board, committee or individual that oversees climate-related risks and opportunities.' },
  { path: 'governance.oversight', pillar: 'governance', paragraph: 'S2 §6(a)(i)–(iv)', kind: 'text', max: 4000,
    label: 'How that body exercises oversight',
    help: 'How responsibility is set out in terms of reference, how the body judges it has the right skills, and how it oversees targets and progress.' },
  { path: 'governance.frequency', pillar: 'governance', paragraph: 'S2 §6(a)(ii)', kind: 'enum', list: 'oversightFrequencies',
    label: 'How often the body is informed',
    help: 'How often climate-related risks and opportunities are reported to it.' },
  { path: 'governance.managementRole', pillar: 'governance', paragraph: 'S2 §6(b)', kind: 'text', max: 4000,
    label: 'Management\'s role',
    help: 'Which management positions hold responsibility, whether they report to the oversight body, and the controls and procedures used.' },

  // ── Strategy (§9–23) ─────────────────────────────────────────
  { path: 'strategy.horizonDefinitions', pillar: 'strategy', paragraph: 'S2 §10(b)', kind: 'text', max: 1000,
    label: 'How short, medium and long term are defined',
    help: 'The years each horizon covers, and how they relate to the planning horizons the entity already uses. The standard requires the entity to define these itself.' },
  { path: 'strategy.exposures', pillar: 'strategy', paragraph: 'S2 §10(a)–(c)', kind: 'list', of: 'exposure',
    label: 'The climate-related risks and opportunities identified',
    help: 'One row per risk or opportunity, each with its category and the horizon over which it could reasonably be expected to affect the entity.' },
  { path: 'strategy.businessModel', pillar: 'strategy', paragraph: 'S2 §13', kind: 'text', max: 4000,
    label: 'Effects on the business model and value chain',
    help: 'Current and anticipated effects, and where in the business model and value chain they are concentrated.' },
  { path: 'strategy.transitionPlan', pillar: 'strategy', paragraph: 'S2 §14(a)', kind: 'text', max: 4000,
    label: 'The climate-related transition plan',
    help: 'The plan, the assumptions it rests on and the dependencies it carries.' },
  { path: 'strategy.financialEffectsCurrent', pillar: 'strategy', paragraph: 'S2 §16(a)', kind: 'text', max: 4000,
    label: 'Effects on financial position, performance and cash flows for the period',
    help: 'Where quantification is not possible, S2 §19 permits a qualitative answer with the reason.' },
  { path: 'strategy.financialEffectsAnticipated', pillar: 'strategy', paragraph: 'S2 §16(b)', kind: 'text', max: 4000,
    label: 'Anticipated effects over the short, medium and long term',
    help: 'Including the effects already reflected in financial planning.' },
  { path: 'strategy.resilience', pillar: 'strategy', paragraph: 'S2 §22(a)', kind: 'text', max: 4000,
    label: 'The assessment of climate resilience',
    help: 'The entity\'s capacity to adjust to uncertainties, and where its strategy is sensitive.' },
  { path: 'strategy.scenarios', pillar: 'strategy', paragraph: 'S2 §22(b)', kind: 'text', max: 2000,
    label: 'The scenarios used in the resilience analysis',
    help: 'Which scenarios, their source, the time horizon and when the analysis was carried out.' },

  // ── Risk management (§25–26) ─────────────────────────────────
  { path: 'riskManagement.identification', pillar: 'riskManagement', paragraph: 'S2 §25(a)(i)–(iii)', kind: 'text', max: 4000,
    label: 'How climate-related risks are identified and assessed',
    help: 'The inputs and parameters used, whether scenario analysis informs it, and how likelihood and effect are assessed.' },
  { path: 'riskManagement.prioritisation', pillar: 'riskManagement', paragraph: 'S2 §25(a)(iv)', kind: 'text', max: 2000,
    label: 'How climate-related risks are prioritised against other risks',
    help: 'How a climate risk is weighed beside credit, market and operational risk.' },
  { path: 'riskManagement.monitoring', pillar: 'riskManagement', paragraph: 'S2 §25(a)(v)', kind: 'text', max: 2000,
    label: 'How climate-related risks are monitored',
    help: 'What is watched, by whom and how often.' },
  { path: 'riskManagement.opportunities', pillar: 'riskManagement', paragraph: 'S2 §25(b)', kind: 'text', max: 2000,
    label: 'How climate-related opportunities are identified and assessed',
    help: 'The same processes, as they apply to opportunities.' },
  { path: 'riskManagement.integration', pillar: 'riskManagement', paragraph: 'S2 §25(c)', kind: 'text', max: 2000,
    label: 'How the processes are integrated into overall risk management',
    help: 'Where this process sits inside the entity\'s enterprise risk framework.' },

  // ── Metrics: the entity's own inventory (§29(a)) ─────────────
  { path: 'inventory.scope1', pillar: 'metricsTargets', paragraph: 'S2 §29(a)(i)', kind: 'figure',
    label: 'Gross scope 1 emissions',
    help: 'The entity\'s own direct emissions for the period, in tonnes of CO2 equivalent.' },
  { path: 'inventory.scope2Location', pillar: 'metricsTargets', paragraph: 'S2 §29(a)(ii)', kind: 'figure',
    label: 'Gross scope 2 emissions, location-based',
    help: 'Purchased electricity, heat and steam on the grid average. Required by the standard.' },
  { path: 'inventory.scope2Market', pillar: 'metricsTargets', paragraph: 'S2 §29(a)(ii)', kind: 'figure', optional: true,
    label: 'Gross scope 2 emissions, market-based',
    help: 'Additional information where the entity holds contractual instruments.' },
  { path: 'inventory.scope3Other', pillar: 'metricsTargets', paragraph: 'S2 §29(a)(iv)', kind: 'figure',
    label: 'Scope 3 emissions other than category 15',
    help: 'Every scope 3 category apart from financed emissions, which this system measures from the register.' },

  // ── Metrics: the cross-industry metrics (§29(e)–(g)) ─────────
  { path: 'crossIndustry.capitalDeployed', pillar: 'metricsTargets', paragraph: 'S2 §29(e)', kind: 'figure',
    label: 'Capital deployed towards climate-related risks and opportunities',
    help: 'The amount of capital expenditure, financing or investment deployed in the period.' },
  { path: 'crossIndustry.carbonPrice', pillar: 'metricsTargets', paragraph: 'S2 §29(f)', kind: 'carbonPrice',
    label: 'Internal carbon price',
    help: 'Whether and how a carbon price is applied in decision-making, and the price used.' },
  { path: 'crossIndustry.remuneration', pillar: 'metricsTargets', paragraph: 'S2 §29(g)', kind: 'remuneration',
    label: 'Remuneration linked to climate considerations',
    help: 'Whether climate-related considerations are factored into remuneration, and the percentage recognised in the period.' },

  // ── Metrics: targets (§33–36) ────────────────────────────────
  { path: 'targets.entries', pillar: 'metricsTargets', paragraph: 'S2 §33–36', kind: 'list', of: 'target',
    label: 'The climate-related targets',
    help: 'One row per target, each with the metric, what it covers, its base year and target year, and progress against it.' },
  { path: 'targets.ghgBasis', pillar: 'metricsTargets', paragraph: 'S2 §36', kind: 'text', max: 2000,
    label: 'The basis of any greenhouse gas target',
    help: 'Which gases and scopes the target covers, whether it is gross or net, and the planned use of offsets and their nature.' },
]);

/** The rows of a repeating block, so the form and the normaliser agree. */
const ROW_SHAPES = Object.freeze({
  exposure: Object.freeze([
    { key: 'title', kind: 'text', max: 200, label: 'What it is', required: true },
    { key: 'nature', kind: 'enum', list: 'exposureNatures', label: 'Risk or opportunity', required: true },
    { key: 'riskKind', kind: 'enum', list: 'riskKinds', label: 'Category' },
    { key: 'horizon', kind: 'enum', list: 'horizons', label: 'Horizon', required: true },
    { key: 'description', kind: 'text', max: 2000, label: 'How it could affect the entity' },
  ]),
  target: Object.freeze([
    { key: 'name', kind: 'text', max: 200, label: 'Target', required: true },
    { key: 'metric', kind: 'text', max: 200, label: 'Metric' },
    { key: 'targetKind', kind: 'enum', list: 'targetKinds', label: 'Absolute or intensity', required: true },
    { key: 'scopeCovered', kind: 'enum', list: 'targetScopes', label: 'What it covers', required: true },
    { key: 'baseYear', kind: 'number', label: 'Base year' },
    { key: 'baseValue', kind: 'number', label: 'Base-year value' },
    { key: 'targetYear', kind: 'number', label: 'Target year' },
    { key: 'targetValue', kind: 'number', label: 'Target value' },
    { key: 'source', kind: 'enum', list: 'targetSources', label: 'Set by' },
    { key: 'validation', kind: 'enum', list: 'targetValidations', label: 'Third-party validation' },
    { key: 'validator', kind: 'text', max: 200, label: 'Validator' },
    { key: 'milestones', kind: 'text', max: 2000, label: 'Milestones and interim targets' },
    { key: 'progress', kind: 'text', max: 2000, label: 'Performance against the target' },
  ]),
});

const BY_PATH = new Map(ITEMS.map(i => [i.path, i]));
const itemsOfPillar = pillar => ITEMS.filter(i => i.pillar === pillar);
const listFor = name => /** @type {any[]} */ (/** @type {any} */ (v.VOCABULARY)[name] || []);

module.exports = { PILLARS, ITEMS, ROW_SHAPES, BY_PATH, itemsOfPillar, listFor };
