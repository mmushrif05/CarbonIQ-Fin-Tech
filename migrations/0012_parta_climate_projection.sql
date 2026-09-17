-- PCAF Part A — the climate classification a loan carries, in the projection.
--
-- SLFRS S2 §29(b)–(d) ask for the amount and percentage of the book vulnerable
-- to transition risk, vulnerable to physical risk, and aligned with
-- climate-related opportunities. None of the three is derivable from an
-- emissions figure: each is a judgement the bank records against the exposure.
--
-- The judgement is stored top-level on the record as `climate`, so the
-- reporting-year roll-up can sum it from the same projection it already reads
-- rather than pulling every several-kilobyte record back to reach three
-- fields. That is the whole reason the projection exists, and a field the
-- roll-up needs and the column does not carry would have the roll-up silently
-- reading the whole record again.
--
-- The generated column is dropped and rebuilt rather than the function
-- replaced: a generated column does not recompute when the function behind it
-- changes, so replacing it alone would leave every row already written with a
-- projection missing the new key.

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

-- down
-- Reversed by rebuilding the 0008 projection without `climate`; the recorded
-- classification stays on the record either way, because it is held in `data`
-- and this column only ever projected it.
ALTER TABLE parta_exposures DROP COLUMN rollup;
DROP FUNCTION IF EXISTS parta_exposure_rollup(jsonb);
CREATE FUNCTION parta_exposure_rollup(data jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT COALESCE((SELECT jsonb_object_agg(key, value) FROM jsonb_each(data)
                   WHERE key = ANY (ARRAY['exposureId','status','reportingYear','assetClass',
                                          'financialSector','createdAt'])), '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object('result', jsonb_build_object(
           'exposure', jsonb_build_object(
             'kind',       data #> '{result,exposure,kind}',
             'instrument', data #> '{result,exposure,instrument}',
             'counterparty', jsonb_build_object(
               'name',                 data #> '{result,exposure,counterparty,name}',
               'sector',               data #> '{result,exposure,counterparty,sector}',
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
