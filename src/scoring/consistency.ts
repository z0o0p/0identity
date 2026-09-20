import type { ComponentAssessment, RiskFlag } from "../shared/domain";
import type { ServerSignalContext } from "../signals/schema";
import type { NormalizedSignals } from "../signals/normalize";

type BrowserFamily = NonNullable<NormalizedSignals["environment"]>["browserFamily"];
type PlatformFamily = NonNullable<NormalizedSignals["environment"]>["platformFamily"];

const FLAG_DEDUCTIONS: Record<RiskFlag["severity"], number> = {
  low: 1,
  medium: 2,
  high: 3.5,
};

function inferBrowser(userAgent: string): BrowserFamily | undefined {
  if (userAgent.includes("firefox/")) return "firefox";
  if (userAgent.includes("chrome/") || userAgent.includes("chromium/") || userAgent.includes("crios/")) return "chromium";
  if (userAgent.includes("safari/") && !userAgent.includes("chrome/")) return "safari";
  return undefined;
}

function inferPlatform(userAgent: string): PlatformFamily | undefined {
  if (userAgent.includes("android")) return "android";
  if (userAgent.includes("iphone") || userAgent.includes("ipad")) return "ios";
  if (userAgent.includes("windows")) return "windows";
  if (userAgent.includes("macintosh") || userAgent.includes("mac os")) return "macos";
  if (userAgent.includes("linux")) return "linux";
  return undefined;
}

function flag(
  code: RiskFlag["code"],
  severity: RiskFlag["severity"],
  explanation: string,
): RiskFlag {
  return { code, category: "environment", severity, explanation };
}

export function inspectEnvironmentConsistency(
  signals: NormalizedSignals,
  serverContext: ServerSignalContext = {},
): { component?: ComponentAssessment; flags: RiskFlag[] } {
  const environment = signals.environment;
  if (!environment) return { flags: [] };

  const flags: RiskFlag[] = [];
  let checks = 0;

  const clientBrowser = inferBrowser(environment.userAgent);
  if (clientBrowser) {
    checks += 1;
    if (environment.browserFamily !== "other" && clientBrowser !== environment.browserFamily) {
      flags.push(flag("browser_user_agent_mismatch", "high", "The declared browser conflicts with the browser user agent."));
    }
  }

  const clientPlatform = inferPlatform(environment.userAgent);
  if (clientPlatform) {
    checks += 1;
    if (environment.platformFamily !== "other" && clientPlatform !== environment.platformFamily) {
      flags.push(flag("browser_platform_mismatch", "high", "The declared platform conflicts with the browser user agent."));
    }
  }

  const headerUserAgent = serverContext.userAgent?.trim().toLowerCase();
  if (headerUserAgent) {
    const headerBrowser = inferBrowser(headerUserAgent);
    if (headerBrowser) {
      checks += 1;
      if (environment.browserFamily !== "other" && headerBrowser !== environment.browserFamily) {
        flags.push(flag("header_browser_mismatch", "high", "The declared browser conflicts with the request user agent."));
      }
    }
  }

  const chromeRuntime = environment.capabilities?.chromeRuntime;
  if (chromeRuntime !== undefined) {
    checks += 1;
    if (chromeRuntime && environment.browserFamily !== "chromium") {
      flags.push(flag("unexpected_api_support", "medium", "A Chromium-specific capability was reported by another browser family."));
    }
  }

  const touchEvents = environment.capabilities?.touchEvents;
  if (touchEvents !== undefined && environment.maxTouchPoints !== undefined) {
    checks += 1;
    if (touchEvents && environment.maxTouchPoints === 0) {
      flags.push(flag("implausible_touch_configuration", "medium", "Touch events are reported while the device exposes no touch points."));
    }
  }

  if (environment.webgl) {
    checks += 1;
    if (/swiftshader|llvmpipe|software rasterizer/.test(environment.webgl.renderer)) {
      flags.push(flag("rendering_environment_mismatch", "medium", "The WebGL renderer reports a software-rendered environment."));
    }
  }

  checks += 1;
  if (environment.userAgent.includes("headless")) {
    flags.push(flag("rendering_environment_mismatch", "high", "The browser user agent identifies a headless environment."));
  }

  if (environment.capabilities?.webdriver !== undefined) {
    checks += 1;
    if (environment.capabilities.webdriver) {
      flags.push(flag("webdriver_exposed", "high", "The browser exposes an active automation controller."));
    }
  }

  const uniqueFlags = [...new Map(flags.map(item => [item.code, item])).values()];
  const score = Math.max(0, 10 - uniqueFlags.reduce((total, item) => total + FLAG_DEDUCTIONS[item.severity], 0));

  return {
    component: {
      score,
      confidence: Math.min(1, checks / 6),
      evidenceCount: checks,
    },
    flags: uniqueFlags,
  };
}
