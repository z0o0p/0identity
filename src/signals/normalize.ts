import type { ClientSignals } from "./schema";

export interface NormalizedSignals extends Omit<ClientSignals, "environment"> {
  environment?:
    | (Omit<NonNullable<ClientSignals["environment"]>, "userAgent"> & {
        userAgent: string;
      })
    | undefined;
}

// Text values are normalized only for comparison. The schema keeps the accepted
// input bounded, while this layer prevents casing and incidental whitespace from
// changing deterministic consistency results.
export function normalizeSignals(signals: ClientSignals): NormalizedSignals {
  if (!signals.environment) {
    return signals;
  }

  const environment = signals.environment;
  return {
    ...signals,
    environment: {
      ...environment,
      userAgent: environment.userAgent.trim().toLowerCase(),
      locale: environment.locale?.trim().toLowerCase(),
      timezone: environment.timezone?.trim(),
      webgl: environment.webgl
        ? {
            vendor: environment.webgl.vendor.trim().toLowerCase(),
            renderer: environment.webgl.renderer.trim().toLowerCase(),
          }
        : undefined,
    },
  };
}
