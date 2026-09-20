import { describe, expect, it, vi } from "vitest";
import { assessmentResponseSchema } from "../src/api/assessment";
import {
  INVESTIGATION_MODEL,
  MAX_INVESTIGATION_QUESTION_CHARS,
  createInvestigationAiTools,
  hasValidInvestigationQuestion,
  investigationSystemPrompt,
} from "../src/agents/investigation-chat";
import { InvestigationAgent } from "../src/agents/investigation-agent";
import {
  investigationAgentName,
  investigationScopeFromPath,
  parseInvestigationAgentName,
} from "../src/agents/investigation-scope";
import { createWorker } from "../src/worker/index";
import { MemoryHistoryService } from "./helpers/memory-history";

function simulation(profile: string): Request {
  return new Request("http://localhost/api/v1/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile }),
  });
}

describe("Investigation Agent boundary", () => {
  it("round-trips a validated server namespace and selected session through the Agent name", () => {
    const name = investigationAgentName("simulation", "sess_example-1");
    expect(name).toBe("simulation__sess_example-1");
    expect(parseInvestigationAgentName(name)).toEqual({
      source: "simulation",
      namespace: "simulation-v1",
      sessionId: "sess_example-1",
    });
    expect(investigationScopeFromPath(`/agents/investigation-agent/${name}`)).toEqual({
      source: "simulation",
      namespace: "simulation-v1",
      sessionId: "sess_example-1",
    });
  });

  it.each([
    "simulation__invalid",
    "other__sess_valid",
    "live__sess_valid__extra",
    "simulation__sess_valid/another-agent",
  ])("rejects invalid Agent scope %s", name => {
    expect(parseInvestigationAgentName(name)).toBeNull();
  });

  it("defines evidence-only instructions without interpolating user text", () => {
    const scope = parseInvestigationAgentName("live__sess_selected");
    expect(scope).not.toBeNull();
    const prompt = investigationSystemPrompt(scope!);

    expect(prompt).toContain("sess_selected");
    expect(prompt).toContain("Use the evidence tools");
    expect(prompt).toContain("Never invent");
    expect(prompt).toContain("Never claim that 0identity identifies or verifies a real-world person");
    expect(prompt).toContain("cannot change scores, signals, subject assignments, or history");
    expect(INVESTIGATION_MODEL).toMatch(/^@cf\//);
  });

  it("accepts only a bounded text question for a model turn", () => {
    expect(hasValidInvestigationQuestion([{
      id: "message-1",
      role: "user",
      parts: [{ type: "text", text: "Why is confidence low?" }],
    }])).toBe(true);
    expect(hasValidInvestigationQuestion([{
      id: "message-2",
      role: "user",
      parts: [{ type: "text", text: "x".repeat(MAX_INVESTIGATION_QUESTION_CHARS + 1) }],
    }])).toBe(false);
    expect(hasValidInvestigationQuestion([{
      id: "message-3",
      role: "user",
      parts: [{ type: "file", mediaType: "text/plain", url: "data:text/plain,ignore" }],
    }])).toBe(false);
  });

  it("adapts every read operation to an AI SDK server tool", async () => {
    const history = new MemoryHistoryService();
    let sequence = 0;
    const worker = createWorker({
      history,
      createId: prefix => `${prefix}_${++sequence}`,
      now: () => new Date("2026-09-20T12:00:00.000Z"),
    });
    const assessment = assessmentResponseSchema.parse(await (
      await worker.fetch(simulation("headless-automation"))
    ).json());
    const tools = createInvestigationAiTools(history, "simulation-v1");

    expect(Object.keys(tools).sort()).toEqual([
      "compareSessions",
      "getAssessment",
      "getRiskFlags",
      "getScoreBreakdown",
      "getSession",
      "getSubject",
      "getSubjectHistory",
    ]);
    const result = await tools.getScoreBreakdown.execute(
      { sessionId: assessment.sessionId },
      { toolCallId: "tool-test", messages: [], context: {} },
    );
    expect(result).toEqual({
      status: "found",
      sessionId: assessment.sessionId,
      score: assessment.human.score,
      confidence: assessment.human.confidence,
      scoringVersion: assessment.human.scoringVersion,
      components: assessment.human.components,
    });
  });

  it("rejects malformed chat routes before invoking the Agents SDK router", async () => {
    const routeAgent = vi.fn(async () => new Response("routed"));
    const response = await createWorker({ routeAgent }).fetch(new Request(
      "http://localhost/agents/investigation-agent/simulation__invalid",
    ));

    expect(response.status).toBe(400);
    expect(routeAgent).not.toHaveBeenCalled();
  });

  it("routes a valid protected Agent scope through the configured binding", async () => {
    const routeAgent = vi.fn(async () => new Response("routed"));
    const worker = createWorker({ routeAgent });
    const response = await worker.fetch(
      new Request("http://localhost/agents/investigation-agent/simulation__sess_valid"),
      { InvestigationAgent: {} as Cloudflare.Env["InvestigationAgent"] },
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("routed");
    expect(routeAgent).toHaveBeenCalledOnce();
  });

  it("keeps deterministic assessment available without AI or Agent bindings", async () => {
    const history = new MemoryHistoryService();
    const worker = createWorker({
      history,
      createId: prefix => `${prefix}_offline`,
      now: () => new Date("2026-09-20T12:00:00.000Z"),
    });
    const response = await worker.fetch(simulation("normal-human"));

    expect(response.status).toBe(200);
    expect(assessmentResponseSchema.parse(await response.json()).human.scoringVersion).toBe("human-heuristic-v1");
  });

  it("fails an investigation turn safely when the AI binding is deliberately absent", async () => {
    const agent = new InvestigationAgent(
      {} as DurableObjectState,
      {} as Cloudflare.Env,
    );
    Object.defineProperty(agent, "name", { value: "simulation__sess_valid" });
    Object.defineProperty(agent, "messages", {
      value: [{
        id: "message-offline",
        role: "user",
        parts: [{ type: "text", text: "Why is confidence low?" }],
      }],
    });

    const response = await agent.onChatMessage(vi.fn());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Workers AI is not enabled in this environment.",
    });
  });
});
