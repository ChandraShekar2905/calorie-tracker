-- NourishTrack meal log schema.
-- Apply with:  psql postgres://localhost:5432/nourishtrack -f schema.sql

-- One row per logging event: a photo the user confirmed, or a single
-- manually typed food. Ids are generated on the phone so that a meal can be
-- saved locally first and pushed to Postgres later under the same id.
CREATE TABLE IF NOT EXISTS meals (
  id         TEXT PRIMARY KEY,
  logged_at  TIMESTAMPTZ NOT NULL,
  -- The calendar day the user sees the meal under. Stored separately from
  -- logged_at because "today" is the device's local day, not UTC.
  local_date DATE NOT NULL,
  source     TEXT NOT NULL CHECK (source IN ('photo', 'manual')),
  photo_uri  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per food within a meal. A photo of a burger and fries is one
-- meal with two items, which is why this is a separate table.
CREATE TABLE IF NOT EXISTS meal_items (
  id         TEXT PRIMARY KEY,
  meal_id    TEXT NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  portion    TEXT,
  calories   INTEGER NOT NULL CHECK (calories >= 0),
  -- How sure the vision model was. NULL for manually typed food.
  confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),
  position   INTEGER NOT NULL DEFAULT 0
);

-- Water is its own table rather than a kind of meal: it has no items, no
-- photo and no calories, so folding it into meals would mean a table where
-- most columns are NULL for half the rows.
CREATE TABLE IF NOT EXISTS water_entries (
  id         TEXT PRIMARY KEY,
  logged_at  TIMESTAMPTZ NOT NULL,
  local_date DATE NOT NULL,
  amount_oz  INTEGER NOT NULL CHECK (amount_oz > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The app reads a day at a time, and always reads a meal's items together.
CREATE INDEX IF NOT EXISTS meals_local_date_idx ON meals (local_date);
CREATE INDEX IF NOT EXISTS meal_items_meal_id_idx ON meal_items (meal_id);
CREATE INDEX IF NOT EXISTS water_entries_local_date_idx ON water_entries (local_date);
