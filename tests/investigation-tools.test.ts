import { beforeEach, describe, expect, it } from "vitest";
import { assessmentResponseSchema, type AssessmentResponse } from "../src/api/assessment";
import {
  InvestigationToolInputError,
  InvestigationTools,
  assessmentToolResultSchema,
  comparisonToolResultSchema,
  riskFlagsToolResultSchema,
  scoreBreakdownToolResultSchema,
  sessionToolResultSchema,
  subjectHistoryToolResultSchema,
  subjectToolResultSchema,
} from "../src/agents/investigation-tools";
import { createWorker } from "../src/worker/index";
import { MemoryHistoryService } from "./helpers/memory-history";

interface SeededEvidence {
  initial: AssessmentResponse;
  returning: AssessmentResponse;
  headless: AssessmentResponse;
}

function simulation(profile: string): Request {
  return new Request("http://localhost/api/v1/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile }),
  });
}

describe("investigation tools", () => {
  let history: MemoryHistoryService;
  let tools: InvestigationTools;
  let seeded: SeededEvidence;

  beforeEach(async () => {
    history = new MemoryHistoryService();
    let sequence = 0;
    const worker = createWorker({
      history,
      createId: prefix => `${prefix}_${++sequence}`,
      now: () => new Date(`2026-09-20T12:00:${String(sequence).padStart(2, "0")}.000Z`),
    });
    seeded = {
      initial: assessmentResponseSchema.parse(await (await worker.fetch(simulation("normal-human"))).json()),
      returning: assessmentResponseSchema.parse(await (
        await worker.fetch(simulation("returning-human-same-device"))
      ).json()),
      headless: assessmentResponseSchema.parse(await (await worker.fetch(simulation("headless-automation"))).json()),
    };
    tools = new InvestigationTools(history, "simulation-v1");
  });

  it("retrieves only the stored assessment and session evidence", async () => {
    const assessment = assessmentToolResultSchema.parse(await tools.getAssessment({
      sessionId: seeded.initial.sessionId,
    }));
    const session = sessionToolResultSchema.parse(await tools.getSession({
      sessionId: seeded.initial.sessionId,
    }));

    expect(assessment).toEqual({ status: "found", assessment: seeded.initial });
    expect(session).toMatchObject({
      status: "found",
      session: {
        sessionId: seeded.initial.sessionId,
        assessment: seeded.initial,
        source: "simulation",
        simulationProfile: "normal-human",
      },
    });
  });

  it("returns explicit missing-data results instead of inventing evidence", async () => {
    await expect(tools.getAssessment({ sessionId: "sess_missing" })).resolves.toEqual({
      status: "not_found",
      entity: "session",
      sessionId: "sess_missing",
    });
    await expect(tools.getSubject({ subjectId: "0id_missing" })).resolves.toEqual({
      status: "not_found",
      entity: "subject",
      subjectId: "0id_missing",
    });
    await expect(tools.compareSessions({
      sessionA: seeded.initial.sessionId,
      sessionB: "sess_missing",
    })).resolves.toEqual({
      status: "not_found",
      entity: "session",
      sessionIds: ["sess_missing"],
    });
  });

  it("retrieves a subject and only its bounded linked history", async () => {
    const subjectId = seeded.initial.identity.subjectId;
    expect(subjectId).toBeTruthy();
    const subject = subjectToolResultSchema.parse(await tools.getSubject({ subjectId }));
    const subjectHistory = subjectHistoryToolResultSchema.parse(await tools.getSubjectHistory({
      subjectId,
      limit: 1,
    }));

    expect(subject).toMatchObject({
      status: "found",
      subject: { subjectId, sessionCount: 2 },
    });
    expect(subjectHistory).toMatchObject({ status: "found", subjectId });
    if (subjectHistory.status === "found") {
      expect(subjectHistory.sessions).toHaveLength(1);
      expect(subjectHistory.sessions[0]?.sessionId).toBe(seeded.returning.sessionId);
      expect(subjectHistory.sessions[0]?.subjectId).toBe(subjectId);
    }
  });

  it("compares two complete stored sessions without merging inference types", async () => {
    const result = comparisonToolResultSchema.parse(await tools.compareSessions({
      sessionA: seeded.initial.sessionId,
      sessionB: seeded.returning.sessionId,
    }));

    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.sessions.map(session => session.sessionId)).toEqual([
        seeded.initial.sessionId,
        seeded.returning.sessionId,
      ]);
      expect(result.sessions[0].assessment.human).toEqual(seeded.initial.human);
      expect(result.sessions[0].assessment.identity).toEqual(seeded.initial.identity);
    }
  });

  it("returns exact risk flags and score components as focused views", async () => {
    const flags = riskFlagsToolResultSchema.parse(await tools.getRiskFlags({
      sessionId: seeded.headless.sessionId,
    }));
    const breakdown = scoreBreakdownToolResultSchema.parse(await tools.getScoreBreakdown({
      sessionId: seeded.headless.sessionId,
    }));

    expect(flags).toEqual({
      status: "found",
      sessionId: seeded.headless.sessionId,
      flags: seeded.headless.human.flags,
    });
    expect(breakdown).toEqual({
      status: "found",
      sessionId: seeded.headless.sessionId,
      score: seeded.headless.human.score,
      confidence: seeded.headless.human.confidence,
      scoringVersion: seeded.headless.human.scoringVersion,
      components: seeded.headless.human.components,
    });
  });

  it("rejects malformed identifiers, unbounded limits, and self-comparisons", async () => {
    await expect(tools.getSession({ sessionId: "invalid" })).rejects.toBeInstanceOf(InvestigationToolInputError);
    await expect(tools.getSubjectHistory({ subjectId: "0id_valid", limit: 21 })).rejects.toBeInstanceOf(
      InvestigationToolInputError,
    );
    await expect(tools.compareSessions({
      sessionA: seeded.initial.sessionId,
      sessionB: seeded.initial.sessionId,
    })).rejects.toBeInstanceOf(InvestigationToolInputError);
  });

  it("cannot read evidence from a different server-selected namespace", async () => {
    const liveTools = new InvestigationTools(history, "live-v1");
    await expect(liveTools.getSession({ sessionId: seeded.initial.sessionId })).resolves.toEqual({
      status: "not_found",
      entity: "session",
      sessionId: seeded.initial.sessionId,
    });
  });
});
