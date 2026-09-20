import { describe, expect, it } from "vitest";
import { assessHumanLikelihood } from "../src/scoring/human";
import { clientSignalsSchema } from "../src/signals/schema";
import { generateSimulation, SIMULATION_PROFILES } from "../src/simulator/profiles";

describe("seeded simulator", () => {
  it.each(SIMULATION_PROFILES)("generates valid deterministic signals for %s", profile => {
    const first = generateSimulation(profile);
    const second = generateSimulation(profile);

    expect(first).toEqual(second);
    expect(clientSignalsSchema.safeParse(first).success).toBe(true);
  });

  it("generates feature evidence rather than final scores", () => {
    const signals = generateSimulation("normal-human");

    expect(signals).not.toHaveProperty("score");
    expect(signals).not.toHaveProperty("confidence");
    expect(assessHumanLikelihood(signals).score).toBeGreaterThanOrEqual(8);
  });

  it("aligns ordinary profiles with the reviewer browser without changing seeded behavior", () => {
    const firefoxUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0";
    const signals = generateSimulation("normal-human", 10_031, firefoxUserAgent);

    expect(signals.environment).toMatchObject({
      browserFamily: "firefox",
      platformFamily: "windows",
      userAgent: firefoxUserAgent,
      capabilities: { chromeRuntime: false },
    });
    expect(signals.behavior).toEqual(generateSimulation("normal-human", 10_031).behavior);
  });

  it("separates the expected fixture characteristics", () => {
    const human = assessHumanLikelihood(generateSimulation("normal-human"));
    const bot = assessHumanLikelihood(generateSimulation("regular-scripted-bot"));
    const headless = assessHumanLikelihood(generateSimulation("headless-automation"));
    const lowInformation = assessHumanLikelihood(generateSimulation("low-information-session"));

    expect(human.score).toBeGreaterThan(bot.score);
    expect(bot.flags.map(flag => flag.code)).toContain("highly_regular_pointer");
    expect(headless.flags.map(flag => flag.code)).toContain("webdriver_exposed");
    expect(headless.score).toBeLessThan(bot.score);
    expect(lowInformation.confidence).toBeLessThan(human.confidence);
  });
});
