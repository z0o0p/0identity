import type { ClientSignals } from "../signals/schema";
import { OnlineStatistics, rounded } from "./statistics";
import type { KeyboardSample, PointerSample, ScrollSample } from "./runtime";

type BehaviorSignals = NonNullable<ClientSignals["behavior"]>;

const POINTER_EVENT_LIMIT = 100_000;
const SCROLL_EVENT_LIMIT = 50_000;
const KEYBOARD_EVENT_LIMIT = 50_000;
const INTERACTION_LIMIT = 200_000;
const MAX_SESSION_DURATION_MS = 3_600_000;
const ACTIVE_INTERVAL_CAP_MS = 2_000;

function increment(value: number, maximum: number): number {
  return Math.min(maximum, value + 1);
}

export class BehaviorCollector {
  private pointerEventCount = 0;
  private pointerClickCount = 0;
  private pointerDirectionChanges = 0;
  private pointerDirectionSamples = 0;
  private previousPointer?: PointerSample;
  private previousPointerVelocity?: number;
  private previousPointerDirection?: number;
  private readonly pointerVelocities = new OnlineStatistics();
  private readonly pointerAccelerations = new OnlineStatistics();
  private readonly pointerPauses = new OnlineStatistics();

  private scrollEventCount = 0;
  private scrollDirectionChanges = 0;
  private scrollDirectionSamples = 0;
  private previousScroll?: ScrollSample;
  private previousScrollDirection?: number;
  private readonly scrollVelocities = new OnlineStatistics();
  private readonly scrollPauses = new OnlineStatistics();

  private keyboardEventCount = 0;
  private keyboardCorrections = 0;
  private previousKeyDownAt?: number;
  private pendingKeyDownAt: number | undefined;
  private readonly interKeyTimings = new OnlineStatistics();
  private readonly keyDownDurations = new OnlineStatistics();

  private interactionCount = 0;
  private activeDurationMs = 0;
  private lastInteractionAt?: number;
  private readonly interactionTypes = new Set<"pointer" | "scroll" | "keyboard">();

  constructor(private readonly startedAt: number) {}

  pointerMoved(sample: PointerSample): void {
    this.pointerEventCount = increment(this.pointerEventCount, POINTER_EVENT_LIMIT);
    this.interaction("pointer", sample.time);
    const previous = this.previousPointer;
    if (previous) {
      const elapsedMs = sample.time - previous.time;
      if (elapsedMs > 0) {
        const distance = Math.hypot(sample.x - previous.x, sample.y - previous.y);
        const velocity = distance / elapsedMs;
        const direction = Math.atan2(sample.y - previous.y, sample.x - previous.x);
        this.pointerVelocities.add(velocity);
        this.pointerPauses.add(elapsedMs);
        if (this.previousPointerVelocity !== undefined) {
          this.pointerAccelerations.add(Math.abs(velocity - this.previousPointerVelocity) / elapsedMs);
        }
        if (this.previousPointerDirection !== undefined) {
          const angularDifference = Math.abs(Math.atan2(
            Math.sin(direction - this.previousPointerDirection),
            Math.cos(direction - this.previousPointerDirection),
          ));
          if (angularDifference >= Math.PI / 4) this.pointerDirectionChanges += 1;
          this.pointerDirectionSamples += 1;
        }
        this.previousPointerVelocity = velocity;
        this.previousPointerDirection = direction;
      }
    }
    this.previousPointer = sample;
  }

  pointerClicked(time: number): void {
    this.pointerClickCount = increment(this.pointerClickCount, 10_000);
    this.interaction("pointer", time);
  }

  scrolled(sample: ScrollSample): void {
    this.scrollEventCount = increment(this.scrollEventCount, SCROLL_EVENT_LIMIT);
    this.interaction("scroll", sample.time);
    const previous = this.previousScroll;
    const direction = Math.sign(sample.deltaY);
    if (previous) {
      const elapsedMs = sample.time - previous.time;
      if (elapsedMs > 0) {
        this.scrollVelocities.add(Math.abs(sample.deltaY) / elapsedMs);
        this.scrollPauses.add(elapsedMs);
      }
    }
    if (direction !== 0 && this.previousScrollDirection !== undefined) {
      if (direction !== this.previousScrollDirection) this.scrollDirectionChanges += 1;
      this.scrollDirectionSamples += 1;
    }
    if (direction !== 0) this.previousScrollDirection = direction;
    this.previousScroll = sample;
  }

  keyPressed(sample: KeyboardSample): void {
    if (sample.repeated || this.keyboardEventCount >= KEYBOARD_EVENT_LIMIT) return;
    this.keyboardEventCount = increment(this.keyboardEventCount, KEYBOARD_EVENT_LIMIT);
    if (sample.correction) this.keyboardCorrections += 1;
    if (this.previousKeyDownAt !== undefined) this.interKeyTimings.add(sample.time - this.previousKeyDownAt);
    this.previousKeyDownAt = sample.time;
    this.pendingKeyDownAt = sample.time;
    this.interaction("keyboard", sample.time);
  }

  keyReleased(time: number): void {
    if (this.pendingKeyDownAt === undefined || time < this.pendingKeyDownAt) return;
    this.keyDownDurations.add(time - this.pendingKeyDownAt);
    this.pendingKeyDownAt = undefined;
  }

  snapshot(now: number): BehaviorSignals {
    const durationMs = Math.max(0, Math.min(MAX_SESSION_DURATION_MS, Math.round(now - this.startedAt)));
    const behavior: BehaviorSignals = {
      session: {
        durationMs,
        interactionCount: this.interactionCount,
        interactionTypeCount: this.interactionTypes.size,
        activeRatio: durationMs === 0 ? 0 : rounded(Math.min(1, this.activeDurationMs / durationMs)),
      },
    };

    if (this.pointerEventCount > 0 || this.pointerClickCount > 0) {
      behavior.pointer = {
        eventCount: this.pointerEventCount,
        clickCount: this.pointerClickCount,
        velocityCoefficientOfVariation: rounded(this.pointerVelocities.coefficientOfVariation()),
        accelerationCoefficientOfVariation: rounded(this.pointerAccelerations.coefficientOfVariation()),
        pauseCoefficientOfVariation: rounded(this.pointerPauses.coefficientOfVariation()),
        directionChangeRate: this.pointerDirectionSamples === 0
          ? 0
          : rounded(this.pointerDirectionChanges / this.pointerDirectionSamples),
      };
    }
    if (this.scrollEventCount > 0) {
      behavior.scroll = {
        eventCount: this.scrollEventCount,
        velocityCoefficientOfVariation: rounded(this.scrollVelocities.coefficientOfVariation()),
        pauseCoefficientOfVariation: rounded(this.scrollPauses.coefficientOfVariation()),
        directionChangeRate: this.scrollDirectionSamples === 0
          ? 0
          : rounded(this.scrollDirectionChanges / this.scrollDirectionSamples),
      };
    }
    if (this.keyboardEventCount > 0) {
      behavior.keyboard = {
        eventCount: this.keyboardEventCount,
        interKeyCoefficientOfVariation: rounded(this.interKeyTimings.coefficientOfVariation()),
        keyDownCoefficientOfVariation: rounded(this.keyDownDurations.coefficientOfVariation()),
        correctionRate: rounded(this.keyboardCorrections / this.keyboardEventCount),
      };
    }
    return behavior;
  }

  private interaction(type: "pointer" | "scroll" | "keyboard", time: number): void {
    this.interactionCount = increment(this.interactionCount, INTERACTION_LIMIT);
    this.interactionTypes.add(type);
    if (this.lastInteractionAt !== undefined && time >= this.lastInteractionAt) {
      this.activeDurationMs += Math.min(ACTIVE_INTERVAL_CAP_MS, time - this.lastInteractionAt);
    }
    this.lastInteractionAt = time;
  }
}
