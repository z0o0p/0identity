import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { buildAssessment } from "../src/api/assess";
import { applyStorageMigrations } from "../src/storage/migrations";
import { createAssessmentRecord, SqlAssessmentRepository } from "../src/storage/sql-assessment-repository";
import type { SqlValue, SyncSqlDatabase } from "../src/storage/sql-database";
import { normalHumanSignals } from "./fixtures/signals";
import type { ClientSignals } from "../src/signals/schema";
import type { IdentityNetworkContext } from "../src/identity/features";

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

function assessmentRecord(
  suffix: string,
  source: "live" | "simulation" = "simulation",
  signals: ClientSignals = normalHumanSignals,
  networkContext: IdentityNetworkContext = { country: "IN", asn: 64_512 },
) {
  const processed = buildAssessment(
    signals,
    signals.environment?.userAgent,
    prefix => `${prefix}_${suffix}`,
  );
  return createAssessmentRecord(
    processed.response,
    processed.signals,
    `2026-09-20T12:00:0${suffix}.000Z`,
    source,
    source === "simulation" ? "normal-human" : undefined,
    networkContext,
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

    expect(database.query<{ version: number }>("SELECT version FROM schema_migrations")).toEqual([
      { version: 1 },
      { version: 2 },
    ]);
  });

  it("atomically creates a subject, linkage, and assessment", () => {
    const { database, repository: firstInstance } = repository();
    const record = assessmentRecord("1");
    const stored = firstInstance.assessAndSave(record, "0id_1");

    expect(stored.identity).toMatchObject({ matchStatus: "new", subjectId: "0id_1" });
    expect(firstInstance.getSubject("0id_1")).toMatchObject({ sessionCount: 1 });
    expect(database.query<{ subject_id: string }>("SELECT subject_id FROM subject_sessions")).toEqual([
      { subject_id: "0id_1" },
    ]);

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
      assessment: {
        human: { scoringVersion: "human-heuristic-v1" },
        identity: { matchStatus: "new", subjectId: "0id_1" },
      },
    });
  });

  it("rolls back subject evolution and the session when an assessment insert fails", () => {
    const { repository: history } = repository();
    const first = assessmentRecord("1");
    history.assessAndSave(first, "0id_1");
    const conflict = { ...assessmentRecord("2"), assessmentId: first.assessmentId };

    expect(() => history.assessAndSave(conflict, "0id_2")).toThrow();
    expect(history.getSession(conflict.sessionId)).toBeNull();
    expect(history.listSessions(10)).toHaveLength(1);
    expect(history.getSubject("0id_1")?.sessionCount).toBe(1);
  });

  it("orders recent sessions and respects the requested limit", () => {
    const { repository: history } = repository();
    history.assessAndSave(assessmentRecord("1"), "0id_1");
    history.assessAndSave(assessmentRecord("2"), "0id_2");
    history.assessAndSave(assessmentRecord("3"), "0id_3");

    expect(history.listSessions(2).map(session => session.sessionId)).toEqual(["sess_3", "sess_2"]);
  });

  it("keeps live and simulation namespaces isolated", () => {
    const simulation = repository().repository;
    const live = repository().repository;
    const simulatedRecord = assessmentRecord("1", "simulation");
    simulation.assessAndSave(simulatedRecord, "0id_1");

    expect(simulation.getSession(simulatedRecord.sessionId)).not.toBeNull();
    expect(live.getSession(simulatedRecord.sessionId)).toBeNull();
    expect(live.listSessions(10)).toEqual([]);
  });

  it("links a returning session and evolves its subject across a network change", () => {
    const { repository: history } = repository();
    const first = history.assessAndSave(assessmentRecord("1"), "0id_1");
    const returning = history.assessAndSave(
      assessmentRecord("2", "simulation", normalHumanSignals, { country: "GB", asn: 64_520 }),
      "0id_unused",
    );

    expect(first.identity).toMatchObject({ matchStatus: "new", subjectId: "0id_1" });
    expect(returning.identity).toMatchObject({ matchStatus: "matched", subjectId: "0id_1" });
    expect(history.getSubject("0id_1")).toMatchObject({ sessionCount: 2 });
    expect(history.getSubject("0id_unused")).toBeNull();
    expect(history.getOverview()).toEqual({
      totalSessions: 2,
      likelyHumanSessions: 2,
      suspiciousSessions: 0,
      anonymousSubjects: 1,
      uncertainMatches: 0,
    });
    expect(history.listSubjectSessions("0id_1", 10)).toHaveLength(2);
  });

  it("does not link or update a subject when a changed device is uncertain", () => {
    const { database, repository: history } = repository();
    history.assessAndSave(assessmentRecord("1"), "0id_1");
    const original = history.getSubject("0id_1");
    const changedDevice: ClientSignals = {
      ...normalHumanSignals,
      environment: {
        ...normalHumanSignals.environment!,
        browserFamily: "firefox",
        platformFamily: "android",
        screen: { width: 412, height: 915 },
        viewport: { width: 412, height: 840 },
        devicePixelRatio: 3,
        hardwareConcurrency: 4,
        deviceMemoryGb: 4,
        maxTouchPoints: 5,
        webgl: { vendor: "qualcomm", renderer: "adreno" },
      },
    };
    const uncertain = history.assessAndSave(assessmentRecord("2", "simulation", changedDevice), "0id_unused");

    expect(uncertain.identity).toMatchObject({ matchStatus: "uncertain", subjectId: null });
    expect(history.getSubject("0id_1")).toEqual(original);
    expect(history.getSubject("0id_unused")).toBeNull();
    expect(database.query("SELECT * FROM subject_sessions")).toHaveLength(1);
    expect(history.getOverview()).toMatchObject({ totalSessions: 2, anonymousSubjects: 1, uncertainMatches: 1 });
    expect(history.listSubjectSessions("0id_1", 10)).toHaveLength(1);
  });
});
