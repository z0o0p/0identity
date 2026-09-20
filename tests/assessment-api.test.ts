import { describe, expect, it } from "vitest";
import { assessmentResponseSchema } from "../src/api/assessment";
import { MAX_ASSESSMENT_BODY_BYTES } from "../src/api/assess";
import { createWorker } from "../src/worker/index";
import { normalHumanSignals } from "./fixtures/signals";
import { MemoryHistoryService } from "./helpers/memory-history";

const worker = createWorker({
  createId: prefix => `${prefix}_test-id`,
  history: new MemoryHistoryService(),
  now: () => new Date("2026-09-20T12:00:00.000Z"),
});

function assessmentRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/v1/assess", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("assessment API", () => {
  it("scores and enrolls a valid request as a new anonymous subject", async () => {
    const response = await worker.fetch(assessmentRequest(
      { signals: normalHumanSignals },
      { "User-Agent": normalHumanSignals.environment!.userAgent },
    ));
    const body: unknown = await response.json();
    const parsed = assessmentResponseSchema.parse(body);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(parsed.assessmentId).toBe("asm_test-id");
    expect(parsed.sessionId).toBe("sess_test-id");
    expect(parsed.human.score).toBeGreaterThanOrEqual(8);
    expect(parsed.identity).toMatchObject({
      matchStatus: "new",
      subjectId: "0id_test-id",
      continuityConfidence: 0,
    });
  });

  it("uses the request user agent as server-derived consistency evidence", async () => {
    const response = await worker.fetch(assessmentRequest(
      { signals: normalHumanSignals },
      { "User-Agent": "Mozilla/5.0 Firefox/141.0" },
    ));
    const body = assessmentResponseSchema.parse(await response.json());

    expect(body.human.flags.map(flag => flag.code)).toContain("header_browser_mismatch");
  });

  it.each([
    ["missing signals", {}, "invalid_request"],
    ["spoofed session identifier", { signals: normalHumanSignals, sessionId: "sess_spoofed" }, "invalid_request"],
    ["spoofed network context", { signals: { ...normalHumanSignals, network: { country: "GB" } } }, "invalid_request"],
  ])("rejects %s", async (_label, body, code) => {
    const response = await worker.fetch(assessmentRequest(body));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code } });
  });

  it("rejects malformed JSON", async () => {
    const response = await worker.fetch(assessmentRequest("{"));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_json" } });
  });

  it("rejects oversized bodies before parsing", async () => {
    const response = await worker.fetch(assessmentRequest(JSON.stringify({ padding: "x".repeat(MAX_ASSESSMENT_BODY_BYTES) })));

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: "payload_too_large" } });
  });

  it("requires JSON media type", async () => {
    const request = assessmentRequest({ signals: normalHumanSignals });
    request.headers.set("Content-Type", "text/plain");
    const response = await worker.fetch(request);

    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({ error: { code: "unsupported_media_type" } });
  });

  it.each(["GET", "PUT", "DELETE", "OPTIONS"])("rejects %s", async method => {
    const response = await worker.fetch(new Request("http://localhost/api/v1/assess", { method }));

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(await response.json()).toMatchObject({ error: { code: "method_not_allowed" } });
  });
});
