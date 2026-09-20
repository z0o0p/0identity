import { describe, expect, it, vi } from "vitest";
import { sessionDetailSchema, sessionListResponseSchema } from "../src/api/history";
import { assessmentResponseSchema } from "../src/api/assessment";
import type { AssessmentHistoryService } from "../src/storage/types";
import { createWorker } from "../src/worker/index";
import { normalHumanSignals } from "./fixtures/signals";
import { MemoryHistoryService } from "./helpers/memory-history";

function createTestWorker(history: AssessmentHistoryService = new MemoryHistoryService()) {
  let sequence = 0;
  return createWorker({
    history,
    createId: prefix => `${prefix}_${++sequence}`,
    now: () => new Date(`2026-09-20T12:00:0${sequence}.000Z`),
  });
}

function jsonPost(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("persisted assessment history API", () => {
  it("persists a server-generated simulation and returns list/detail views", async () => {
    const worker = createTestWorker();
    const createResponse = await worker.fetch(jsonPost("/api/v1/simulate", { profile: "normal-human" }));
    const assessment = assessmentResponseSchema.parse(await createResponse.json());

    const listResponse = await worker.fetch(new Request("http://localhost/api/v1/sessions?source=simulation&limit=10"));
    const list = sessionListResponseSchema.parse(await listResponse.json());
    expect(list.sessions).toHaveLength(1);
    expect(list.sessions[0]).toMatchObject({
      assessmentId: assessment.assessmentId,
      sessionId: assessment.sessionId,
      source: "simulation",
      simulationProfile: "normal-human",
    });

    const detailResponse = await worker.fetch(new Request(
      `http://localhost/api/v1/sessions/${assessment.sessionId}?source=simulation`,
    ));
    const detail = sessionDetailSchema.parse(await detailResponse.json());
    expect(detail.assessment).toEqual(assessment);
    expect(detail.signals).toHaveProperty("behavior.pointer.eventCount");
  });

  it("stores live assessments separately from simulations", async () => {
    const worker = createTestWorker();
    const liveResponse = await worker.fetch(jsonPost("/api/v1/assess", { signals: normalHumanSignals }));
    const live = assessmentResponseSchema.parse(await liveResponse.json());
    await worker.fetch(jsonPost("/api/v1/simulate", { profile: "regular-scripted-bot" }));

    const liveList = sessionListResponseSchema.parse(await (
      await worker.fetch(new Request("http://localhost/api/v1/sessions?source=live"))
    ).json());
    const simulationList = sessionListResponseSchema.parse(await (
      await worker.fetch(new Request("http://localhost/api/v1/sessions?source=simulation"))
    ).json());

    expect(liveList.sessions.map(session => session.sessionId)).toEqual([live.sessionId]);
    expect(simulationList.sessions).toHaveLength(1);

    const crossNamespace = await worker.fetch(new Request(
      `http://localhost/api/v1/sessions/${live.sessionId}?source=simulation`,
    ));
    expect(crossNamespace.status).toBe(404);
  });

  it("enrolls, links, and conservatively rejects returning simulation scenarios", async () => {
    const worker = createTestWorker();
    const run = async (profile: string) => assessmentResponseSchema.parse(await (
      await worker.fetch(jsonPost("/api/v1/simulate", { profile }))
    ).json());

    const initial = await run("normal-human");
    const sameDevice = await run("returning-human-same-device");
    const newNetwork = await run("returning-human-new-network");
    const newDevice = await run("possible-returning-human-new-device");

    expect(initial.identity).toMatchObject({ matchStatus: "new" });
    expect(sameDevice.identity).toMatchObject({
      matchStatus: "matched",
      subjectId: initial.identity.subjectId,
    });
    expect(newNetwork.identity).toMatchObject({
      matchStatus: "matched",
      subjectId: initial.identity.subjectId,
    });
    expect(newDevice.identity).toMatchObject({ matchStatus: "uncertain", subjectId: null });
  });

  it.each([
    ["unsupported source", "/api/v1/sessions?source=other"],
    ["zero limit", "/api/v1/sessions?limit=0"],
    ["oversized limit", "/api/v1/sessions?limit=51"],
    ["non-integer limit", "/api/v1/sessions?limit=1.5"],
    ["unknown parameter", "/api/v1/sessions?cursor=anything"],
    ["repeated source", "/api/v1/sessions?source=live&source=simulation"],
  ])("rejects an %s", async (_label, path) => {
    const response = await createTestWorker().fetch(new Request(`http://localhost${path}`));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_query" } });
  });

  it("rejects invalid session identifiers before storage", async () => {
    const response = await createTestWorker().fetch(new Request("http://localhost/api/v1/sessions/not-valid"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_identifier" } });
  });

  it("rejects unsupported simulation profiles", async () => {
    const response = await createTestWorker().fetch(jsonPost("/api/v1/simulate", { profile: "invented" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_request" } });
  });

  it("fails closed when persistence is unavailable", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const history: AssessmentHistoryService = {
      assessAndSave: () => Promise.reject(new Error("database details")),
      listSessions: () => Promise.reject(new Error("database details")),
      getSession: () => Promise.reject(new Error("database details")),
      getOverview: () => Promise.reject(new Error("database details")),
      listSubjectSessions: () => Promise.reject(new Error("database details")),
    };
    const response = await createTestWorker(history).fetch(jsonPost("/api/v1/simulate", { profile: "normal-human" }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: "history_unavailable", message: "Assessment history is temporarily unavailable." },
    });
    expect(errorLog).toHaveBeenCalledOnce();
    errorLog.mockRestore();
  });
});
