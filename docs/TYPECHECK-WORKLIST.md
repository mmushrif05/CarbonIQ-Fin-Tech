# Type-check worklist

Phase E5 of `docs/ENTERPRISE-READINESS.md` (gap G1). `npm run typecheck` runs the
TypeScript compiler over the JavaScript tree with `checkJs` off globally and on
per file: a file carrying `// @ts-check` is checked with JSDoc as its types. Every
file under `src/platform`, `src/shared`, the composition roots and the Netlify
functions carries it; so does every clean file elsewhere. The files below do not
yet — each is checked the day its errors are fixed, not by pragma — and
`tests/structure.test.js` holds this list to the tree: a file may leave it, never
join it unlisted.

Checked today: **192** files. Remaining: **77** (362 errors, mostly a property read off
an object whose shape was inferred from an empty literal — the fix is a JSDoc
`@type` on the literal or a `@param` on the function).

| File | Errors |
|---|---|
| `src/domains/capital/desk/adopt.js` | 3 |
| `src/domains/capital/desk/candidates.js` | 1 |
| `src/domains/capital/desk/position.js` | 2 |
| `src/domains/capital/domain/capital-basket.js` | 3 |
| `src/domains/capital/domain/capital-forecast.js` | 8 |
| `src/domains/capital/domain/capital-metrics.js` | 4 |
| `src/domains/capital/domain/capital-pipeline.js` | 2 |
| `src/domains/capital/infrastructure/capital-book.js` | 8 |
| `src/domains/capital/interface/routes/capital.js` | 17 |
| `src/domains/capital/interface/routes/desk.js` | 3 |
| `src/domains/gcf/application/cn-package.js` | 8 |
| `src/domains/gcf/application/reporting.js` | 4 |
| `src/domains/gcf/domain/instruments.js` | 2 |
| `src/domains/gcf/domain/record.js` | 4 |
| `src/domains/gcf/domain/screening.js` | 9 |
| `src/domains/gcf/infrastructure/store.js` | 1 |
| `src/domains/gcf/interface/routes/gcf.js` | 3 |
| `src/domains/lending/application/assurance.js` | 1 |
| `src/domains/lending/application/extract.js` | 2 |
| `src/domains/lending/application/reports.js` | 2 |
| `src/domains/lending/application/webhook.js` | 4 |
| `src/domains/lending/domain/decision-engine.js` | 14 |
| `src/domains/lending/interface/routes/covenant.js` | 3 |
| `src/domains/lending/interface/routes/extract-upload.js` | 1 |
| `src/domains/lending/interface/routes/portfolio.js` | 1 |
| `src/domains/pcaf-part-a/domain/archetypes.js` | 2 |
| `src/domains/pcaf-part-a/domain/attribution.js` | 9 |
| `src/domains/pcaf-part-a/domain/country-config.js` | 7 |
| `src/domains/pcaf-part-a/domain/data-quality.js` | 4 |
| `src/domains/pcaf-part-a/domain/emissions.js` | 3 |
| `src/domains/pcaf-part-a/domain/generation.js` | 15 |
| `src/domains/pcaf-part-a/domain/impact.js` | 11 |
| `src/domains/pcaf-part-a/domain/index.js` | 7 |
| `src/domains/pcaf-part-a/domain/listed-equity/classify.js` | 5 |
| `src/domains/pcaf-part-a/domain/listed-equity/denominator.js` | 6 |
| `src/domains/pcaf-part-a/domain/listed-equity/estimate.js` | 2 |
| `src/domains/pcaf-part-a/domain/listed-equity/index.js` | 2 |
| `src/domains/pcaf-part-a/domain/listed-equity/intensity.js` | 2 |
| `src/domains/pcaf-part-a/domain/listed-equity/lines.js` | 6 |
| `src/domains/pcaf-part-a/domain/listed-equity/options.js` | 2 |
| `src/domains/pcaf-part-a/domain/listed-equity/portfolio.js` | 2 |
| `src/domains/pcaf-part-c/agents/documents.js` | 9 |
| `src/domains/pcaf-part-c/agents/form.js` | 21 |
| `src/domains/pcaf-part-c/application/learning-store.js` | 2 |
| `src/domains/pcaf-part-c/application/methodology/demonstrations.js` | 4 |
| `src/domains/pcaf-part-c/application/methodology/factors.js` | 2 |
| `src/domains/pcaf-part-c/application/partc-assessments.js` | 9 |
| `src/domains/pcaf-part-c/application/partc-boq.js` | 4 |
| `src/domains/pcaf-part-c/application/partc-demo-data.js` | 1 |
| `src/domains/pcaf-part-c/application/partc-disclosure.js` | 3 |
| `src/domains/pcaf-part-c/application/partc-methodology.js` | 2 |
| `src/domains/pcaf-part-c/application/partc-registers.js` | 3 |
| `src/domains/pcaf-part-c/application/partc-registry.js` | 10 |
| `src/domains/pcaf-part-c/domain/a5-construction.js` | 4 |
| `src/domains/pcaf-part-c/domain/attribution.js` | 1 |
| `src/domains/pcaf-part-c/domain/b1-refrigerant.js` | 6 |
| `src/domains/pcaf-part-c/domain/b4-replacement.js` | 4 |
| `src/domains/pcaf-part-c/domain/b7-water.js` | 4 |
| `src/domains/pcaf-part-c/domain/beyond-pcaf.js` | 5 |
| `src/domains/pcaf-part-c/domain/conformance.js` | 2 |
| `src/domains/pcaf-part-c/domain/data-quality.js` | 7 |
| `src/domains/pcaf-part-c/domain/index.js` | 6 |
| `src/domains/pcaf-part-c/interface/routes/pcaf-partc/agents.js` | 2 |
| `src/domains/pcaf-part-c/interface/routes/pcaf-partc/runs.js` | 1 |
| `src/domains/pcaf-part-c/interface/routes/pcaf-partc.js` | 2 |
| `src/domains/pcaf-part-c/interface/schemas/partc-boq.js` | 1 |
| `src/domains/pcaf-part-c/interface/schemas/partc-registry.js` | 1 |
| `src/domains/pcaf-part-c/reporting/partc-methodology-doc.js` | 0 |
| `src/domains/pcaf-part-c/reporting/partc-reports.js` | 1 |
| `src/domains/pcaf-part-c/reporting/report-standard/facts.js` | 34 |
| `src/domains/pcaf-part-c/reporting/theme/word.js` | 1 |
| `src/domains/taxonomy/application/ndc-sdg.js` | 1 |
| `scripts/create-api-key.js` | 3 |
| `scripts/generate-conformance-doc.js` | 1 |
| `scripts/generate-gcf-conformance-doc.js` | 7 |
| `scripts/migrate-to-postgres.js` | 2 |
| `scripts/seed-partc-demo.js` | 1 |
