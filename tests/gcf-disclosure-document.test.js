/**
 * The GCF pipeline disclosure as a document.
 *
 * What is pinned:
 *   • the document prints what the report says and no more — the inventory
 *     lines absent with their source, the avoided line apart, the two NDC
 *     ledgers never summed, a statement the entity has not made printed as
 *     not stated with its clause;
 *   • the entity's own words reach the page, and endorsement language in
 *     them refuses the whole document naming the phrase;
 *   • the checklist is answered from the document, so it can fail;
 *   • one position renders to one reference;
 *   • the outline is held to a committed golden (UPDATE_GOLDEN=1 regenerates);
 *   • the route serves JSON, PDF and Word and refuses an unknown format.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const platformStore = require('../src/platform/database/store');
const gcf = require('../src/domains/gcf/infrastructure/store');
const docm = require('../src/domains/gcf/application/disclosure-document');
const { api, auth } = require('./helpers/api');

const SEED = require('../data/gcf/pipeline.seed.json');
const NOW = '2026-09-14T00:00:00.000Z';
const UPDATE = process.env.UPDATE_GOLDEN === '1';
const GOLDEN = path.join(__dirname, 'golden', 'gcf-disclosure.txt');

const ENTITY = {
  entityName: 'DFCC Bank PLC',
  climateGovernance: 'The Board Integrated Risk Management Committee reviews climate-related matters quarterly.',
  managementRole: 'The Chief Risk Officer holds the mandate for climate risk.',
  strategyNarrative: 'Green finance origination through the GCF accreditation.',
  riskManagementProcess: 'Taxonomy screening at origination; ESS categorisation at appraisal.',
  climateTargets: ['Portfolio alignment with the Sri Lanka Green Finance Taxonomy'],
};
const ASSURANCE = { mode: 'self_declared', label: 'Self-declared', statement: 'The figures rest on the entity’s own values.' };

const facts = (over = {}) => docm.disclosureFacts(SEED.projects, {
  reportingYear: 2026, accreditation: SEED._meta.accreditation, source: 'seed', sample: true,
  sampleNote: SEED._meta.sampleNote, now: NOW, assurance: ASSURANCE, ...over,
});
const flat = model => JSON.stringify(model.sections.map(s => s.blocks));
const collect = doc => new Promise((resolve, reject) => {
  const chunks = []; doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
});
const bin = () => (res, cb) => { const d = []; res.on('data', c => d.push(c)); res.on('end', () => cb(null, Buffer.concat(d))); };

beforeEach(() => platformStore._resetMemory());

describe('The document says what the report says, and no more', () => {
  test('the inventory lines are absent with their source, the avoided line is apart, and the two ledgers are never summed', () => {
    const model = docm.buildModel(facts());
    const inv = model.sections.find(s => s.id === 'inventory');
    const table = inv.blocks.find(x => x.kind === 'table');
    expect(table.rows).toHaveLength(3);
    for (const r of table.rows) expect(r[1]).toBe('Absent');
    expect(table.rows[2][2]).toMatch(/Category 15/);

    const avoided = model.sections.find(s => s.id === 'avoided');
    expect(avoided.blocks[0].kind).toBe('callout');
    expect(avoided.blocks[0].title).toMatch(/Never netted/);
    const rows = avoided.blocks.find(x => x.kind === 'table').rows;
    expect(rows.some(r => /Adaptation co-benefit/.test(r[0]))).toBe(true);
    expect(rows.some(r => /Embodied carbon/.test(r[0]))).toBe(true);

    const targets = model.sections.find(s => s.id === 'targets');
    const ledgers = targets.blocks.find(x => x.kind === 'table').rows;
    expect(ledgers.map(r => r[0])).toEqual(['Reduction against BAU', 'Increase in net removal']);
    expect(ledgers.some(r => /total|combined|sum/i.test(r[0]))).toBe(false);
    expect(ledgers[0][3]).toMatch(/^Absent/);
  });

  test('a statement the entity has not made is printed as not stated with its clause, never written for it', () => {
    const model = docm.buildModel(facts());
    const gov = model.sections.find(s => s.id === 'governance');
    const callouts = gov.blocks.filter(x => x.kind === 'callout');
    expect(callouts).toHaveLength(2);
    expect(callouts[0].title).toMatch(/not stated/);
    expect(callouts[0].text).toMatch(/SLFRS S2 §6\(a\)/);
    expect(model.cover.insurer).toBe('Not stated');
    expect(flat(model)).not.toMatch(/board meets|ESG team|quarterly/i);
  });

  test('the entity’s own words reach the page', () => {
    const model = docm.buildModel(facts({ entityDisclosures: ENTITY }));
    expect(model.cover.insurer).toBe('DFCC Bank PLC');
    const gov = model.sections.find(s => s.id === 'governance');
    expect(gov.blocks[1].text).toMatch(/Integrated Risk Management Committee/);
    expect(gov.blocks[1].title).toBe('Board oversight');
  });

  test('endorsement language in an entity statement refuses the whole document, naming the phrase', () => {
    expect(() => facts({ entityDisclosures: { ...ENTITY, strategyNarrative: 'Our approach is PCAF approved.' } }))
      .toThrow(/endorsement language/);
    try { facts({ entityDisclosures: { ...ENTITY, strategyNarrative: 'Our approach is PCAF approved.' } }); }
    catch (err) { expect(err.statusCode).toBe(422); expect(err.code).toBe('FORBIDDEN_LANGUAGE'); expect(err.message).toMatch(/PCAF approved/i); }
  });

  test('the checklist is answered from the document, so it can fail', () => {
    const bare = docm.buildModel(facts()).checklist;
    const stated = docm.buildModel(facts({ entityDisclosures: ENTITY })).checklist;
    expect(bare.summary.answeredNo).toBeGreaterThan(stated.summary.answeredNo);
    expect(stated.items.find(i => /scope 1, 2 and 3/.test(i.item)).answer).toBe('No');
    expect(stated.items.find(i => /reporting entity/.test(i.item)).answer).toBe('Yes');
    for (const i of bare.items.filter(i => i.answer === 'No')) expect(i.justification).toBeTruthy();
  });

  test('one position renders to one reference, and a changed position to another', () => {
    const a = facts(); const b = facts();
    expect(a.reportId).toBe(b.reportId);
    expect(a.reportId).toMatch(/^GCF-DISC-[0-9A-F]{12}$/);
    const c = facts({ entityDisclosures: ENTITY });
    expect(c.reportId).not.toBe(a.reportId);
  });

  test('every figure on the page is one the report or the portfolio returned', () => {
    const f = facts();
    const model = docm.buildModel(f);
    const m = f.report.metricsAndTargets;
    const avoided = model.sections.find(s => s.id === 'avoided').blocks.find(x => x.kind === 'table').rows[0];
    expect(avoided[1]).toBe(`${m.avoidedAndReduced.annual_tCO2e.toLocaleString('en-US')} tCO₂e`);
    const capital = model.sections.find(s => s.id === 'capital').blocks.find(x => x.kind === 'bars');
    expect(capital.rows.map(r => r.value)).toEqual([m.capitalDeployment.gcfAsk, m.capitalDeployment.dfccCommitment, m.capitalDeployment.otherSources]);
    const annex = model.annexes.find(a => a.id === 'annexRegister').blocks.find(x => x.kind === 'table');
    expect(annex.rows).toHaveLength(f.portfolio.count);
  });

  test('the gap register is on the page, by who holds the key', () => {
    const model = docm.buildModel(facts());
    const g = model.sections.find(s => s.id === 'gaps');
    const owners = g.blocks.filter(x => x.kind === 'table')[1];
    expect(owners.head[0]).toBe('Who closes it');
    expect(owners.rows.length).toBeGreaterThan(0);
  });

  test('the outline is held to the golden', () => {
    const model = docm.buildModel(facts({ entityDisclosures: ENTITY }));
    const lines = [];
    lines.push(`cover: ${model.cover.title} | ${model.cover.insurer} | FY${model.cover.reportingYear} | ${model.cover.assuranceLabel}`);
    const walk = (blocks, indent) => {
      for (const blk of blocks) {
        if (blk.kind === 'table') { lines.push(`${indent}table: ${blk.head.join(' | ')}`); for (const r of blk.rows) lines.push(`${indent}  ${r.join(' | ')}`); }
        else if (blk.kind === 'bars') { lines.push(`${indent}bars: ${blk.label}`); for (const r of blk.rows) lines.push(`${indent}  ${r.label} | ${r.value}`); }
        else if (blk.kind === 'callout') lines.push(`${indent}callout: ${blk.title || ''}`);
        else lines.push(`${indent}${blk.kind}`);
      }
    };
    for (const s of model.sections) { lines.push(`section ${s.id}: ${s.title}`); walk(s.blocks, '  '); }
    for (const a of model.annexes) { lines.push(`annex ${a.annex}: ${a.title}`); walk(a.blocks, '  '); }
    lines.push(`checklist: ${model.checklist.summary.answeredYes} yes of ${model.checklist.summary.total}`);
    for (const i of model.checklist.items) lines.push(`  ${i.id} ${i.answer} — ${i.item}`);
    const produced = lines.join('\n') + '\n';
    if (UPDATE || !fs.existsSync(GOLDEN)) fs.writeFileSync(GOLDEN, produced);
    expect(produced).toBe(fs.readFileSync(GOLDEN, 'utf8'));
  });

  test('the PDF and the Word document are well formed', async () => {
    const pdf = await collect(await docm.disclosurePDF('ui', SEED.projects, { reportingYear: 2026, accreditation: SEED._meta.accreditation, now: NOW }));
    expect(pdf.length).toBeGreaterThan(10000);
    expect(pdf.slice(0, 5).toString()).toBe('%PDF-');
    const word = await docm.disclosureDOCX('ui', SEED.projects, { reportingYear: 2026, accreditation: SEED._meta.accreditation, now: NOW });
    expect(word.length).toBeGreaterThan(1000);
    expect(word.subarray(0, 2).toString('latin1')).toBe('PK');
  });
});

describe('Over HTTP', () => {
  test('JSON by default, a PDF and a Word document on request', async () => {
    const j = (await auth(api().get('/v1/gcf/report?year=2026')).expect(200)).body;
    expect(j.report.checklist).toBeTruthy();
    const pdf = await auth(api().get('/v1/gcf/report?year=2026&format=pdf')).buffer(true).parse(bin()).expect(200);
    expect(pdf.headers['content-type']).toMatch(/application\/pdf/);
    expect(pdf.headers['content-disposition']).toMatch(/gcf-disclosure-2026\.pdf/);
    expect(pdf.body.slice(0, 5).toString()).toBe('%PDF-');
    const word = await auth(api().get('/v1/gcf/report?year=2026&format=word')).buffer(true).parse(bin()).expect(200);
    expect(word.headers['content-type']).toMatch(/wordprocessingml/);
  });

  test('the entity’s facts reach the document, and endorsement language is refused at the route', async () => {
    await auth(api().put('/v1/gcf/entity')).send(ENTITY).expect(200);
    const pdf = await auth(api().get('/v1/gcf/report?format=pdf')).buffer(true).parse(bin()).expect(200);
    expect(pdf.body.length).toBeGreaterThan(10000);
    await auth(api().put('/v1/gcf/entity')).send({ ...ENTITY, strategyNarrative: 'Certified by PCAF.' }).expect(200);
    const r = await auth(api().get('/v1/gcf/report?format=pdf')).expect(422);
    expect(r.body.error).toBe('FORBIDDEN_LANGUAGE');
  });

  test('a recorded book renders as recorded, and an unknown format is refused', async () => {
    await gcf.installStarter('ui', { by: 'Analyst' });
    const pdf = await auth(api().get('/v1/gcf/report?format=pdf')).buffer(true).parse(bin()).expect(200);
    expect(pdf.body.slice(0, 5).toString()).toBe('%PDF-');
    const r = await auth(api().get('/v1/gcf/report?format=xls')).expect(400);
    expect(r.body.error).toBe('INVALID_FORMAT');
  });
});
