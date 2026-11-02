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
  source TEXT NOT NULL DEFAULT 'beacon'
);
CREATE INDEX IF NOT EXISTS idx_oe_day_event ON optimiser_events(day, event);
