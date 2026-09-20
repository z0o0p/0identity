import type { ClientSignals } from "../signals/schema";
import type { IdentityNetworkContext } from "../identity/features";

export const SIMULATION_PROFILES = [
  "normal-human",
  "regular-scripted-bot",
  "headless-automation",
  "returning-human-same-device",
  "returning-human-new-network",
  "possible-returning-human-new-device",
  "low-information-session",
] as const;

export type SimulationProfile = (typeof SIMULATION_PROFILES)[number];

export interface SimulationProfileDetails {
  label: string;
  description: string;
  seed: number;
}

export const SIMULATION_PROFILE_DETAILS: Record<SimulationProfile, SimulationProfileDetails> = {
  "normal-human": {
    label: "Normal human",
    description: "Varied pointer, scroll, keyboard-timing, and session activity.",
    seed: 10_031,
  },
  "regular-scripted-bot": {
    label: "Regular scripted bot",
    description: "Repeated timing and movement patterns with a coherent browser environment.",
    seed: 20_033,
  },
  "headless-automation": {
    label: "Headless automation",
    description: "Regular behavior plus contradictory automation and rendering signals.",
    seed: 30_041,
  },
  "returning-human-same-device": {
    label: "Returning human · same device",
    description: "Human-like behavior from the normal-human device and network context.",
    seed: 10_037,
  },
  "returning-human-new-network": {
    label: "Returning human · new network",
    description: "Similar behavior and device evidence observed from a changed coarse network.",
    seed: 10_039,
  },
  "possible-returning-human-new-device": {
    label: "Possible return · new device",
    description: "Similar behavior with substantially changed device evidence; expected to remain uncertain.",
    seed: 10_043,
  },
  "low-information-session": {
    label: "Low-information session",
    description: "A short observation with too little behavior for a confident result.",
    seed: 40_009,
  },
};

const CHROME_MAC_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36";

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function vary(random: () => number, center: number, range: number): number {
  return Number((center + (random() - 0.5) * range).toFixed(3));
}

function normalHuman(random: () => number): ClientSignals {
  return {
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
        eventCount: 120 + Math.floor(random() * 40),
        clickCount: 4 + Math.floor(random() * 4),
        velocityCoefficientOfVariation: vary(random, 0.62, 0.14),
        accelerationCoefficientOfVariation: vary(random, 0.79, 0.16),
        pauseCoefficientOfVariation: vary(random, 0.55, 0.12),
        directionChangeRate: vary(random, 0.31, 0.08),
      },
      scroll: {
        eventCount: 35 + Math.floor(random() * 20),
        velocityCoefficientOfVariation: vary(random, 0.71, 0.16),
        pauseCoefficientOfVariation: vary(random, 0.64, 0.14),
        directionChangeRate: vary(random, 0.18, 0.06),
      },
      keyboard: {
        eventCount: 45 + Math.floor(random() * 25),
        interKeyCoefficientOfVariation: vary(random, 0.48, 0.12),
        keyDownCoefficientOfVariation: vary(random, 0.37, 0.1),
        correctionRate: vary(random, 0.08, 0.04),
      },
      session: {
        durationMs: 28_000 + Math.floor(random() * 8_000),
        interactionCount: 52 + Math.floor(random() * 20),
        interactionTypeCount: 4,
        activeRatio: vary(random, 0.58, 0.12),
      },
    },
  };
}

function regularScriptedBot(random: () => number): ClientSignals {
  const signals = normalHuman(random);
  return {
    ...signals,
    behavior: {
      ...signals.behavior,
      pointer: {
        eventCount: 140,
        clickCount: 5,
        velocityCoefficientOfVariation: vary(random, 0.012, 0.008),
        accelerationCoefficientOfVariation: vary(random, 0.014, 0.008),
        pauseCoefficientOfVariation: vary(random, 0.011, 0.006),
        directionChangeRate: vary(random, 0.007, 0.004),
      },
      scroll: {
        eventCount: 42,
        velocityCoefficientOfVariation: vary(random, 0.02, 0.01),
        pauseCoefficientOfVariation: vary(random, 0.018, 0.008),
        directionChangeRate: vary(random, 0.012, 0.006),
      },
      keyboard: {
        eventCount: 57,
        interKeyCoefficientOfVariation: vary(random, 0.012, 0.008),
        keyDownCoefficientOfVariation: vary(random, 0.013, 0.008),
        correctionRate: 0,
      },
    },
  };
}

function headlessAutomation(random: () => number): ClientSignals {
  const signals = regularScriptedBot(random);
  return {
    ...signals,
    environment: {
      ...signals.environment!,
      browserFamily: "safari",
      platformFamily: "windows",
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/140.0.0.0 Safari/537.36",
      maxTouchPoints: 0,
      capabilities: { touchEvents: true, webgl: true, chromeRuntime: true, webdriver: true },
      webgl: { vendor: "Google Inc.", renderer: "Google SwiftShader" },
    },
  };
}

function lowInformationSession(): ClientSignals {
  return {
    schemaVersion: 1,
    environment: {
      browserFamily: "chromium",
      platformFamily: "macos",
      userAgent: CHROME_MAC_USER_AGENT,
    },
    behavior: {
      session: {
        durationMs: 900,
        interactionCount: 1,
        interactionTypeCount: 1,
        activeRatio: 0.4,
      },
    },
  };
}

function possibleReturningHumanNewDevice(random: () => number): ClientSignals {
  const signals = normalHuman(random);
  return {
    ...signals,
    environment: {
      ...signals.environment!,
      browserFamily: "firefox",
      platformFamily: "android",
      userAgent: "Mozilla/5.0 (Linux; Android 16; Mobile; rv:141.0) Gecko/141.0 Firefox/141.0",
      screen: { width: 412, height: 915 },
      viewport: { width: 412, height: 840 },
      devicePixelRatio: 3,
      hardwareConcurrency: 4,
      deviceMemoryGb: 4,
      maxTouchPoints: 5,
      capabilities: { touchEvents: true, webgl: true, chromeRuntime: false, webdriver: false },
      webgl: { vendor: "Qualcomm", renderer: "Adreno" },
    },
  };
}

function alignWithRuntimeUserAgent(signals: ClientSignals, userAgent: string): ClientSignals {
  if (!signals.environment) return signals;
  const normalized = userAgent.toLowerCase();
  const browserFamily = normalized.includes("firefox/")
    ? "firefox"
    : normalized.includes("chrome/") || normalized.includes("chromium/") || normalized.includes("crios/")
      ? "chromium"
      : normalized.includes("safari/")
        ? "safari"
        : "other";
  const platformFamily = normalized.includes("android")
    ? "android"
    : normalized.includes("iphone") || normalized.includes("ipad")
      ? "ios"
      : normalized.includes("windows")
        ? "windows"
        : normalized.includes("macintosh") || normalized.includes("mac os")
          ? "macos"
          : normalized.includes("linux")
            ? "linux"
            : "other";

  return {
    ...signals,
    environment: {
      ...signals.environment,
      userAgent,
      browserFamily,
      platformFamily,
      capabilities: {
        ...signals.environment.capabilities,
        chromeRuntime: browserFamily === "chromium",
      },
    },
  };
}

export function generateSimulation(
  profile: SimulationProfile,
  seed = SIMULATION_PROFILE_DETAILS[profile].seed,
  runtimeUserAgent?: string,
): ClientSignals {
  const random = createSeededRandom(seed);
  let signals: ClientSignals;
  switch (profile) {
    case "normal-human":
      signals = normalHuman(random);
      break;
    case "regular-scripted-bot":
      signals = regularScriptedBot(random);
      break;
    case "headless-automation":
      return headlessAutomation(random);
    case "returning-human-same-device":
    case "returning-human-new-network":
      signals = normalHuman(random);
      break;
    case "possible-returning-human-new-device":
      return possibleReturningHumanNewDevice(random);
    case "low-information-session":
      signals = lowInformationSession();
      break;
  }

  return runtimeUserAgent ? alignWithRuntimeUserAgent(signals, runtimeUserAgent) : signals;
}

export function simulationNetworkContext(profile: SimulationProfile): IdentityNetworkContext {
  return profile === "returning-human-new-network"
    ? { country: "GB", asn: 64_520 }
    : { country: "IN", asn: 64_512 };
}
