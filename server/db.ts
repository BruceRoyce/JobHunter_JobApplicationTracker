import { DatabaseSync } from "node:sqlite";

export const STATUSES = [
  "Applied",
  "Interested",
  "Going to interview",
  "unsuccessful",
  "successful",
  "Closed",
] as const;
export type Status = (typeof STATUSES)[number];
export const VIA = ["Employer", "Agency"] as const;
export const CONTRACT_TYPES = ["Contract", "Permanent"] as const;

export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      is_starred          INTEGER NOT NULL DEFAULT 0 CHECK (is_starred IN (0,1)),
      job_title           TEXT    NOT NULL,
      via                 TEXT    NOT NULL DEFAULT 'Employer' CHECK (via IN ('Employer','Agency')),
      employer_name       TEXT,
      agency_name         TEXT,
      contract_type       TEXT    CHECK (contract_type IS NULL OR contract_type IN ('Contract','Permanent')),
      salary_offer        TEXT,
      salary_value        REAL,
      contact_person      TEXT,
      url                 TEXT,
      status              TEXT    NOT NULL CHECK (status IN ('Applied','Interested','Going to interview','unsuccessful','successful','Closed')),
      record_date         TEXT    NOT NULL,
      folder              TEXT    NOT NULL UNIQUE,
      cv_file             TEXT,
      cv_name             TEXT,
      cover_file          TEXT,
      cover_name          TEXT,
      advert_file         TEXT,
      advert_content_type TEXT,
      advert_source_url   TEXT,
      advert_frozen_at    TEXT,
      advert_error        TEXT,
      notes               TEXT,
      created_at          TEXT    NOT NULL,
      updated_at          TEXT    NOT NULL
    );
    CREATE TABLE IF NOT EXISTS status_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id      INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      status      TEXT    NOT NULL CHECK (status IN ('Applied','Interested','Going to interview','unsuccessful','successful','Closed')),
      event_date  TEXT    NOT NULL,
      created_at  TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_job ON status_events(job_id, event_date);
    CREATE INDEX IF NOT EXISTS idx_jobs_updated ON jobs(updated_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    -- The frozen advert is historic evidence: once set it can never be changed or cleared.
    CREATE TRIGGER IF NOT EXISTS trg_jobs_freeze_advert
    BEFORE UPDATE OF advert_file, advert_content_type, advert_source_url, advert_frozen_at ON jobs
    WHEN OLD.advert_file IS NOT NULL AND (
         NEW.advert_file IS NOT OLD.advert_file
      OR NEW.advert_content_type IS NOT OLD.advert_content_type
      OR NEW.advert_source_url IS NOT OLD.advert_source_url
      OR NEW.advert_frozen_at IS NOT OLD.advert_frozen_at)
    BEGIN
      SELECT RAISE(ABORT, 'frozen job advert is immutable');
    END;
    INSERT OR IGNORE INTO schema_meta(key, value) VALUES ('version', '1');
  `);
  return db;
}

export function tx<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
