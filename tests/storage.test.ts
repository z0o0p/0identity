import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { buildAssessment } from "../src/api/assess";
import { applyStorageMigrations } from "../src/storage/migrations";
import { createAssessmentRecord, SqlAssessmentRepository } from "../src/storage/sql-assessment-repository";
import type { SqlValue, SyncSqlDatabase } from "../src/storage/sql-database";
import { normalHumanSignals } from "./fixtures/signals";

function nodeValue(value: SqlValue): SQLInputValue {
  return value instanceof ArrayBuffer ? new Uint8Array(value) : value;
}

class NodeSqlDatabase implements SyncSqlDatabase {
  constructor(readonly database = new DatabaseSync(":memory:")) {}

  execute(query: string, ...bindings: SqlValue[]): void {
    if (bindings.length === 0) {
      this.database.exec(query);
      return;
    }
    this.database.prepare(query).run(...bindings.map(nodeValue));
  }

  query<T>(query: string, ...bindings: SqlValue[]): T[] {
    return this.database.prepare(query).all(...bindings.map(nodeValue)) as T[];
  }

  transaction<T>(operation: () => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function assessmentRecord(suffix: string, source: "live" | "simulation" = "simulation") {
  const processed = buildAssessment(
    normalHumanSignals,
    normalHumanSignals.environment!.userAgent,
    prefix => `${prefix}_${suffix}`,
  );
  return createAssessmentRecord(
    processed.response,
    processed.signals,
    `2026-09-20T12:00:0${suffix}.000Z`,
    source,
    source === "simulation" ? "normal-human" : undefined,
  );
}

function repository(database = new NodeSqlDatabase()): { database: NodeSqlDatabase; repository: SqlAssessmentRepository } {
  applyStorageMigrations(database);
  return { database, repository: new SqlAssessmentRepository(database) };
}

describe("SQLite assessment repository", () => {
  it("applies versioned migrations idempotently", () => {
    const database = new NodeSqlDatabase();
    applyStorageMigrations(database);
    applyStorageMigrations(database);

    expect(database.query<{ version: number }>("SELECT version FROM schema_migrations")).toEqual([{ version: 1 }]);
  });

  it("persists and reconstructs assessment details", () => {
    const { database, repository: firstInstance } = repository();
    const record = assessmentRecord("1");
    firstInstance.saveAssessment(record);

    // A fresh repository instance has no in-memory state and must reconstruct
    // the result entirely from SQLite, as it would after Durable Object eviction.
    const restarted = new SqlAssessmentRepository(database);
    expect(restarted.listSessions(10)).toHaveLength(1);
    expect(restarted.getSession(record.sessionId)).toMatchObject({
      sessionId: record.sessionId,
      assessmentId: record.assessmentId,
      source: "simulation",
      simulationProfile: "normal-human",
      humanScore: record.human.score,
      assessment: { human: { scoringVersion: "human-heuristic-v1" } },
    });
  });

  it("rolls back the session row when its assessment insert fails", () => {
    const { repository: history } = repository();
    const first = assessmentRecord("1");
    history.saveAssessment(first);
    const conflict = { ...assessmentRecord("2"), assessmentId: first.assessmentId };

    expect(() => history.saveAssessment(conflict)).toThrow();
    expect(history.getSession(conflict.sessionId)).toBeNull();
    expect(history.listSessions(10)).toHaveLength(1);
  });

  it("orders recent sessions and respects the requested limit", () => {
    const { repository: history } = repository();
    history.saveAssessment(assessmentRecord("1"));
    history.saveAssessment(assessmentRecord("2"));
    history.saveAssessment(assessmentRecord("3"));

    expect(history.listSessions(2).map(session => session.sessionId)).toEqual(["sess_3", "sess_2"]);
  });

  it("keeps live and simulation namespaces isolated", () => {
    const simulation = repository().repository;
    const live = repository().repository;
    const simulatedRecord = assessmentRecord("1", "simulation");
    simulation.saveAssessment(simulatedRecord);

    expect(simulation.getSession(simulatedRecord.sessionId)).not.toBeNull();
    expect(live.getSession(simulatedRecord.sessionId)).toBeNull();
    expect(live.listSessions(10)).toEqual([]);
  });
});
