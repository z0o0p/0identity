import { describe, expect, it } from "vitest";
import { assessmentRequestSchema, assessmentResponseSchema } from "../src/api/assessment";
import { ZeroIdentity } from "../src/browser";
import type {
  KeyboardSample,
  PointerSample,
  ScrollSample,
  ZeroIdentityRuntime,
} from "../src/browser/runtime";
import type { ClientSignals } from "../src/signals/schema";

type Listener<T> = (sample: T) => void;

const environment: NonNullable<ClientSignals["environment"]> = {
  browserFamily: "chromium",
  platformFamily: "macos",
  userAgent: "Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36",
  locale: "en-GB",
  timezone: "Asia/Kolkata",
  screen: { width: 1_920, height: 1_080 },
  viewport: { width: 1_440, height: 900 },
  devicePixelRatio: 2,
  hardwareConcurrency: 10,
  deviceMemoryGb: 8,
  maxTouchPoints: 0,
  capabilities: { touchEvents: false, webgl: true, chromeRuntime: true, webdriver: false },
};

function validResponse() {
  return assessmentResponseSchema.parse({
    assessmentId: "asm_browser",
    sessionId: "sess_browser",
    human: {
      score: 8.7,
      confidence: 0.8,
      components: {},
      flags: [],
      scoringVersion: "human-heuristic-v1",
    },
    identity: {
      matchStatus: "new",
      subjectId: "0id_browser",
      continuityConfidence: 0,
      evidence: [],
      reason: "A new anonymous subject was created.",
    },
  });
}

class FakeRuntime implements ZeroIdentityRuntime {
  nowValue = 0;
  request?: { input: string; init: RequestInit };
  response = Response.json(validResponse());
  readonly pointerMoves = new Set<Listener<PointerSample>>();
  readonly pointerDowns = new Set<Listener<number>>();
  readonly scrolls = new Set<Listener<ScrollSample>>();
  readonly keyDowns = new Set<Listener<KeyboardSample>>();
  readonly keyUps = new Set<Listener<number>>();

  now(): number {
    return this.nowValue;
  }

  environment(): NonNullable<ClientSignals["environment"]> {
    return structuredClone(environment);
  }

  onPointerMove(listener: Listener<PointerSample>) {
    return this.subscribe(this.pointerMoves, listener);
  }

  onPointerDown(listener: Listener<number>) {
    return this.subscribe(this.pointerDowns, listener);
  }

  onScroll(listener: Listener<ScrollSample>) {
    return this.subscribe(this.scrolls, listener);
  }

  onKeyDown(listener: Listener<KeyboardSample>) {
    return this.subscribe(this.keyDowns, listener);
  }

  onKeyUp(listener: Listener<number>) {
    return this.subscribe(this.keyUps, listener);
  }

  async fetch(input: string, init: RequestInit): Promise<Response> {
    this.request = { input, init };
    return this.response;
  }

  listenerCount(): number {
    return this.pointerMoves.size + this.pointerDowns.size + this.scrolls.size + this.keyDowns.size + this.keyUps.size;
  }

  private subscribe<T>(listeners: Set<Listener<T>>, listener: Listener<T>) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
}

function emit<T>(listeners: Set<Listener<T>>, sample: T): void {
  for (const listener of listeners) listener(sample);
}

describe("ZeroIdentity browser SDK", () => {
  it("collects bounded aggregates and submits no raw keyboard content", async () => {
    const runtime = new FakeRuntime();
    const client = new ZeroIdentity({ endpoint: "/custom/v1/" }, runtime).start();
    emit(runtime.pointerMoves, { x: 0, y: 0, time: 100 });
    emit(runtime.pointerMoves, { x: 12, y: 4, time: 130 });
    emit(runtime.pointerMoves, { x: 18, y: 18, time: 190 });
    emit(runtime.pointerDowns, 200);
    emit(runtime.scrolls, { deltaY: 120, time: 250 });
    emit(runtime.scrolls, { deltaY: -80, time: 310 });
    emit(runtime.keyDowns, { correction: false, repeated: false, time: 350 });
    emit(runtime.keyUps, 410);
    emit(runtime.keyDowns, { correction: true, repeated: false, time: 500 });
    emit(runtime.keyUps, 570);
    runtime.nowValue = 1_000;

    const result = await client.assess();
    expect(result.assessmentId).toBe("asm_browser");
    expect(runtime.request?.input).toBe("/custom/v1/assess");
    const bodyText = String(runtime.request?.init.body);
    const request = assessmentRequestSchema.parse(JSON.parse(bodyText));
    expect(request.signals.behavior).toMatchObject({
      pointer: { eventCount: 3, clickCount: 1 },
      scroll: { eventCount: 2, directionChangeRate: 1 },
      keyboard: { eventCount: 2, correctionRate: 0.5 },
      session: { interactionTypeCount: 3 },
    });
    expect(Object.keys(request.signals.behavior?.keyboard ?? {}).sort()).toEqual([
      "correctionRate",
      "eventCount",
      "interKeyCoefficientOfVariation",
      "keyDownCoefficientOfVariation",
    ]);
    expect(bodyText).not.toContain("Backspace");
  });

  it("starts idempotently and removes every listener on stop", () => {
    const runtime = new FakeRuntime();
    const client = new ZeroIdentity({}, runtime);

    client.start().start();
    expect(runtime.listenerCount()).toBe(5);
    client.stop();
    expect(runtime.listenerCount()).toBe(0);
    client.stop();
    expect(runtime.listenerCount()).toBe(0);
  });

  it("requires explicit collection start and discards aggregates after stop", async () => {
    const runtime = new FakeRuntime();
    const client = new ZeroIdentity({}, runtime);

    await expect(client.assess()).rejects.toThrow("start() must be called");
    client.start();
    client.stop();
    await expect(client.assess()).rejects.toThrow("start() must be called");
  });

  it("surfaces safe API errors", async () => {
    const runtime = new FakeRuntime();
    runtime.response = Response.json({ error: { code: "invalid_request", message: "Signals were rejected." } }, { status: 400 });

    await expect(new ZeroIdentity({}, runtime).start().assess()).rejects.toThrow("Signals were rejected.");
  });
});
