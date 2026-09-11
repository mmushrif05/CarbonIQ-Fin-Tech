-- 0011 — the PCAF Part A §5.9 sovereign exposure register.
--
-- §5.9 shipped as a stateless engine (S2): a sovereign holding had to be
-- posted whole on every call. That is right for a pilot and wrong for a bank
-- whose government-securities book is one of its largest lines, and it makes
-- the same two things impossible the §5.2 register was built to end. Coverage
-- cannot be stated, because coverage is assessed outstanding over the whole
-- book (DCL p.124) and a posted body is only what somebody chose to send. And
-- a disclosed figure cannot be traced back to a holding that still exists.
--
-- This is the §5.2 register's shape applied to a sovereign, and it is a
-- SEPARATE table rather than a discriminator column on parta_exposures for a
-- concrete reason: the two result shapes differ (a sovereign has scope 1 on two
-- LULUCF boundaries and a single data-quality score, where a business loan has
-- six lines and two scores), so the roll-up projection differs, and one
-- generated column cannot compute both. The book total (parta_book) IS shared,
-- because total loans and investments is the whole balance sheet and a
-- sovereign holding is assessed against the same denominator as every other
-- class.
--
-- The row keeps the input the bank keyed and the result the engine computed,
-- both, with the instant and the standard edition beside them — the rule every
-- register in this codebase follows, so a recomputation is a decision somebody
-- takes and can see, not a rewrite that happens to them.

CREATE TABLE parta_sovereign_exposures (
  org_id          text NOT NULL,
  id              text NOT NULL,
  data            jsonb NOT NULL,
  -- Text, not integer, like every other generated year in this schema: a cast
  -- reads the session's settings and PostgreSQL refuses a non-immutable
  -- expression in a generated column. A four-digit year sorts correctly as text.
  reporting_year  text GENERATED ALWAYS AS (data->>'reportingYear') STORED,
  asset_class     text GENERATED ALWAYS AS (data->>'assetClass') STORED,
  status          text GENERATED ALWAYS AS (data->>'status') STORED,
  -- The arrow form, matched by tests/data-layer.test.js against the registered
  -- key `country.code`, so the column cannot drift from the field that claims it.
  country_code    text GENERATED ALWAYS AS (data->'country'->>'code') STORED,
  -- The bank's own reference for the holding, carrying the partial unique index
  -- that stops one bond being recorded twice in a year. Under `input`, because
  -- it is the register's own field, not the engine's.
  account_number  text GENERATED ALWAYS AS (data->'input'->'identifiers'->>'accountNumber') STORED,
  version         integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id)
);

-- The roll-up's projection.
--
-- A stored sovereign exposure carries the full provenance trace; the
-- reporting-year position needs about a dozen fields of it. Every path below is
-- a path INTO the stored record, not a shape invented for the column — which is
-- what lets the in-memory store project the same set with no column at all and
-- produce the same rows, and lets the suite prove on either store that the
-- projected roll-up equals the whole-record roll-up figure for figure. The
-- field list here and the one in src/platform/database/collections.js are held
-- to each other, so a field added to one and not the other fails the build.
CREATE FUNCTION parta_sovereign_rollup(data jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT COALESCE((SELECT jsonb_object_agg(key, value) FROM jsonb_each(data)
                   WHERE key = ANY (ARRAY['exposureId','status','reportingYear','assetClass','createdAt'])), '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object(
           'country', jsonb_build_object(
             'code', data #> '{country,code}',
             'name', data #> '{country,name}'),
           'input', jsonb_build_object(
             'exposure', jsonb_build_object('amount', data #> '{input,exposure,amount}')),
           'result', jsonb_build_object(
             'attribution', jsonb_build_object('value', data #> '{result,attribution,value}'),
             'sovereign', jsonb_build_object(
               'name',        data #> '{result,sovereign,name}',
               'country',     data #> '{result,sovereign,country}',
               'provisional', data #> '{result,sovereign,provisional}'),
             'inventory', jsonb_build_object(
               'scope1', jsonb_build_object(
                 'exclLULUCF', jsonb_build_object('value', data #> '{result,inventory,scope1,exclLULUCF,value}'),
                 'inclLULUCF', jsonb_build_object('value', data #> '{result,inventory,scope1,inclLULUCF,value}', 'absent', data #> '{result,inventory,scope1,inclLULUCF,absent}')),
               'scope2', jsonb_build_object('value', data #> '{result,inventory,scope2,value}', 'absent', data #> '{result,inventory,scope2,absent}'),
               'scope3', jsonb_build_object('value', data #> '{result,inventory,scope3,value}', 'absent', data #> '{result,inventory,scope3,absent}'),
               'dataQuality', jsonb_build_object(
                 'score',  data #> '{result,inventory,dataQuality,score}',
                 'option', data #> '{result,inventory,dataQuality,option}'),
               'productionIntensity', jsonb_build_object('value', data #> '{result,inventory,productionIntensity,value}')),
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

ALTER TABLE parta_sovereign_exposures ADD COLUMN rollup jsonb GENERATED ALWAYS AS (parta_sovereign_rollup(data)) STORED;

-- The only way this table is read at scale: a year's book, in order.
CREATE INDEX parta_sovereign_year_idx    ON parta_sovereign_exposures (org_id, reporting_year);
CREATE INDEX parta_sovereign_country_idx ON parta_sovereign_exposures (org_id, country_code);

-- One bond, once. Partial, because two holdings recorded without a reference
-- are not thereby the same bond — a bank may hold several of one sovereign's
-- issues, and each is its own reference. The service refuses first and names
-- the existing exposure; this index closes the race the service cannot.
CREATE UNIQUE INDEX parta_sovereign_one_per_year_idx
  ON parta_sovereign_exposures (org_id, reporting_year, account_number)
  WHERE account_number IS NOT NULL;

-- down
DROP INDEX IF EXISTS parta_sovereign_one_per_year_idx;
DROP TABLE IF EXISTS parta_sovereign_exposures;
DROP FUNCTION IF EXISTS parta_sovereign_rollup(jsonb);
