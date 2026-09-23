// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { Dashboard } from "./components/Dashboard";

vi.mock("./hooks/motion", () => ({ useContentMotion: () => ({ current: null }) }));
vi.mock("./components/SessionInspector", () => ({
  SessionInspector: () => createElement("div", null, "Session evidence"),
}));
vi.mock("./components/InvestigationChat", () => ({
  InvestigationChat: ({ sessionId }: { sessionId: string }) => createElement("div", null, `Chat for ${sessionId}`),
}));
vi.mock("./lib/dashboard", () => ({
  getDashboardOverview: async () => ({}),
  getDashboardSessions: async () => [{
    sessionId: "sess_example", createdAt: "2026-09-20", humanScore: 9,
    humanConfidence: 0.9, continuityConfidence: 0, matchStatus: "new", flagCodes: [],
  }],
  getDashboardSession: vi.fn(async () => ({ sessionId: "sess_example", subjectId: null })),
  getSubjectSessions: async () => [],
}));
const host = document.createElement("div");
let root: ReturnType<typeof createRoot>;
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("restores session selection and places chat and evidence above the results", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const scrollIntoView = vi.fn();
  Object.defineProperty(host, "scrollIntoView", { value: scrollIntoView, configurable: true });
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
  root = createRoot(host);
  await act(async () => root.render(createElement(Dashboard, { refreshKey: 0 })));
  const section = host.querySelector('[aria-label="Session investigation"]')!;
  expect(host.querySelector("h1")!.textContent).toBe("Investigation Dashboard");
  expect(host.textContent).not.toContain("Investigation workspace");
  expect(host.textContent).not.toContain("Assessment outcomes");
  expect(section.textContent).toContain("Attach a session");
  expect(section.textContent).toContain("Chat for undefined");
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Investigate sess_example"]')!.click());
  expect(section.textContent).toContain("Chat for sess_example");
  expect(section.textContent).toContain("Session evidence");
  expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "instant", block: "start" });
  expect(section.compareDocumentPosition(host.querySelector("table")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const source = host.querySelector<HTMLSelectElement>('select[aria-label="Data source"]')!;
  await act(async () => {
    source.value = "live";
    source.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(section.textContent).not.toContain("Chat for sess_example");
  const picker = section.querySelector("select")!;
  await act(async () => {
    picker.value = "sess_example";
    picker.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(section.textContent).toContain("Chat for sess_example");
});
