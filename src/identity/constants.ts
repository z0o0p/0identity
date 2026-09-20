import type { IdentityEvidenceClass } from "../shared/domain";

export const IDENTITY_EVIDENCE_WEIGHTS: Record<IdentityEvidenceClass, number> = {
  behavior: 0.45,
  device: 0.35,
  context: 0.15,
  network: 0.05,
};

export const IDENTITY_MATCH_THRESHOLDS = {
  matchSimilarity: 0.82,
  matchConfidence: 0.65,
  uncertainSimilarity: 0.62,
  uncertainConfidence: 0.35,
  minimumDeviceSimilarityForMatch: 0.72,
  minimumDeviceQualityForMatch: 0.5,
  ambiguityMargin: 0.04,
} as const;

export const IDENTITY_VECTOR_VERSION = "identity-features-v1";
