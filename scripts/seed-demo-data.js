#!/usr/bin/env node
/**
 * CarbonIQ FinTech — Demo Data Seeder
 *
 * Seeds Firebase with realistic demo projects so the Dashboard, Portfolio,
 * Monitoring, PCAF, and Taxonomy pages have data to display.
 *
 * Usage:
 *   node scripts/seed-demo-data.js
 *   node scripts/seed-demo-data.js --clear   ← wipes existing demo data first
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const config = require('../config');

// ── Demo Data ────────────────────────────────────────────────────────────────

const DEMO_PROJECTS = [
  {
    id: 'demo-SG-2024-001',
    name: 'Marina Bay Tower',
    projectId: 'SG-2024-001',
    type: 'Commercial',
    region: 'Singapore',
    phase: 'Operational',
    floorArea: 45000,
    loanOutstanding: 50000000,
    totalEquity: 80000000,
    totalDebt: 120000000,
    currency: 'USD',
    annualEmissions: 10000,
    scope1: 3000,
    scope2: 5000,
    scope3: 2000,
    dataQuality: 1,
    embodiedCarbon: 361300,
    materials: [
      { name: 'Concrete C30/37', category: 'Concrete', qty: 850000, unit: 'kg', factor: 0.13, total: 110500 },
      { name: 'Rebar Steel',     category: 'Steel',    qty: 120000, unit: 'kg', factor: 1.55, total: 186000 },
      { name: 'Float Glass',     category: 'Glass',    qty: 45000,  unit: 'kg', factor: 1.44, total: 64800  }
    ],
    monitoringHistory: [
      { year: 2024, outstanding: 62000000, equity: 80000000, debt: 120000000, attribution: 0.31, emissions: 10500, financed: 3255, dq: 4 },
      { year: 2025, outstanding: 56000000, equity: 80000000, debt: 120000000, attribution: 0.28, emissions: 10180, financed: 2850, dq: 3 },
      { year: 2026, outstanding: 50000000, equity: 80000000, debt: 120000000, attribution: 0.25, emissions: 10000, financed: 2500, dq: 1 }
    ],
    cfsScore: 78,
    cfsBand: 'Green',
    taxonomyResults: {
      eu:    { threshold: 450, actual: 380, aligned: true,  status: 'Aligned'    },
      asean: { threshold: 600, actual: 380, aligned: true,  status: 'Aligned'    },
      hk:    { threshold: 500, actual: 380, aligned: true,  status: 'Near Limit' },
      sg:    { threshold: 480, actual: 380, aligned: true,  status: 'Aligned'    }
    },
    status: 'On Track',
    createdAt: '2024-01-15T08:00:00.000Z',
    updatedAt: '2026-01-10T08:00:00.000Z'
  },
  {
    id: 'demo-SG-2024-017',
    name: 'Orchard Green Residences',
    projectId: 'SG-2024-017',
    type: 'Residential',
    region: 'Singapore',
    phase: 'Construction',
    floorArea: 28000,
    loanOutstanding: 32000000,
    totalEquity: 40000000,
    totalDebt: 40000000,
    currency: 'USD',
    annualEmissions: 4600,
    scope1: 1380,
    scope2: 2300,
    scope3: 920,
    dataQuality: 3,
    embodiedCarbon: 210000,
    materials: [
      { name: 'Concrete C25/30', category: 'Concrete', qty: 600000, unit: 'kg', factor: 0.13, total: 78000 },
      { name: 'Structural Steel', category: 'Steel',   qty: 80000,  unit: 'kg', factor: 1.55, total: 124000 },
      { name: 'Timber Frame',     category: 'Timber',  qty: 20000,  unit: 'kg', factor: 0.40, total: 8000   }
    ],
    monitoringHistory: [
      { year: 2024, outstanding: 38000000, equity: 40000000, debt: 40000000, attribution: 0.475, emissions: 4800, financed: 2280, dq: 4 },
      { year: 2025, outstanding: 35000000, equity: 40000000, debt: 40000000, attribution: 0.4375, emissions: 4700, financed: 2056, dq: 3 }
    ],
    cfsScore: 62,
    cfsBand: 'Transition',
    taxonomyResults: {
      eu:    { threshold: 450, actual: 420, aligned: true,  status: 'Aligned'    },
      asean: { threshold: 600, actual: 420, aligned: true,  status: 'Aligned'    },
      hk:    { threshold: 500, actual: 420, aligned: true,  status: 'Aligned'    },
      sg:    { threshold: 480, actual: 420, aligned: true,  status: 'Near Limit' }
    },
    status: 'Review',
    createdAt: '2024-03-20T08:00:00.000Z',
    updatedAt: '2025-11-05T08:00:00.000Z'
  },
  {
    id: 'demo-SG-2025-003',
    name: 'Jurong Data Centre',
    projectId: 'SG-2025-003',
    type: 'Industrial',
    region: 'Singapore',
    phase: 'Construction',
    floorArea: 35000,
    loanOutstanding: 75000000,
    totalEquity: 100000000,
    totalDebt: 150000000,
    currency: 'USD',
    annualEmissions: 14000,
    scope1: 1400,
    scope2: 9800,
    scope3: 2800,
    dataQuality: 4,
    embodiedCarbon: 580000,
    materials: [
      { name: 'Reinforced Concrete', category: 'Concrete', qty: 1200000, unit: 'kg', factor: 0.13, total: 156000 },
      { name: 'Structural Steel',    category: 'Steel',    qty: 250000,  unit: 'kg', factor: 1.55, total: 387500 },
      { name: 'Copper Wiring',       category: 'Metals',   qty: 15000,   unit: 'kg', factor: 2.43, total: 36450  }
    ],
    monitoringHistory: [
      { year: 2025, outstanding: 75000000, equity: 100000000, debt: 150000000, attribution: 0.30, emissions: 14000, financed: 4200, dq: 4 }
    ],
    cfsScore: 38,
    cfsBand: 'Brown',
    taxonomyResults: {
      eu:    { threshold: 450, actual: 520, aligned: false, status: 'Not Aligned' },
      asean: { threshold: 600, actual: 520, aligned: true,  status: 'Aligned'     },
      hk:    { threshold: 500, actual: 520, aligned: false, status: 'Not Aligned' },
      sg:    { threshold: 480, actual: 520, aligned: false, status: 'Not Aligned' }
    },
    status: 'High Risk',
    createdAt: '2025-02-01T08:00:00.000Z',
    updatedAt: '2025-10-15T08:00:00.000Z'
  },
  {
    id: 'demo-SG-2025-011',
    name: 'Sentosa Solar Farm',
    projectId: 'SG-2025-011',
    type: 'Infrastructure',
    region: 'Singapore',
    phase: 'Operational',
    floorArea: 12000,
    loanOutstanding: 18500000,
    totalEquity: 25000000,
    totalDebt: 25000000,
    currency: 'USD',
    annualEmissions: 500,
    scope1: 0,
    scope2: 150,
    scope3: 350,
    dataQuality: 2,
    embodiedCarbon: 45000,
    materials: [
      { name: 'Solar Panels (mono-Si)', category: 'Other', qty: 8000, unit: 'kg', factor: 1.80, total: 14400 },
      { name: 'Aluminium Frame',        category: 'Metals', qty: 6500, unit: 'kg', factor: 4.67, total: 30355 }
    ],
    monitoringHistory: [
      { year: 2025, outstanding: 20000000, equity: 25000000, debt: 25000000, attribution: 0.40, emissions: 550, financed: 220, dq: 2 },
      { year: 2026, outstanding: 18500000, equity: 25000000, debt: 25000000, attribution: 0.37, emissions: 500, financed: 185, dq: 2 }
    ],
    cfsScore: 91,
    cfsBand: 'Green',
    taxonomyResults: {
      eu:    { threshold: 450, actual: 45,  aligned: true, status: 'Aligned' },
      asean: { threshold: 600, actual: 45,  aligned: true, status: 'Aligned' },
      hk:    { threshold: 500, actual: 45,  aligned: true, status: 'Aligned' },
      sg:    { threshold: 480, actual: 45,  aligned: true, status: 'Aligned' }
    },
    status: 'On Track',
    createdAt: '2025-05-10T08:00:00.000Z',
    updatedAt: '2026-01-20T08:00:00.000Z'
  },
  {
    id: 'demo-MY-2024-042',
    name: 'KL Metro Extension',
    projectId: 'MY-2024-042',
    type: 'Infrastructure',
    region: 'Malaysia',
    phase: 'Construction',
    floorArea: 0,
    loanOutstanding: 120000000,
    totalEquity: 200000000,
    totalDebt: 300000000,
    currency: 'USD',
    annualEmissions: 35000,
    scope1: 10500,
    scope2: 14000,
    scope3: 10500,
    dataQuality: 5,
    embodiedCarbon: 2100000,
    materials: [
      { name: 'Concrete (Mass)',  category: 'Concrete', qty: 5000000, unit: 'kg', factor: 0.13, total: 650000 },
      { name: 'Structural Steel', category: 'Steel',    qty: 800000,  unit: 'kg', factor: 1.55, total: 1240000 },
      { name: 'Bitumen',          category: 'Other',    qty: 120000,  unit: 'kg', factor: 1.75, total: 210000  }
    ],
    monitoringHistory: [
      { year: 2024, outstanding: 150000000, equity: 200000000, debt: 300000000, attribution: 0.30, emissions: 38000, financed: 11400, dq: 5 },
      { year: 2025, outstanding: 130000000, equity: 200000000, debt: 300000000, attribution: 0.26, emissions: 36000, financed: 9360,  dq: 5 }
    ],
    cfsScore: 22,
    cfsBand: 'Brown',
    taxonomyResults: {
      eu:    { threshold: 450, actual: 680, aligned: false, status: 'Not Aligned' },
      asean: { threshold: 600, actual: 680, aligned: false, status: 'Not Aligned' },
      hk:    { threshold: 500, actual: 680, aligned: false, status: 'Not Aligned' },
      sg:    { threshold: 480, actual: 680, aligned: false, status: 'Not Aligned' }
    },
    status: 'High Risk',
    createdAt: '2024-06-01T08:00:00.000Z',
    updatedAt: '2025-12-10T08:00:00.000Z'
  }
];

// ── Firebase Init ────────────────────────────────────────────────────────────

async function getDb() {
  const admin = require('firebase-admin');
  if (admin.apps.length === 0) {
    if (!config.firebase.serviceAccount) {
      console.error('\x1b[31m✗ FIREBASE_SERVICE_ACCOUNT is not set.\x1b[0m');
      console.error('  Fill in your .env file first, then run this script.\n');
      process.exit(1);
    }
    const decoded = Buffer.from(config.firebase.serviceAccount, 'base64').toString('utf8');
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(decoded)),
      databaseURL: config.firebase.databaseURL
    });
  }
  return admin.database();
}

// ── Seeder ───────────────────────────────────────────────────────────────────

async function seed(clearFirst = false) {
  console.log('\n\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
  console.log('\x1b[36m  CarbonIQ FinTech — Demo Data Seeder\x1b[0m');
  console.log('\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');

  const db = await getDb();

  if (clearFirst) {
    console.log('  Clearing existing demo data...');
    await db.ref('fintech/projects').remove();
    await db.ref('fintech/pcaf').remove();
    await db.ref('fintech/scores').remove();
    await db.ref('fintech/monitoring').remove();
    await db.ref('fintech/taxonomyResults').remove();
    console.log('  \x1b[32m✓\x1b[0m  Cleared\n');
  }

  let seeded = 0;

  for (const project of DEMO_PROJECTS) {
    // Project record
    await db.ref(`fintech/projects/${project.id}`).set({
      id:             project.id,
      projectId:      project.projectId,
      name:           project.name,
      type:           project.type,
      region:         project.region,
      phase:          project.phase,
      floorArea:      project.floorArea,
      currency:       project.currency,
      embodiedCarbon: project.embodiedCarbon,
      materials:      project.materials,
      cfsScore:       project.cfsScore,
      cfsBand:        project.cfsBand,
      status:         project.status,
      createdAt:      project.createdAt,
      updatedAt:      project.updatedAt,
      orgId:          'demo-org'
    });

    // Latest PCAF record
    const attribution = project.loanOutstanding / (project.totalEquity + project.totalDebt);
    await db.ref(`fintech/pcaf/latest-${project.id}`).set({
      id:                   `latest-${project.id}`,
      projectId:            project.id,
      projectName:          project.name,
      outstandingAmount:    project.loanOutstanding,
      totalEquity:          project.totalEquity,
      totalDebt:            project.totalDebt,
      currency:             project.currency,
      annualEmissions:      project.annualEmissions,
      attributionFactor:    Math.round(attribution * 1000) / 1000,
      financedEmissions:    Math.round(project.annualEmissions * attribution),
      dataQualityScore:     project.dataQuality,
      physicalIntensity:    project.floorArea > 0 ? Math.round(project.annualEmissions / (project.floorArea / 1000)) : null,
      economicIntensity:    Math.round(project.annualEmissions / (project.loanOutstanding / 1e6) * 10) / 10,
      scope1:               project.scope1,
      scope2:               project.scope2,
      scope3:               project.scope3,
      phase:                project.phase,
      projectType:          project.type,
      pcafVersion:          '3.0',
      createdAt:            project.updatedAt,
      orgId:                'demo-org'
    });

    // Monitoring history
    for (const record of project.monitoringHistory) {
      await db.ref(`fintech/monitoring/${project.id}/${record.year}`).set({
        year:           record.year,
        projectId:      project.id,
        outstanding:    record.outstanding,
        equity:         record.equity,
        debt:           record.debt,
        attribution:    record.attribution,
        emissions:      record.emissions,
        financedEmissions: record.financed,
        dataQuality:    record.dq,
        recordedAt:     `${record.year}-12-31T00:00:00.000Z`
      });
    }

    // Taxonomy results
    await db.ref(`fintech/taxonomyResults/${project.id}/latest`).set({
      projectId:  project.id,
      projectName: project.name,
      checkedAt:  project.updatedAt,
      results:    project.taxonomyResults
    });

    console.log(`  \x1b[32m✓\x1b[0m  ${project.name} (${project.projectId})`);
    seeded++;
  }

  // Portfolio snapshot
  const totalFinanced = DEMO_PROJECTS.reduce((sum, p) => {
    const attr = p.loanOutstanding / (p.totalEquity + p.totalDebt);
    return sum + Math.round(p.annualEmissions * attr);
  }, 0);

  const totalOutstanding = DEMO_PROJECTS.reduce((sum, p) => sum + p.loanOutstanding, 0);

  const dqCounts = [0, 0, 0, 0, 0];
  DEMO_PROJECTS.forEach(p => dqCounts[p.dataQuality - 1]++);

  const regionCounts = {};
  DEMO_PROJECTS.forEach(p => { regionCounts[p.region] = (regionCounts[p.region] || 0) + 1; });

  await db.ref('fintech/portfolioSnapshots/demo-org/latest').set({
    orgId:             'demo-org',
    snapshotDate:      new Date().toISOString().split('T')[0],
    totalProjects:     DEMO_PROJECTS.length,
    totalOutstanding,
    totalFinancedEmissions: totalFinanced,
    economicIntensity: Math.round(totalFinanced / (totalOutstanding / 1e6) * 10) / 10,
    weightedDQ:        (DEMO_PROJECTS.reduce((s, p) => s + p.dataQuality, 0) / DEMO_PROJECTS.length).toFixed(1),
    dqDistribution:    { dq1: dqCounts[0], dq2: dqCounts[1], dq3: dqCounts[2], dq4: dqCounts[3], dq5: dqCounts[4] },
    byRegion:          regionCounts,
    byType: {
      Commercial:    DEMO_PROJECTS.filter(p => p.type === 'Commercial').length,
      Residential:   DEMO_PROJECTS.filter(p => p.type === 'Residential').length,
      Industrial:    DEMO_PROJECTS.filter(p => p.type === 'Industrial').length,
      Infrastructure: DEMO_PROJECTS.filter(p => p.type === 'Infrastructure').length
    },
    coverage:          100,
    createdAt:         new Date().toISOString()
  });

  console.log('\n  \x1b[32m✓\x1b[0m  Portfolio snapshot written');
  console.log(`\n\x1b[32m  ✅ Seeded ${seeded} projects into Firebase.\x1b[0m`);
  console.log('\n  Now run: npm start  and open http://localhost:3001\n');
}

// ── Run ──────────────────────────────────────────────────────────────────────

const clearFirst = process.argv.includes('--clear');
seed(clearFirst).then(() => process.exit(0)).catch(err => {
  console.error('\x1b[31m  Error:\x1b[0m', err.message);
  process.exit(1);
});
