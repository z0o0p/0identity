// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { SessionInspector } from "./components/SessionInspector";
import { assessHumanLikelihood } from "../src/scoring/human";
import { generateSimulation } from "../src/simulator/profiles";
import type { SessionDetailResponse } from "../src/api/history";

it("limits related history to five clickable IDs without outcome subtext", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const signals = generateSimulation("normal-human");
  const session: SessionDetailResponse = {
    sessionId: "sess_current", assessmentId: "asm_current", createdAt: "2026-09-23",
    source: "simulation", simulationProfile: "normal-human", subjectId: "0id_example",
    humanScore: 9, humanConfidence: 0.9, continuityConfidence: 0.8, matchStatus: "matched",
    flagCodes: [], signals,
    assessment: {
      sessionId: "sess_current", assessmentId: "asm_current", human: assessHumanLikelihood(signals),
      identity: { matchStatus: "new", subjectId: "0id_example", continuityConfidence: 0, evidence: [], reason: "New subject." },
    },
  };
  const relatedSessions = Array.from({ length: 7 }, (_, index) => ({ ...session, sessionId: `sess_${index}` }));
  const onSelectSession = vi.fn();
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(SessionInspector, { session, relatedSessions, onSelectSession })));
    const buttons = host.querySelectorAll("button");
    expect(buttons).toHaveLength(5);
    expect(buttons[0]!.textContent).toBe("sess_0");
    expect(host.textContent).not.toContain("Selected session");
    await act(async () => buttons[0]!.click());
    expect(onSelectSession).toHaveBeenCalledWith(relatedSessions[0]);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
