-- 0008 — the PCAF Part A exposure register.
--
-- §5.2 shipped as two stateless reads: a book had to be posted whole on every
-- call. That is right for a pilot and wrong for a bank with five thousand
-- loans, and it makes two things impossible rather than merely inconvenient.
-- Coverage cannot be stated, because coverage is assessed outstanding over
-- *the whole book* (DCL p.124) and a posted body is only ever what somebody
-- chose to send. And nothing can be traced: a disclosed figure has to lead
-- back to the exposure behind it, which means the exposure has to still exist.
--
-- Two tables, and the second is not an afterthought.
--
-- `parta_exposures` holds one row per exposure per reporting year. The row
-- keeps **the input the bank keyed and the result the engine computed**, not
-- one or the other. Keeping only the input would mean a factor correction
-- silently rewrote a figure somebody was shown; keeping only the result would
-- mean nobody could ever see what it was computed from. Both, with the instant
-- and the standard edition recorded beside them, is what lets a recomputation
-- be a decision rather than an accident.
--
-- `parta_book` holds one row per reporting year carrying the entity's own
-- totals — principally total loans and investments, which is the denominator
-- coverage needs. It is a separate table because it is a different fact with a
-- different owner: an exposure is a record of lending, the book total is a
-- statement the reporting entity makes about its own balance sheet. Folding it
-- into a settings blob would make "we have not stated it" and "it is zero"
-- indistinguishable, and coverage against a zero book is not 100%, it is
-- unanswerable.

-- ── The exposures ────────────────────────────────────────────────────────

CREATE TABLE parta_exposures (
  org_id          text NOT NULL,
  id              text NOT NULL,
  data            jsonb NOT NULL,
  -- The reporting year is text and not integer for the same reason every
  -- instant in this schema is text: a cast reads the session's settings and
  -- PostgreSQL refuses a non-immutable expression in a generated column. It
  -- is a four-digit year, which sorts correctly as text.
  reporting_year  text GENERATED ALWAYS AS (data->>'reportingYear') STORED,
  asset_class     text GENERATED ALWAYS AS (data->>'assetClass') STORED,
  status          text GENERATED ALWAYS AS (data->>'status') STORED,
  -- The arrow form, not the #>> path form, and it is not a style choice: the
  -- registry lifts `counterparty.name` into this column, and
  -- tests/data-layer.test.js proves each registered key really is generated
  -- from that JSON field by matching the expression it implies. A path
  -- operator would pass nothing and the column could drift from the key that
  -- claims it.
  counterparty    text GENERATED ALWAYS AS (data->'counterparty'->>'name') STORED,
  sector          text GENERATED ALWAYS AS (data->'counterparty'->>'sector') STORED,
  version         integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id)
);

-- The roll-up's projection.
--
-- A stored exposure is several kilobytes, most of it the provenance trace —
-- every equation, every input, every factor with its source. The reporting-year
-- roll-up needs eighteen fields of it. Reading the whole record to use eighteen
-- fields is the defect `partc_assessments.rollup` was built to end: the query
-- is fast and the serialisation is not, and at ten thousand rows the difference
-- is a second against forty milliseconds.
--
-- Every path below is a path INTO the stored record, not a shape invented for
-- the column. That is what lets the in-memory store project the same set with
-- no column at all and produce the same rows, which is the only reason the
-- suite can prove on either store that the projected roll-up equals the
-- whole-record roll-up. A flattened column would have been smaller and would
-- have been a second shape nothing else in the system knows.
--
-- The field list here and the one declared in
-- src/platform/database/collections.js are held to each other by a test, so a
-- field added to one and not the other fails the build rather than silently
-- returning a projection that is missing it.
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

-- The only way this table is ever read at scale: a year's book, in order.
CREATE INDEX parta_exposures_year_idx  ON parta_exposures (org_id, reporting_year, asset_class);
CREATE INDEX parta_exposures_party_idx ON parta_exposures (org_id, counterparty);

-- ── The book total ───────────────────────────────────────────────────────

CREATE TABLE parta_book (
  org_id          text NOT NULL,
  id              text NOT NULL,
  data            jsonb NOT NULL,
  reporting_year  text GENERATED ALWAYS AS (data->>'reportingYear') STORED,
  version         integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id)
);

-- One statement of the book per year, said in the database as well as in code.
-- Two rows for one year would mean coverage had two denominators and whichever
-- the query happened to read would decide the disclosed percentage.
CREATE UNIQUE INDEX parta_book_year_idx ON parta_book (org_id, reporting_year);

-- down
DROP TABLE IF EXISTS parta_book;
DROP TABLE IF EXISTS parta_exposures;
DROP FUNCTION IF EXISTS parta_exposure_rollup(jsonb);
