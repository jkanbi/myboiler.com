-- Anonymous Boiler Optimiser events (D1 `optimiser-events`).
-- Schema is already applied in production. Do not run migrations from the Worker.
CREATE TABLE IF NOT EXISTS optimiser_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  path TEXT,
  utm_source TEXT,
  utm_content TEXT,
  step INTEGER,
  brand TEXT,
  from_flow REAL,
  set_flow REAL,
  space_kwh REAL,
  annual_kwh REAL,
  unit_rate REAL,
  system TEXT,
  boiler_type TEXT,
  saving_kwh REAL,
  saving_gbp REAL,
  answer TEXT,
  is_test INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'beacon',
  target TEXT,
  outbound INTEGER,
  arrival_src TEXT,
  pre_brand TEXT,
  pre_system TEXT,
  preselected INTEGER
);
CREATE INDEX IF NOT EXISTS idx_oe_day_event ON optimiser_events(day, event);

-- Feedback confirm-box posts (turned_down / did_it_work). New rows go here
-- instead of rewriting the KV `optimiser:<day>` arrays. GET
-- /api/optimiser-feedbacks still merges any leftover KV days with these rows.
CREATE TABLE IF NOT EXISTS optimiser_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  day TEXT NOT NULL,
  t INTEGER,
  type TEXT NOT NULL,
  answer TEXT,
  path TEXT,
  brand TEXT,
  from_flow REAL,
  set_flow REAL
);
CREATE INDEX IF NOT EXISTS idx_of_day ON optimiser_feedback(day);

-- Live D1 already exists. Run once before deploy if the columns or table are missing.
-- Do not run from the Worker.
-- ALTER TABLE optimiser_events ADD COLUMN target TEXT;
-- ALTER TABLE optimiser_events ADD COLUMN outbound INTEGER;
-- ALTER TABLE optimiser_events ADD COLUMN arrival_src TEXT;
-- ALTER TABLE optimiser_events ADD COLUMN pre_brand TEXT;
-- ALTER TABLE optimiser_events ADD COLUMN pre_system TEXT;
-- ALTER TABLE optimiser_events ADD COLUMN preselected INTEGER;
