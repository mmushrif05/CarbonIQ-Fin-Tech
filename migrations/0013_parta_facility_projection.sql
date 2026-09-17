-- PCAF Part A — the facility's summary, in the projection.
--
-- The facility behind a loan (the commitment, the drawn amount, the repayment
-- profile) gives the register two things a reporting-year position needs and
-- cannot read from the emissions figures: the §6.2 undrawn loan commitment,
-- summed apart from the drawn figure and never with it, and whether each
-- year-end balance was read from the loan account or taken from the schedule,
-- which the disclosure has to say before it is filed. Both are computed once
-- at write time under result.facility.summary and projected here, so the
-- roll-up reads them from the same column it already reads rather than
-- pulling every record back for two fields.
--
-- Dropped and rebuilt rather than the function replaced, for the reason 0012
-- records: a generated column does not recompute when its function changes.

ALTER TABLE parta_exposures DROP COLUMN rollup;
DROP FUNCTION IF EXISTS parta_exposure_rollup(jsonb);

CREATE FUNCTION parta_exposure_rollup(data jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT COALESCE((SELECT jsonb_object_agg(key, value) FROM jsonb_each(data)
                   WHERE key = ANY (ARRAY['exposureId','status','reportingYear','assetClass',
                                          'financialSector','createdAt','climate'])), '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object('result', jsonb_build_object(
           'facility', jsonb_build_object('summary', data #> '{result,facility,summary}'),
           'exposure', jsonb_build_object(
             'kind',       data #> '{result,exposure,kind}',
             'instrument', data #> '{result,exposure,instrument}',
             'counterparty', jsonb_build_object(
               'name',                 data #> '{result,exposure,counterparty,name}',
               'sector',               data #> '{result,exposure,counterparty,sector}',
               'sectorKey',            data #> '{result,exposure,counterparty,sectorKey}',
               'naceL2',               data #> '{result,exposure,counterparty,naceL2}',
               'borrowerType',         data #> '{result,exposure,counterparty,borrowerType}',
               'financialInstitution', data #> '{result,exposure,counterparty,financialInstitution}'),
             'outstanding', jsonb_build_object('value', data #> '{result,exposure,outstanding,value}')),
           'attribution', jsonb_build_object('value', data #> '{result,attribution,value}'),
           'inventory', jsonb_build_object(
             'scope1',           jsonb_build_object('value', data #> '{result,inventory,scope1,value}',           'absent', data #> '{result,inventory,scope1,absent}'),
             'scope2',           jsonb_build_object('value', data #> '{result,inventory,scope2,value}',           'absent', data #> '{result,inventory,scope2,absent}'),
             'scope1And2',       jsonb_build_object('value', data #> '{result,inventory,scope1And2,value}',       'absent', data #> '{result,inventory,scope1And2,absent}'),
             'scope3',           jsonb_build_object('value', data #> '{result,inventory,scope3,value}',           'absent', data #> '{result,inventory,scope3,absent}'),
             'removals',         jsonb_build_object('value', data #> '{result,inventory,removals,value}',         'absent', data #> '{result,inventory,removals,absent}'),
             'creditsRetired',   jsonb_build_object('value', data #> '{result,inventory,creditsRetired,value}',   'absent', data #> '{result,inventory,creditsRetired,absent}'),
             'creditsGenerated', jsonb_build_object('value', data #> '{result,inventory,creditsGenerated,value}', 'absent', data #> '{result,inventory,creditsGenerated,absent}'),
             'dataQuality', jsonb_build_object(
               'scope1And2', jsonb_build_object(
                 'option', data #> '{result,inventory,dataQuality,scope1And2,option}',
                 'score',  data #> '{result,inventory,dataQuality,scope1And2,score}'),
               'scope3', jsonb_build_object(
                 'option', data #> '{result,inventory,dataQuality,scope3,option}',
                 'score',  data #> '{result,inventory,dataQuality,scope3,score}',
                 'absent', data #> '{result,inventory,dataQuality,scope3,absent}'))),
           'validation', jsonb_build_object(
             'verdict', data #> '{result,validation,verdict}',
             'findings',
               (SELECT jsonb_agg(jsonb_build_object(
                  'code', f->'code', 'severity', f->'severity', 'field', f->'field',
                  'remedy', f->'remedy', 'reference', f->'reference'))
                FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(data #> '{result,validation,findings}') = 'array'
                       THEN data #> '{result,validation,findings}' ELSE '[]'::jsonb END) f)))))
$$;

ALTER TABLE parta_exposures ADD COLUMN rollup jsonb GENERATED ALWAYS AS (parta_exposure_rollup(data)) STORED;

-- down
-- Reversed by rebuilding the 0012 projection without `facility`; the recorded
-- facility stays on the record either way, because it is held in `data` and
-- this column only ever projected its summary.
ALTER TABLE parta_exposures DROP COLUMN rollup;
DROP FUNCTION IF EXISTS parta_exposure_rollup(jsonb);

CREATE FUNCTION parta_exposure_rollup(data jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT COALESCE((SELECT jsonb_object_agg(key, value) FROM jsonb_each(data)
                   WHERE key = ANY (ARRAY['exposureId','status','reportingYear','assetClass',
                                          'financialSector','createdAt','climate'])), '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object('result', jsonb_build_object(
           'exposure', jsonb_build_object(
             'kind',       data #> '{result,exposure,kind}',
             'instrument', data #> '{result,exposure,instrument}',
             'counterparty', jsonb_build_object(
               'name',                 data #> '{result,exposure,counterparty,name}',
               'sector',               data #> '{result,exposure,counterparty,sector}',
               'sectorKey',            data #> '{result,exposure,counterparty,sectorKey}',
               'naceL2',               data #> '{result,exposure,counterparty,naceL2}',
               'borrowerType',         data #> '{result,exposure,counterparty,borrowerType}',
               'financialInstitution', data #> '{result,exposure,counterparty,financialInstitution}'),
             'outstanding', jsonb_build_object('value', data #> '{result,exposure,outstanding,value}')),
           'attribution', jsonb_build_object('value', data #> '{result,attribution,value}'),
           'inventory', jsonb_build_object(
             'scope1',           jsonb_build_object('value', data #> '{result,inventory,scope1,value}',           'absent', data #> '{result,inventory,scope1,absent}'),
             'scope2',           jsonb_build_object('value', data #> '{result,inventory,scope2,value}',           'absent', data #> '{result,inventory,scope2,absent}'),
             'scope1And2',       jsonb_build_object('value', data #> '{result,inventory,scope1And2,value}',       'absent', data #> '{result,inventory,scope1And2,absent}'),
             'scope3',           jsonb_build_object('value', data #> '{result,inventory,scope3,value}',           'absent', data #> '{result,inventory,scope3,absent}'),
             'removals',         jsonb_build_object('value', data #> '{result,inventory,removals,value}',         'absent', data #> '{result,inventory,removals,absent}'),
             'creditsRetired',   jsonb_build_object('value', data #> '{result,inventory,creditsRetired,value}',   'absent', data #> '{result,inventory,creditsRetired,absent}'),
             'creditsGenerated', jsonb_build_object('value', data #> '{result,inventory,creditsGenerated,value}', 'absent', data #> '{result,inventory,creditsGenerated,absent}'),
             'dataQuality', jsonb_build_object(
               'scope1And2', jsonb_build_object(
                 'option', data #> '{result,inventory,dataQuality,scope1And2,option}',
                 'score',  data #> '{result,inventory,dataQuality,scope1And2,score}'),
               'scope3', jsonb_build_object(
                 'option', data #> '{result,inventory,dataQuality,scope3,option}',
                 'score',  data #> '{result,inventory,dataQuality,scope3,score}',
                 'absent', data #> '{result,inventory,dataQuality,scope3,absent}'))),
           'validation', jsonb_build_object(
             'verdict', data #> '{result,validation,verdict}',
             'findings',
               (SELECT jsonb_agg(jsonb_build_object(
                  'code', f->'code', 'severity', f->'severity', 'field', f->'field',
                  'remedy', f->'remedy', 'reference', f->'reference'))
                FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(data #> '{result,validation,findings}') = 'array'
                       THEN data #> '{result,validation,findings}' ELSE '[]'::jsonb END) f)))))
$$;

ALTER TABLE parta_exposures ADD COLUMN rollup jsonb GENERATED ALWAYS AS (parta_exposure_rollup(data)) STORED;

