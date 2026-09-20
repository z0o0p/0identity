import { describe, expect, it } from "vitest";
import type { SessionListResponse } from "../src/api/history";
import { filterDashboardSessions } from "./lib/session-filters";

const sessions: SessionListResponse["sessions"] = [
  {
    assessmentId: "asm_1",
    sessionId: "sess_human",
    createdAt: "2026-09-20T12:00:00.000Z",
    source: "simulation",
    simulationProfile: "normal-human",
    humanScore: 9,
    humanConfidence: 0.9,
    flagCodes: [],
    subjectId: "0id_alpha",
    matchStatus: "matched",
    continuityConfidence: 0.9,
  },
  {
    assessmentId: "asm_2",
    sessionId: "sess_mixed",
    createdAt: "2026-09-20T12:01:00.000Z",
    source: "simulation",
    simulationProfile: "low-information-session",
    humanScore: 5,
    humanConfidence: 0.2,
    flagCodes: [],
    subjectId: null,
    matchStatus: "uncertain",
    continuityConfidence: 0.4,
  },
  {
    assessmentId: "asm_3",
    sessionId: "sess_bot",
    createdAt: "2026-09-20T12:02:00.000Z",
    source: "simulation",
    simulationProfile: "headless-automation",
    humanScore: 2,
    humanConfidence: 0.9,
    flagCodes: ["webdriver_exposed"],
    subjectId: "0id_bot",
    matchStatus: "new",
    continuityConfidence: 0,
  },
  {
    assessmentId: "asm_4",
    sessionId: "sess_sparse",
    createdAt: "2026-09-20T12:03:00.000Z",
    source: "simulation",
    simulationProfile: "low-information-session",
    humanScore: 9,
    humanConfidence: 0.2,
    flagCodes: [],
    subjectId: "0id_sparse",
    matchStatus: "new",
    continuityConfidence: 0,
  },
];

describe("dashboard session filters", () => {
  it("filters human-likelihood bands at their documented boundaries", () => {
    expect(filterDashboardSessions(sessions, { query: "", human: "likely-human", continuity: "all" }))
      .toHaveLength(1);
    expect(filterDashboardSessions(sessions, { query: "", human: "mixed", continuity: "all" })
      .map(session => session.sessionId)).toEqual(["sess_mixed", "sess_sparse"]);
    expect(filterDashboardSessions(sessions, { query: "", human: "suspicious", continuity: "all" })[0]?.sessionId)
      .toBe("sess_bot");
  });

  it("searches identifiers, profiles, subjects, and flags", () => {
    for (const query of ["sess_bot", "headless", "0id_bot", "webdriver"]) {
      expect(filterDashboardSessions(sessions, { query, human: "all", continuity: "all" })[0]?.sessionId)
        .toBe("sess_bot");
    }
  });

  it("combines search and continuity filters", () => {
    expect(filterDashboardSessions(sessions, { query: "sess", human: "all", continuity: "uncertain" }))
      .toEqual([sessions[1]]);
  });
});
