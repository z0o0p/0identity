import { describe, expect, it } from "vitest";
import { normalizeSignals } from "../src/signals/normalize";
import { clientSignalsSchema } from "../src/signals/schema";
import { normalHumanSignals } from "./fixtures/signals";

describe("client signal schema", () => {
  it("accepts bounded aggregate signals", () => {
    expect(clientSignalsSchema.parse(normalHumanSignals)).toEqual(normalHumanSignals);
  });

  it.each([
    { ...normalHumanSignals, sessionId: "client-chosen" },
    { ...normalHumanSignals, network: { country: "GB" } },
    { ...normalHumanSignals, behavior: { keyboard: { rawText: "secret" } } },
  ])("rejects unknown or sensitive client fields", value => {
    expect(clientSignalsSchema.safeParse(value).success).toBe(false);
  });

  it("rejects values outside explicit collection bounds", () => {
    const result = clientSignalsSchema.safeParse({
      schemaVersion: 1,
      behavior: {
        pointer: {
          eventCount: 100_001,
          clickCount: 0,
          velocityCoefficientOfVariation: 0.4,
          accelerationCoefficientOfVariation: 0.4,
          pauseCoefficientOfVariation: 0.4,
          directionChangeRate: 0.2,
        },
      },
    });

    expect(result.success).toBe(false);
  });
});

describe("signal normalization", () => {
  it("normalizes comparison text without mutating its input", () => {
    const input = structuredClone(normalHumanSignals);
    input.environment!.userAgent = `  ${input.environment!.userAgent.toUpperCase()}  `;
    input.environment!.webgl!.renderer = "  ANGLE Renderer  ";

    const normalized = normalizeSignals(input);

    expect(normalized.environment?.userAgent).toBe(normalHumanSignals.environment?.userAgent.toLowerCase());
    expect(normalized.environment?.webgl?.renderer).toBe("angle renderer");
    expect(input.environment!.userAgent).toMatch(/^  /);
  });
});
