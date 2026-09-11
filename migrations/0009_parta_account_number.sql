-- 0009 — one loan, once.
--
-- Nothing in 0008 stopped the same facility being recorded twice in one
-- reporting year. That is not a cosmetic duplicate: every line of the
-- position sums, so a loan keyed in twice doubles its financed emissions and
-- its outstanding, and coverage — assessed outstanding over the book total —
-- climbs on money the bank does not lend twice. A disclosure built on that
-- register would be wrong in the direction that flatters it.
--
-- The bank's own reference for the facility is the key. It is optional in
-- the schema, because a pilot keys a book without one; where it is given, a
-- second row carrying it in the same year is refused. Two facilities to one
-- borrower are two references and both stand — uniqueness is on the loan,
-- never on the counterparty.
--
-- The path is into the record as the bank keyed it, `input.identifiers`,
-- and not into the engine's result: the engine echoes identifiers but the
-- register's own field is the one the registry lifts.
--
-- Partial, so rows with no reference carry no constraint. A check in
-- `application/register.js` refuses first and names the existing exposure;
-- this index is what makes two requests racing for the same reference unable
-- to both succeed on PostgreSQL. The other three stores read and then write,
-- which narrows the window without shutting it, and the register says so.

-- One line, deliberately: tests/data-layer.test.js proves each registered key
-- is generated from the field that claims it by matching this exact form.
ALTER TABLE parta_exposures ADD COLUMN account_number text GENERATED ALWAYS AS (data->'input'->'identifiers'->>'accountNumber') STORED;

CREATE UNIQUE INDEX parta_exposures_one_loan_per_year_idx
  ON parta_exposures (org_id, reporting_year, account_number)
  WHERE account_number IS NOT NULL;

-- down
DROP INDEX IF EXISTS parta_exposures_one_loan_per_year_idx;
ALTER TABLE parta_exposures DROP COLUMN IF EXISTS account_number;
