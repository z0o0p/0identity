// @vitest-environment jsdom
import { act, createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assessHumanLikelihood } from "../src/scoring/human";
import { generateSimulation } from "../src/simulator/profiles";
import { pageFromHash } from "./lib/navigation";
import appStyles from "./App.module.css";
import homeStyles from "./pages/Home.module.css";
import faqStyles from "./pages/Faqs.module.css";
import signalStyles from "./components/SignalIllustration.module.css";
import simulatorStyles from "./components/Simulator.module.css";
import resultStyles from "./components/AssessmentResult.module.css";

const classes = {
  ...appStyles,
  ...homeStyles,
  ...faqStyles,
  ...signalStyles,
  ...simulatorStyles,
  ...resultStyles,
};
const cssSelector = (selector: string) =>
  selector.replace(/\.([a-z][\w-]*)/g, (match, name: string) =>
    classes[name] ? `.${classes[name]}` : match,
  );

let root: Root;
let host: HTMLDivElement;
let App: ComponentType;

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("prefers-reduced-motion: reduce"),
    media: query,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() { }
      disconnect() { }
    },
  );
  vi.spyOn(window, "scrollTo").mockImplementation(() => { });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ status: "ok", service: "0identity" })),
  );
  window.history.replaceState(null, "", "/");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  App = (await import("./App")).App;
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount(hash = "#/") {
  window.history.replaceState(null, "", hash);
  await act(async () => root.render(createElement(App)));
}

async function navigate(hash: string) {
  await act(async () => {
    window.history.pushState(null, "", hash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

const queryAll = (selector: string) =>
  host.querySelectorAll(cssSelector(selector));

function element<T extends Element>(selector: string): T {
  const target = host.querySelector<T>(cssSelector(selector));
  if (!target) throw new Error(`Missing test element: ${selector}`);
  return target;
}

describe("redesigned application navigation", () => {
  it("loads deep links, updates active navigation, and restores content on history navigation", async () => {
    await mount("#/simulator");
    expect(element("h1").textContent).toBe("Simulator");
    expect(element('nav [aria-current="page"]').textContent).toBe("SIMULATOR");
    expect(element('section[aria-label="Simulator"] h1').textContent).toBe("Simulator");
    await navigate("#/faqs");
    expect(queryAll(".faq-item")).toHaveLength(7);
    expect(queryAll("main a")).toHaveLength(0);
    expect(document.activeElement).toBe(element("main"));
    await navigate("#/simulator");
    expect(document.title).toBe("0identity");
    expect(queryAll('input[name="simulation-profile"]')).toHaveLength(7);
    expect(pageFromHash("#/constructor")).toBe("home");
    expect(pageFromHash("#/unknown")).toBe("home");
  });

  it("keeps hero content visible with reduced motion and does not collect browser signals", async () => {
    await mount();
    expect(element("h1").textContent).toBe("ARE YOU human?");
    expect(
      queryAll("main a, main button, .eyebrow"),
    ).toHaveLength(0);
    expect(
      element(".signal-illustration").getAttribute("aria-label"),
    ).toContain("not live results");
    expect(queryAll(".wordmark")).toHaveLength(1);
    expect(element('nav a[href="#/"]').textContent?.trim()).toBe("HOME");
    expect(element(".hero-description").textContent).toContain(
      "anonymous subject",
    );
    expect(element(".signal-core").textContent).toBe("");
    expect(element("footer").textContent).not.toContain(
      "Evidence over assumptions",
    );
    expect(element<HTMLElement>("h1").style.opacity).not.toBe("0");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("/api/v1/health");
  });

  it("opens and closes FAQs with accurate accessibility state", async () => {
    await mount("#/faqs");
    const button = element<HTMLButtonElement>(
      ".faq-item:nth-of-type(2) button",
    );
    const answer = element<HTMLElement>(".faq-item:nth-of-type(2) .faq-answer");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(answer.hidden).toBe(true);
    await act(async () => button.click());
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(answer.hidden).toBe(false);
    expect(answer.textContent).toContain(
      "missing data is not proof of automation",
    );
    await act(async () =>
      element<HTMLButtonElement>(".faq-item:first-of-type button").click(),
    );
    expect(answer.hidden).toBe(true);
    expect(queryAll('.faq-item button[aria-expanded="true"]')).toHaveLength(1);
    expect(queryAll("main a")).toHaveLength(0);
    await act(async () => button.click());
    await act(async () => button.click());
    expect(answer.hidden).toBe(true);
  });

  it("closes the mobile menu on Escape and restores focus to its trigger", async () => {
    await mount();
    const button = element<HTMLButtonElement>(".menu-toggle");
    await act(async () => button.click());
    expect(button.getAttribute("aria-expanded")).toBe("true");
    await act(async () =>
      element("nav").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });

  it("runs the Simulator and displays separate scoring and continuity results", async () => {
    await mount("#/simulator");
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        assessmentId: "asm_ui",
        sessionId: "sess_ui",
        human: assessHumanLikelihood(generateSimulation("normal-human")),
        identity: {
          matchStatus: "new",
          subjectId: "0id_ui",
          continuityConfidence: 0,
          evidence: [],
          reason: "No existing subject matched.",
        },
      }),
    );
    await act(async () =>
      element<HTMLButtonElement>(".run-assessment").click(),
    );
    expect(element('[role="region"][aria-label="Simulation results"] .result h2').textContent).toBe("Human visitor");
    expect(element(".identity-result").textContent).toContain(
      "0% continuity confidence",
    );
    expect(element(".score-value").textContent).toContain("/ 10");
    expect(vi.mocked(fetch).mock.calls.at(-1)?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ profile: "normal-human" }),
    });
  });

  it("keeps simulator failures visible and allows another attempt", async () => {
    await mount("#/simulator");
    vi.mocked(fetch).mockRejectedValueOnce(
      new Error("Simulation temporarily unavailable."),
    );
    await act(async () =>
      element<HTMLButtonElement>(".run-assessment").click(),
    );
    expect(element('[role="alert"]').textContent).toBe(
      "Simulation temporarily unavailable.",
    );
    expect(element<HTMLButtonElement>(".run-assessment").disabled).toBe(false);
  });

  it("cleans up illustration animations on navigation when motion is enabled", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion: no-preference"),
      media: query,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const { gsap } = await import("gsap");
    await mount("#/");
    const packet = element(".flow-packet");
    expect(gsap.getTweensOf(packet).length).toBeGreaterThan(0);
    const loop = gsap.getTweensOf(packet)[0]!.parent;
    if (!loop) throw new Error("Missing signal loop");
    expect(loop.repeat()).toBe(-1);
    const random = vi.spyOn(Math, "random").mockReturnValue(0.2);
    const bar = element(".signal-mini-bars i");
    loop.totalTime(loop.duration());
    const firstTransition = gsap.getTweensOf(bar)[0];
    expect(firstTransition).toBeDefined();
    firstTransition!.progress(1);
    const firstHeight = gsap.getProperty(bar, "scaleY");
    expect(Number(firstHeight)).toBeCloseTo(0.4);
    random.mockReturnValue(0.8);
    loop.totalTime(loop.duration() * 2 + loop.repeatDelay());
    const nextTransition = gsap.getTweensOf(bar)[0];
    expect(nextTransition).toBeDefined();
    expect(nextTransition).not.toBe(firstTransition);
    expect(gsap.getProperty(bar, "scaleY")).toBe(firstHeight);
    nextTransition!.progress(1);
    expect(Number(gsap.getProperty(bar, "scaleY"))).toBeCloseTo(0.85);
    loop.totalTime(0.01);
    expect(Number(gsap.getProperty(bar, "scaleY"))).toBeCloseTo(0.85);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    random.mockRestore();
    loop.totalTime(loop.duration());
    expect(gsap.getTweensOf(bar).length).toBeGreaterThan(0);
    await navigate("#/faqs");
    expect(gsap.getTweensOf(packet)).toHaveLength(0);
    expect(gsap.getTweensOf(bar)).toHaveLength(0);
    await navigate("#/");
    const nextPacket = element(".flow-packet");
    expect(gsap.getTweensOf(nextPacket).length).toBeGreaterThan(0);
    await act(async () => root.render(null));
    expect(gsap.getTweensOf(nextPacket)).toHaveLength(0);
  });

});
