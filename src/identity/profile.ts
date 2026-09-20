import { IDENTITY_EVIDENCE_WEIGHTS, IDENTITY_VECTOR_VERSION } from "./constants";
import type { IdentityFeatureGroup, IdentityFeatureVector } from "./features";

function mergeGroup(
  current: IdentityFeatureGroup | undefined,
  observed: IdentityFeatureGroup | undefined,
  previousSessionCount: number,
): IdentityFeatureGroup | undefined {
  if (!current) return observed;
  if (!observed) return current;

  const numeric: Record<string, number> = { ...current.numeric };
  for (const [key, value] of Object.entries(observed.numeric)) {
    const existing = current.numeric[key];
    numeric[key] = existing === undefined
      ? value
      : (existing * previousSessionCount + value) / (previousSessionCount + 1);
  }

  return {
    numeric,
    // Strong matches require device support, so retaining established categorical
    // values prevents one changed observation from rewriting the subject profile.
    categorical: { ...observed.categorical, ...current.categorical },
    quality: (current.quality * previousSessionCount + observed.quality) / (previousSessionCount + 1),
  };
}

export function evolveIdentityFeatureVector(
  current: IdentityFeatureVector,
  observed: IdentityFeatureVector,
  previousSessionCount: number,
): IdentityFeatureVector {
  if (previousSessionCount < 1) throw new Error("A persisted subject profile must have at least one session.");
  const behavior = mergeGroup(current.behavior, observed.behavior, previousSessionCount);
  const device = mergeGroup(current.device, observed.device, previousSessionCount);
  const context = mergeGroup(current.context, observed.context, previousSessionCount);
  const network = mergeGroup(current.network, observed.network, previousSessionCount);
  return {
    version: IDENTITY_VECTOR_VERSION,
    ...(behavior ? { behavior } : {}),
    ...(device ? { device } : {}),
    ...(context ? { context } : {}),
    ...(network ? { network } : {}),
  };
}

export function identityFeatureQuality(features: IdentityFeatureVector): number {
  const groups = ["behavior", "device", "context", "network"] as const;
  return groups.reduce((quality, group) => {
    const featuresForGroup = features[group];
    return quality + (featuresForGroup?.quality ?? 0) * IDENTITY_EVIDENCE_WEIGHTS[group];
  }, 0);
}
