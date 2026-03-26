-- VulnScout AI — database schema
-- Import with: psql -d vulnscout -f schema.sql
-- Idempotent: safe to run multiple times.

-- ─── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE source_type AS ENUM ('github', 'openapi');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE scan_status AS ENUM ('queued', 'running', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE severity AS ENUM ('critical', 'high', 'medium', 'low', 'info');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                  TEXT UNIQUE NOT NULL,
  password_hash          TEXT NOT NULL,
  name                   TEXT NOT NULL,
  github_token_encrypted TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS services (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  source_type source_type NOT NULL,
  source      TEXT NOT NULL,
  branch      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id        UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status            scan_status NOT NULL DEFAULT 'queued',
  attack_profile    TEXT NOT NULL,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ,
  critical          INTEGER NOT NULL DEFAULT 0,
  high              INTEGER NOT NULL DEFAULT 0,
  medium            INTEGER NOT NULL DEFAULT 0,
  low               INTEGER NOT NULL DEFAULT 0,
  info              INTEGER NOT NULL DEFAULT 0,
  endpoints_scanned INTEGER NOT NULL DEFAULT 0,
  requests_fired    INTEGER NOT NULL DEFAULT 0,
  duration_ms       INTEGER,
  error_message     TEXT
);

CREATE TABLE IF NOT EXISTS findings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id        UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  severity       severity NOT NULL,
  vuln_class     TEXT NOT NULL,
  title          TEXT NOT NULL,
  endpoint       TEXT NOT NULL,
  method         TEXT NOT NULL,
  description    TEXT NOT NULL,
  proof_request  JSONB NOT NULL,
  proof_response JSONB NOT NULL,
  curl_command   TEXT NOT NULL,
  fix_suggestion TEXT NOT NULL,
  cwe_id         TEXT NOT NULL,
  owasp_category TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
