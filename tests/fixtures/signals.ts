import type { ClientSignals } from "../../src/signals/schema";

const CHROME_MAC_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36";

export const normalHumanSignals: ClientSignals = {
  schemaVersion: 1,
  environment: {
    browserFamily: "chromium",
    platformFamily: "macos",
    userAgent: CHROME_MAC_USER_AGENT,
    locale: "en-GB",
    timezone: "Asia/Kolkata",
    screen: { width: 1_920, height: 1_080 },
    viewport: { width: 1_440, height: 900 },
    devicePixelRatio: 2,
    hardwareConcurrency: 10,
    deviceMemoryGb: 8,
    maxTouchPoints: 0,
    capabilities: { touchEvents: false, webgl: true, chromeRuntime: true, webdriver: false },
    webgl: { vendor: "Google Inc.", renderer: "ANGLE (Apple, Apple M2, Metal)" },
  },
  behavior: {
    pointer: {
      eventCount: 140,
      clickCount: 5,
      velocityCoefficientOfVariation: 0.62,
      accelerationCoefficientOfVariation: 0.79,
      pauseCoefficientOfVariation: 0.55,
      directionChangeRate: 0.31,
    },
    scroll: {
      eventCount: 42,
      velocityCoefficientOfVariation: 0.71,
      pauseCoefficientOfVariation: 0.64,
      directionChangeRate: 0.18,
    },
    keyboard: {
      eventCount: 57,
      interKeyCoefficientOfVariation: 0.48,
      keyDownCoefficientOfVariation: 0.37,
      correctionRate: 0.08,
    },
    session: {
      durationMs: 31_000,
      interactionCount: 61,
      interactionTypeCount: 4,
      activeRatio: 0.58,
    },
  },
};

export const regularAutomationSignals: ClientSignals = {
  ...normalHumanSignals,
  behavior: {
    ...normalHumanSignals.behavior,
    pointer: {
      eventCount: 140,
      clickCount: 5,
      velocityCoefficientOfVariation: 0.01,
      accelerationCoefficientOfVariation: 0.01,
      pauseCoefficientOfVariation: 0.01,
      directionChangeRate: 0.005,
    },
    keyboard: {
      eventCount: 57,
      interKeyCoefficientOfVariation: 0.01,
      keyDownCoefficientOfVariation: 0.01,
      correctionRate: 0,
    },
  },
};

export const inconsistentEnvironmentSignals: ClientSignals = {
  ...normalHumanSignals,
  environment: {
    ...normalHumanSignals.environment!,
    browserFamily: "safari",
    platformFamily: "windows",
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/140.0.0.0 Safari/537.36",
    maxTouchPoints: 0,
    capabilities: { touchEvents: true, webgl: true, chromeRuntime: true, webdriver: true },
    webgl: { vendor: "Google Inc.", renderer: "Google SwiftShader" },
  },
};
