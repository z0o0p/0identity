import { describe, expect, it } from "vitest";
import { assessmentResponseSchema } from "../src/api/assessment";
import { dashboardOverviewSchema, subjectHistoryResponseSchema } from "../src/api/dashboard";
import { createWorker } from "../src/worker/index";
import { MemoryHistoryService } from "./helpers/memory-history";

function createTestWorker() {
  let sequence = 0;
  return createWorker({
    history: new MemoryHistoryService(),
    createId: prefix => `${prefix}_${++sequence}`,
    now: () => new Date(`2026-09-20T12:00:${String(sequence).padStart(2, "0")}.000Z`),
  });
}

function simulation(profile: string): Request {
  return new Request("http://localhost/api/v1/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile }),
  });
}

describe("dashboard API", () => {
  it("returns overview metrics and subject-scoped session history", async () => {
    const worker = createTestWorker();
    const initial = assessmentResponseSchema.parse(await (
      await worker.fetch(simulation("normal-human"))
    ).json());
    await worker.fetch(simulation("returning-human-same-device"));
    await worker.fetch(simulation("possible-returning-human-new-device"));

    const overviewResponse = await worker.fetch(new Request("http://localhost/api/v1/overview?source=simulation"));
    const overview = dashboardOverviewSchema.parse(await overviewResponse.json());
    expect(overview).toEqual({
      totalSessions: 3,
      likelyHumanSessions: 3,
      suspiciousSessions: 0,
      anonymousSubjects: 1,
      uncertainMatches: 1,
    });

    const subjectId = initial.identity.subjectId;
    expect(subjectId).toBeTruthy();
    const historyResponse = await worker.fetch(new Request(
      `http://localhost/api/v1/subjects/${subjectId}/sessions?source=simulation&limit=10`,
    ));
    const history = subjectHistoryResponseSchema.parse(await historyResponse.json());
    expect(history.sessions).toHaveLength(2);
    expect(history.sessions.every(session => session.subjectId === subjectId)).toBe(true);
  });

  it.each([
    "/api/v1/overview?source=invalid",
    "/api/v1/overview?limit=10",
    "/api/v1/overview?source=live&source=simulation",
    "/api/v1/subjects/not-valid/sessions?source=simulation",
    "/api/v1/subjects/0id_valid/sessions?limit=0",
  ])("rejects invalid dashboard query %s", async path => {
    const response = await createTestWorker().fetch(new Request(`http://localhost${path}`));
    expect(response.status).toBe(400);
  });

  it.each(["POST", "PUT", "DELETE"])("rejects %s for dashboard reads", async method => {
    const worker = createTestWorker();
    const overview = await worker.fetch(new Request("http://localhost/api/v1/overview", { method }));
    const history = await worker.fetch(new Request(
      "http://localhost/api/v1/subjects/0id_valid/sessions",
      { method },
    ));
    expect(overview.status).toBe(405);
    expect(history.status).toBe(405);
  });
});
