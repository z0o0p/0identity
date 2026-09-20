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
