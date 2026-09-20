import type { NormalizedSignals } from "../signals/normalize";
import { IDENTITY_VECTOR_VERSION } from "./constants";
import { z } from "zod";

export interface IdentityFeatureGroup {
  numeric: Readonly<Record<string, number>>;
  categorical: Readonly<Record<string, string>>;
  quality: number;
}

export interface IdentityNetworkContext {
  country?: string;
  asn?: number;
}

export interface IdentityFeatureVector {
  version: typeof IDENTITY_VECTOR_VERSION;
  behavior?: IdentityFeatureGroup;
  device?: IdentityFeatureGroup;
  context?: IdentityFeatureGroup;
  network?: IdentityFeatureGroup;
}

const featureGroupSchema = z.strictObject({
  numeric: z.record(z.string().min(1).max(80), z.number().min(0).max(1)),
  categorical: z.record(z.string().min(1).max(80), z.string().max(256)),
  quality: z.number().min(0).max(1),
});

export const identityFeatureVectorSchema = z.strictObject({
  version: z.literal(IDENTITY_VECTOR_VERSION),
  behavior: featureGroupSchema.optional(),
  device: featureGroupSchema.optional(),
  context: featureGroupSchema.optional(),
  network: featureGroupSchema.optional(),
});

const clamp = (value: number): number => Math.min(1, Math.max(0, value));
const normalized = (value: number, maximum: number): number => clamp(value / maximum);

function behaviorFeatures(signals: NormalizedSignals): IdentityFeatureGroup | undefined {
  const behavior = signals.behavior;
  if (!behavior) return undefined;

  const numeric: Record<string, number> = {};
  const qualities: number[] = [];
  const pointer = behavior.pointer;
  if (pointer) {
    numeric.pointerVelocityVariation = normalized(pointer.velocityCoefficientOfVariation, 2);
    numeric.pointerAccelerationVariation = normalized(pointer.accelerationCoefficientOfVariation, 2);
    numeric.pointerPauseVariation = normalized(pointer.pauseCoefficientOfVariation, 2);
    numeric.pointerDirectionChangeRate = pointer.directionChangeRate;
    qualities.push(clamp(pointer.eventCount / 60));
  }

  const scroll = behavior.scroll;
  if (scroll) {
    numeric.scrollVelocityVariation = normalized(scroll.velocityCoefficientOfVariation, 2);
    numeric.scrollPauseVariation = normalized(scroll.pauseCoefficientOfVariation, 2);
    numeric.scrollDirectionChangeRate = scroll.directionChangeRate;
    qualities.push(clamp(scroll.eventCount / 20));
  }

  const keyboard = behavior.keyboard;
  if (keyboard) {
    numeric.keyboardInterKeyVariation = normalized(keyboard.interKeyCoefficientOfVariation, 2);
    numeric.keyboardKeyDownVariation = normalized(keyboard.keyDownCoefficientOfVariation, 2);
    numeric.keyboardCorrectionRate = keyboard.correctionRate;
    qualities.push(clamp(keyboard.eventCount / 25));
  }

  const session = behavior.session;
  if (session) {
    numeric.sessionActiveRatio = session.activeRatio;
    numeric.sessionInteractionDiversity = normalized(session.interactionTypeCount, 4);
    qualities.push(Math.min(clamp(session.durationMs / 15_000), clamp(session.interactionCount / 20)));
  }

  if (Object.keys(numeric).length === 0) return undefined;
  return {
    numeric,
    categorical: {},
    quality: qualities.reduce((sum, quality) => sum + quality, 0) / qualities.length,
  };
}

function deviceFeatures(signals: NormalizedSignals): IdentityFeatureGroup | undefined {
  const environment = signals.environment;
  if (!environment) return undefined;

  const numeric: Record<string, number> = {};
  const categorical: Record<string, string> = {
    browserFamily: environment.browserFamily,
    platformFamily: environment.platformFamily,
  };

  if (environment.screen) {
    numeric.screenWidth = normalized(environment.screen.width, 3_840);
    numeric.screenHeight = normalized(environment.screen.height, 2_160);
  }
  if (environment.viewport) {
    numeric.viewportWidth = normalized(environment.viewport.width, 3_840);
    numeric.viewportHeight = normalized(environment.viewport.height, 2_160);
  }
  if (environment.devicePixelRatio !== undefined) {
    numeric.devicePixelRatio = normalized(environment.devicePixelRatio, 4);
  }
  if (environment.hardwareConcurrency !== undefined) {
    numeric.hardwareConcurrency = normalized(environment.hardwareConcurrency, 32);
  }
  if (environment.deviceMemoryGb !== undefined) {
    numeric.deviceMemory = normalized(environment.deviceMemoryGb, 32);
  }
  if (environment.maxTouchPoints !== undefined) {
    numeric.maxTouchPoints = normalized(environment.maxTouchPoints, 10);
  }
  if (environment.webgl) {
    categorical.webglVendor = environment.webgl.vendor;
    categorical.webglRenderer = environment.webgl.renderer;
  }

  const observed = Object.keys(numeric).length + Object.keys(categorical).length;
  return { numeric, categorical, quality: clamp(observed / 12) };
}

function contextFeatures(signals: NormalizedSignals): IdentityFeatureGroup | undefined {
  const environment = signals.environment;
  if (!environment?.locale && !environment?.timezone) return undefined;
  const categorical: Record<string, string> = {};
  if (environment.locale) categorical.locale = environment.locale;
  if (environment.timezone) categorical.timezone = environment.timezone;
  return { numeric: {}, categorical, quality: Object.keys(categorical).length / 2 };
}

function networkFeatures(context: IdentityNetworkContext | undefined): IdentityFeatureGroup | undefined {
  if (!context?.country && context?.asn === undefined) return undefined;
  const categorical: Record<string, string> = {};
  if (context.country) categorical.country = context.country.trim().toUpperCase();
  if (context.asn !== undefined) categorical.asn = String(context.asn);
  return { numeric: {}, categorical, quality: Object.keys(categorical).length / 2 };
}

export function createIdentityFeatureVector(
  signals: NormalizedSignals,
  networkContext?: IdentityNetworkContext,
): IdentityFeatureVector {
  const behavior = behaviorFeatures(signals);
  const device = deviceFeatures(signals);
  const context = contextFeatures(signals);
  const network = networkFeatures(networkContext);
  return {
    version: IDENTITY_VECTOR_VERSION,
    ...(behavior ? { behavior } : {}),
    ...(device ? { device } : {}),
    ...(context ? { context } : {}),
    ...(network ? { network } : {}),
  };
}
