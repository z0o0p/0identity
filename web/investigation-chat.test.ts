// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { InvestigationChat } from "./components/InvestigationChat";

const { sendMessage, useAgent } = vi.hoisted(() => ({
  sendMessage: vi.fn(), useAgent: vi.fn(() => ({})),
}));
vi.mock("agents/react", () => ({ useAgent }));
vi.mock("./hooks/motion", () => ({ useContentMotion: () => ({ current: null }) }));
vi.mock("@cloudflare/ai-chat/react", () => ({
  useAgentChat: () => ({
    messages: [{ id: "tool-message", role: "assistant", parts: [{
      type: "tool-getSession", toolCallId: "read-session", state: "output-available",
      input: { sessionId: "sess_example" }, output: { status: "found" },
    }] }],
    sendMessage, status: "ready", clearHistory: vi.fn(), stop: vi.fn(),
  }),
}));

it("keeps chat available without context and shows actual tool activity", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(InvestigationChat, { source: "simulation" })));
    expect(host.querySelector("textarea")!.disabled).toBe(false);
    expect(host.querySelector("textarea")!.rows).toBe(2);
    expect(host.textContent).not.toContain("Context:");
    expect(host.querySelector('[aria-label="Investigation activity"]')!.textContent).toContain("Complete");
    const shortcut = [...host.querySelectorAll("button")].find(button => button.textContent === "Investigate recent suspicious sessions")!;
    await act(async () => shortcut.click());
    expect(sendMessage).toHaveBeenLastCalledWith({ text: "Investigate recent suspicious sessions" }, { body: { sessionId: null } });
    await act(async () => root.render(createElement(InvestigationChat, { source: "simulation", sessionId: "sess_example" })));
    const attachedShortcut = [...host.querySelectorAll("button")].find(button => button.textContent === "Investigate this session")!;
    await act(async () => attachedShortcut.click());
    expect(sendMessage).toHaveBeenLastCalledWith({ text: "Investigate this session" }, { body: { sessionId: "sess_example" } });
    expect(useAgent).toHaveBeenLastCalledWith({ agent: "InvestigationAgent", name: "simulation__dashboard" });
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
