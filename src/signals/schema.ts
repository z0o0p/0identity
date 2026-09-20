import { z } from "zod";

const boundedCount = (maximum: number) => z.number().int().min(0).max(maximum);
const coefficientOfVariation = z.number().min(0).max(5);
const ratio = z.number().min(0).max(1);

const dimensionsSchema = z.strictObject({
  width: z.number().int().min(1).max(20_000),
  height: z.number().int().min(1).max(20_000),
});

const pointerSignalsSchema = z.strictObject({
  eventCount: boundedCount(100_000),
  clickCount: boundedCount(10_000),
  velocityCoefficientOfVariation: coefficientOfVariation,
  accelerationCoefficientOfVariation: coefficientOfVariation,
  pauseCoefficientOfVariation: coefficientOfVariation,
  directionChangeRate: ratio,
});

const scrollSignalsSchema = z.strictObject({
  eventCount: boundedCount(50_000),
  velocityCoefficientOfVariation: coefficientOfVariation,
  pauseCoefficientOfVariation: coefficientOfVariation,
  directionChangeRate: ratio,
});

const keyboardSignalsSchema = z.strictObject({
  eventCount: boundedCount(50_000),
  interKeyCoefficientOfVariation: coefficientOfVariation,
  keyDownCoefficientOfVariation: coefficientOfVariation,
  correctionRate: ratio,
});

const sessionSignalsSchema = z.strictObject({
  durationMs: z.number().int().min(0).max(3_600_000),
  interactionCount: boundedCount(200_000),
  interactionTypeCount: boundedCount(4),
  activeRatio: ratio,
});

const environmentSignalsSchema = z.strictObject({
  browserFamily: z.enum(["chromium", "firefox", "safari", "other"]),
  platformFamily: z.enum(["windows", "macos", "linux", "android", "ios", "other"]),
  userAgent: z.string().trim().min(1).max(512),
  locale: z.string().trim().min(2).max(35).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  screen: dimensionsSchema.optional(),
  viewport: dimensionsSchema.optional(),
  devicePixelRatio: z.number().min(0.25).max(10).optional(),
  hardwareConcurrency: z.number().int().min(1).max(256).optional(),
  deviceMemoryGb: z.number().min(0.25).max(1_024).optional(),
  maxTouchPoints: z.number().int().min(0).max(32).optional(),
  capabilities: z
    .strictObject({
      touchEvents: z.boolean().optional(),
      webgl: z.boolean().optional(),
      chromeRuntime: z.boolean().optional(),
      webdriver: z.boolean().optional(),
    })
    .optional(),
  webgl: z
    .strictObject({
      vendor: z.string().trim().min(1).max(128),
      renderer: z.string().trim().min(1).max(256),
    })
    .optional(),
});

export const clientSignalsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  environment: environmentSignalsSchema.optional(),
  behavior: z
    .strictObject({
      pointer: pointerSignalsSchema.optional(),
      scroll: scrollSignalsSchema.optional(),
      keyboard: keyboardSignalsSchema.optional(),
      session: sessionSignalsSchema.optional(),
    })
    .optional(),
});

export type ClientSignals = z.infer<typeof clientSignalsSchema>;

export interface ServerSignalContext {
  userAgent?: string;
}
