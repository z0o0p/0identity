import { describe, expect, it } from "vitest";
import type { HumanScoreComponents } from "../src/shared/domain";
import { assessHumanLikelihood, fuseHumanScore } from "../src/scoring/human";
import { inconsistentEnvironmentSignals, normalHumanSignals, regularAutomationSignals } from "./fixtures/signals";

describe("human-likelihood scoring", () => {
  it("scores a varied, sufficiently observed session highly", () => {
    const assessment = assessHumanLikelihood(normalHumanSignals, {
      server: { userAgent: normalHumanSignals.environment!.userAgent },
    });

    expect(assessment.score).toBeGreaterThanOrEqual(8);
    expect(assessment.confidence).toBeGreaterThanOrEqual(0.7);
    expect(assessment.flags).toEqual([]);
    expect(assessment.components.network).toBeUndefined();
    expect(assessment.components.history).toBeUndefined();
  });

  it("identifies highly regular behavior without claiming certainty", () => {
    const human = assessHumanLikelihood(normalHumanSignals);
    const automation = assessHumanLikelihood(regularAutomationSignals);

    expect(automation.score).toBeLessThan(human.score);
    expect(automation.flags.map(flag => flag.code)).toEqual(
      expect.arrayContaining(["highly_regular_pointer", "highly_regular_keyboard"]),
    );
    expect(automation.confidence).toBeLessThanOrEqual(1);
  });

  it("reports explainable contradictions for an inconsistent environment", () => {
    const assessment = assessHumanLikelihood(inconsistentEnvironmentSignals, {
      server: { userAgent: normalHumanSignals.environment!.userAgent },
    });
    const codes = assessment.flags.map(flag => flag.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        "browser_platform_mismatch",
        "browser_user_agent_mismatch",
        "header_browser_mismatch",
        "unexpected_api_support",
        "rendering_environment_mismatch",
        "implausible_touch_configuration",
        "webdriver_exposed",
      ]),
    );
    expect(assessment.components.consistency?.score).toBe(0);
    expect(assessment.score).toBeLessThan(assessHumanLikelihood(normalHumanSignals).score);
  });

  it("uses low confidence, not a low human score, for an empty observation", () => {
    const assessment = assessHumanLikelihood({ schemaVersion: 1 });

    expect(assessment.score).toBe(5);
    expect(assessment.confidence).toBe(0);
    expect(assessment.components).toEqual({});
    expect(assessment.flags).toEqual([]);
  });

  it("keeps score and confidence inside their documented bounds", () => {
    const components: HumanScoreComponents = {
      behavior: { score: -10, confidence: 2, evidenceCount: 1 },
      consistency: { score: 20, confidence: 2, evidenceCount: 1 },
    };

    const assessment = fuseHumanScore(components);
    expect(assessment.score).toBeGreaterThanOrEqual(0);
    expect(assessment.score).toBeLessThanOrEqual(10);
    expect(assessment.confidence).toBeGreaterThanOrEqual(0);
    expect(assessment.confidence).toBeLessThanOrEqual(1);
  });

  it("applies the centralized component weights", () => {
    const fixed = {
      consistency: { score: 5, confidence: 1, evidenceCount: 1 },
      device: { score: 5, confidence: 1, evidenceCount: 1 },
      network: { score: 5, confidence: 1, evidenceCount: 1 },
      history: { score: 5, confidence: 1, evidenceCount: 1 },
    } satisfies HumanScoreComponents;

    const lowBehavior = fuseHumanScore({ ...fixed, behavior: { score: 0, confidence: 1, evidenceCount: 1 } });
    const highBehavior = fuseHumanScore({ ...fixed, behavior: { score: 10, confidence: 1, evidenceCount: 1 } });

    expect(highBehavior.score - lowBehavior.score).toBe(4);
  });

  it("reduces confidence when otherwise identical evidence is sparse", () => {
    const sparse = structuredClone(normalHumanSignals);
    sparse.behavior!.pointer!.eventCount = 4;
    sparse.behavior!.scroll!.eventCount = 2;
    sparse.behavior!.keyboard!.eventCount = 2;
    sparse.behavior!.session!.durationMs = 1_000;
    sparse.behavior!.session!.interactionCount = 2;

    expect(assessHumanLikelihood(sparse).confidence).toBeLessThan(assessHumanLikelihood(normalHumanSignals).confidence);
  });
});
