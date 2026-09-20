import type { SyncSqlDatabase } from "./sql-database";

interface StorageMigration {
  version: number;
  statements: readonly string[];
}

export const STORAGE_MIGRATIONS: readonly StorageMigration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE sessions (
        session_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('live', 'simulation')),
        simulation_profile TEXT,
        CHECK (
          (source = 'simulation' AND simulation_profile IS NOT NULL) OR
          (source = 'live' AND simulation_profile IS NULL)
        )
      ) STRICT`,
      `CREATE TABLE assessments (
        assessment_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL UNIQUE REFERENCES sessions(session_id) ON DELETE CASCADE,
        human_score REAL NOT NULL CHECK (human_score >= 0 AND human_score <= 10),
        human_confidence REAL NOT NULL CHECK (human_confidence >= 0 AND human_confidence <= 1),
        scoring_version TEXT NOT NULL,
        components_json TEXT NOT NULL,
        flags_json TEXT NOT NULL,
        signals_json TEXT NOT NULL
      ) STRICT`,
      "CREATE INDEX sessions_created_at_idx ON sessions(created_at DESC, session_id DESC)",
    ],
  },
  {
    version: 2,
    statements: [
      "ALTER TABLE assessments ADD COLUMN identity_status TEXT NOT NULL DEFAULT 'unavailable' CHECK (identity_status IN ('unavailable', 'matched', 'uncertain', 'new'))",
      "ALTER TABLE assessments ADD COLUMN subject_id TEXT",
      "ALTER TABLE assessments ADD COLUMN continuity_confidence REAL CHECK (continuity_confidence IS NULL OR (continuity_confidence >= 0 AND continuity_confidence <= 1))",
      "ALTER TABLE assessments ADD COLUMN identity_evidence_json TEXT NOT NULL DEFAULT '[]'",
      "ALTER TABLE assessments ADD COLUMN identity_reason TEXT NOT NULL DEFAULT 'Identity continuity was unavailable when this assessment was created.'",
      `CREATE TABLE subjects (
        subject_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        session_count INTEGER NOT NULL CHECK (session_count >= 1),
        confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
        features_json TEXT NOT NULL
      ) STRICT`,
      `CREATE TABLE subject_sessions (
        session_id TEXT PRIMARY KEY REFERENCES sessions(session_id) ON DELETE CASCADE,
        subject_id TEXT NOT NULL REFERENCES subjects(subject_id) ON DELETE CASCADE,
        linked_at TEXT NOT NULL,
        link_status TEXT NOT NULL CHECK (link_status IN ('new', 'matched')),
        continuity_confidence REAL NOT NULL CHECK (continuity_confidence >= 0 AND continuity_confidence <= 1)
      ) STRICT`,
      "CREATE INDEX subjects_last_seen_idx ON subjects(last_seen_at DESC, subject_id DESC)",
      "CREATE INDEX subject_sessions_subject_idx ON subject_sessions(subject_id, linked_at DESC)",
    ],
  },
] as const;

interface MigrationRow {
  version: number;
}

export function applyStorageMigrations(database: SyncSqlDatabase): void {
  database.execute("PRAGMA foreign_keys = ON");
  database.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  ) STRICT`);

  const applied = new Set(database.query<MigrationRow>("SELECT version FROM schema_migrations").map(row => row.version));
  for (const migration of STORAGE_MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    database.transaction(() => {
      for (const statement of migration.statements) database.execute(statement);
      database.execute(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
        migration.version,
        new Date().toISOString(),
      );
    });
  }
}
