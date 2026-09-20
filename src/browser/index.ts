import { assessmentResponseSchema, type AssessmentResponse } from "../api/assessment";
import { clientSignalsSchema, type ClientSignals } from "../signals/schema";
import { BehaviorCollector } from "./collector";
import { createBrowserRuntime, type Unsubscribe, type ZeroIdentityRuntime } from "./runtime";

export interface ZeroIdentityOptions {
  endpoint?: string;
}

export interface AssessmentOptions {
  signal?: AbortSignal;
}

export class ZeroIdentity {
  private readonly endpoint: string;
  private readonly runtime: ZeroIdentityRuntime;
  private collector: BehaviorCollector | undefined;
  private listeners: Unsubscribe[] = [];

  constructor(options: ZeroIdentityOptions = {}, runtime: ZeroIdentityRuntime = createBrowserRuntime()) {
    this.endpoint = (options.endpoint ?? "/api/v1").replace(/\/+$/, "");
    this.runtime = runtime;
  }

  start(): this {
    if (this.collector) return this;
    const collector = new BehaviorCollector(this.runtime.now());
    this.collector = collector;
    try {
      this.listeners.push(this.runtime.onPointerMove(sample => collector.pointerMoved(sample)));
      this.listeners.push(this.runtime.onPointerDown(time => collector.pointerClicked(time)));
      this.listeners.push(this.runtime.onScroll(sample => collector.scrolled(sample)));
      this.listeners.push(this.runtime.onKeyDown(sample => collector.keyPressed(sample)));
      this.listeners.push(this.runtime.onKeyUp(time => collector.keyReleased(time)));
    } catch (error) {
      this.stop();
      throw error;
    }
    return this;
  }

  stop(): void {
    const listeners = this.listeners;
    this.listeners = [];
    this.collector = undefined;
    let cleanupError: unknown;
    for (const unsubscribe of listeners) {
      try {
        unsubscribe();
      } catch (error) {
        cleanupError ??= error;
      }
    }
    if (cleanupError) throw cleanupError;
  }

  async assess(options: AssessmentOptions = {}): Promise<AssessmentResponse> {
    const collector = this.collector;
    if (!collector) throw new Error("ZeroIdentity.start() must be called before assess().");
    const signals = clientSignalsSchema.parse({
      schemaVersion: 1,
      environment: this.runtime.environment(),
      behavior: collector.snapshot(this.runtime.now()),
    } satisfies ClientSignals);
    const response = await this.runtime.fetch(`${this.endpoint}/assess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      ...(options.signal ? { signal: options.signal } : {}),
      body: JSON.stringify({ signals }),
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Error("The assessment endpoint returned an invalid response.");
    }
    if (!response.ok) throw new Error(this.apiErrorMessage(body));
    const assessment = assessmentResponseSchema.safeParse(body);
    if (!assessment.success) throw new Error("The assessment endpoint returned an invalid response.");
    return assessment.data;
  }

  private apiErrorMessage(value: unknown): string {
    if (typeof value !== "object" || value === null || !("error" in value)) {
      return "The assessment request failed.";
    }
    const error = value.error;
    if (typeof error !== "object" || error === null || !("message" in error)) {
      return "The assessment request failed.";
    }
    return typeof error.message === "string" ? error.message : "The assessment request failed.";
  }
}

export type { ZeroIdentityRuntime } from "./runtime";
