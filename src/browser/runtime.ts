import type { ClientSignals } from "../signals/schema";

export interface PointerSample {
  x: number;
  y: number;
  time: number;
}

export interface ScrollSample {
  deltaY: number;
  time: number;
}

export interface KeyboardSample {
  correction: boolean;
  repeated: boolean;
  time: number;
}

export type Unsubscribe = () => void;

export interface ZeroIdentityRuntime {
  now(): number;
  environment(): NonNullable<ClientSignals["environment"]>;
  onPointerMove(listener: (sample: PointerSample) => void): Unsubscribe;
  onPointerDown(listener: (time: number) => void): Unsubscribe;
  onScroll(listener: (sample: ScrollSample) => void): Unsubscribe;
  onKeyDown(listener: (sample: KeyboardSample) => void): Unsubscribe;
  onKeyUp(listener: (time: number) => void): Unsubscribe;
  fetch(input: string, init: RequestInit): Promise<Response>;
}

function browserFamily(userAgent: string): "chromium" | "firefox" | "safari" | "other" {
  const normalized = userAgent.toLowerCase();
  if (normalized.includes("firefox/") || normalized.includes("fxios/")) return "firefox";
  if (normalized.includes("chrome/") || normalized.includes("chromium/") || normalized.includes("crios/")) return "chromium";
  if (normalized.includes("safari/")) return "safari";
  return "other";
}

function platformFamily(userAgent: string): "windows" | "macos" | "linux" | "android" | "ios" | "other" {
  const normalized = userAgent.toLowerCase();
  if (normalized.includes("android")) return "android";
  if (normalized.includes("iphone") || normalized.includes("ipad")) return "ios";
  if (normalized.includes("windows")) return "windows";
  if (normalized.includes("macintosh") || normalized.includes("mac os")) return "macos";
  if (normalized.includes("linux")) return "linux";
  return "other";
}

function bounded(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function boundedInteger(value: number, minimum: number, maximum: number): number {
  return Math.round(bounded(value, minimum, maximum));
}

function keyboardTargetIsExcluded(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest([
    "textarea",
    "[contenteditable='true']",
    "[data-zeroidentity-ignore]",
    "input[type='password']",
    "input[autocomplete='current-password']",
    "input[autocomplete='new-password']",
  ].join(",")));
}

function webGlDetails(): { available: boolean; vendor?: string; renderer?: string } {
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl");
    if (!(context instanceof WebGLRenderingContext)) return { available: false };
    const extension = context.getExtension("WEBGL_debug_renderer_info");
    if (!extension) return { available: true };
    const vendor = context.getParameter(extension.UNMASKED_VENDOR_WEBGL);
    const renderer = context.getParameter(extension.UNMASKED_RENDERER_WEBGL);
    return {
      available: true,
      ...(typeof vendor === "string" && vendor.trim() ? { vendor: vendor.slice(0, 128) } : {}),
      ...(typeof renderer === "string" && renderer.trim() ? { renderer: renderer.slice(0, 256) } : {}),
    };
  } catch {
    return { available: false };
  }
}

function environment(): NonNullable<ClientSignals["environment"]> {
  const userAgent = (navigator.userAgent || "unknown").slice(0, 512);
  const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
  const webgl = webGlDetails();
  let timezone: string | undefined;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone?.slice(0, 64);
  } catch {
    timezone = undefined;
  }

  return {
    browserFamily: browserFamily(userAgent),
    platformFamily: platformFamily(userAgent),
    userAgent,
    ...(navigator.language?.length >= 2 ? { locale: navigator.language.slice(0, 35) } : {}),
    ...(timezone ? { timezone } : {}),
    ...(screen.width > 0 && screen.height > 0 ? { screen: {
      width: boundedInteger(screen.width, 1, 20_000),
      height: boundedInteger(screen.height, 1, 20_000),
    } } : {}),
    ...(window.innerWidth > 0 && window.innerHeight > 0
      ? { viewport: {
          width: boundedInteger(window.innerWidth, 1, 20_000),
          height: boundedInteger(window.innerHeight, 1, 20_000),
        } }
      : {}),
    ...(window.devicePixelRatio > 0 ? { devicePixelRatio: bounded(window.devicePixelRatio, 0.25, 10) } : {}),
    ...(navigator.hardwareConcurrency > 0
      ? { hardwareConcurrency: boundedInteger(navigator.hardwareConcurrency, 1, 256) }
      : {}),
    ...(navigatorWithMemory.deviceMemory && navigatorWithMemory.deviceMemory > 0
      ? { deviceMemoryGb: bounded(navigatorWithMemory.deviceMemory, 0.25, 1_024) }
      : {}),
    ...(navigator.maxTouchPoints >= 0
      ? { maxTouchPoints: boundedInteger(navigator.maxTouchPoints, 0, 32) }
      : {}),
    capabilities: {
      touchEvents: "ontouchstart" in window,
      webgl: webgl.available,
      chromeRuntime: "chrome" in window,
      webdriver: navigator.webdriver,
    },
    ...(webgl.vendor && webgl.renderer ? { webgl: { vendor: webgl.vendor, renderer: webgl.renderer } } : {}),
  };
}

function listen<K extends keyof WindowEventMap>(
  type: K,
  listener: (event: WindowEventMap[K]) => void,
  options?: AddEventListenerOptions,
): Unsubscribe {
  window.addEventListener(type, listener, options);
  return () => window.removeEventListener(type, listener, options);
}

export function createBrowserRuntime(): ZeroIdentityRuntime {
  return {
    now: () => performance.now(),
    environment,
    onPointerMove: listener => listen("pointermove", event => listener({
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp,
    }), { passive: true }),
    onPointerDown: listener => listen("pointerdown", event => listener(event.timeStamp), { passive: true }),
    onScroll: listener => listen("wheel", event => listener({ deltaY: event.deltaY, time: event.timeStamp }), { passive: true }),
    onKeyDown: listener => listen("keydown", event => {
      if (!keyboardTargetIsExcluded(event.target)) {
        listener({ correction: event.key === "Backspace", repeated: event.repeat, time: event.timeStamp });
      }
    }),
    onKeyUp: listener => listen("keyup", event => {
      if (!keyboardTargetIsExcluded(event.target)) listener(event.timeStamp);
    }),
    fetch: (input, init) => fetch(input, init),
  };
}
