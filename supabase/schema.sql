-- ============================================================
-- SLA Monitoring Dashboard — Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- Drop existing table if re-running
DROP TABLE IF EXISTS monitoring_checks;

-- Main table for cleaned monitoring check records
CREATE TABLE monitoring_checks (
  id            BIGSERIAL PRIMARY KEY,
  upload_id     UUID NOT NULL,
  service_id    VARCHAR(64) NOT NULL,
  service_name  VARCHAR(128) NOT NULL,
  timestamp     TIMESTAMPTZ NOT NULL,
  status_code   INTEGER NOT NULL,
  latency_ms    DOUBLE PRECISION,        -- null if missing in source data
  agent         VARCHAR(32) NOT NULL,
  region        VARCHAR(64) NOT NULL,
  is_healthy    BOOLEAN NOT NULL,         -- true if status_code is 2xx
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common query patterns
-- 1. Dashboard logs: filter by timestamp (date / date-range)
CREATE INDEX idx_checks_timestamp ON monitoring_checks (timestamp);

-- 2. Filter by service
CREATE INDEX idx_checks_service ON monitoring_checks (service_id);

-- 3. Composite for filtered queries (service + timestamp)
CREATE INDEX idx_checks_service_timestamp ON monitoring_checks (service_id, timestamp);

-- 4. Upload traceability
CREATE INDEX idx_checks_upload_id ON monitoring_checks (upload_id);

-- ============================================================
-- Row Level Security (RLS)
-- Disable RLS so the service_role key can freely read/write.
-- Since this app has no auth, we allow all operations.
-- ============================================================
ALTER TABLE monitoring_checks ENABLE ROW LEVEL SECURITY;

-- Allow all operations (no auth in this app)
CREATE POLICY "Allow all operations" ON monitoring_checks
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Grant permissions to roles
GRANT ALL ON TABLE monitoring_checks TO postgres, anon, authenticated, service_role;
GRANT ALL ON SEQUENCE monitoring_checks_id_seq TO postgres, anon, authenticated, service_role;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
