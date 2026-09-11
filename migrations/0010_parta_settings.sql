-- PCAF Part A §5.2 — the reporting entity's own settings.
--
-- Chapter 6 requires a disclosure to state its recalculation protocol: a base
-- year, a significance threshold, and the triggers that force a recalculation
-- of base-year emissions. These are the entity's claims, not the engine's, and
-- they are org-wide rather than per year — a base year is one claim about
-- history, so holding it on each year's `parta_book` row would let two years
-- disagree about which year the base is. It lives here, one row per
-- organisation (id 'default'), the same shape Part C's `partc_settings` holds.
--
-- Kept apart from Part C's settings because the two scopes never merge: the
-- significance threshold means the same thing but the book it governs, the
-- weighting it sits beside (outstanding amount, not premium) and the triggers
-- phrased for a lending book are Part A's.

CREATE TABLE parta_settings (
  org_id      text NOT NULL,
  id          text NOT NULL,
  data        jsonb NOT NULL,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, id)
);

-- down
DROP TABLE IF EXISTS parta_settings;
