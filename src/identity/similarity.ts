import type { IdentityEvidence, IdentityEvidenceClass, SubjectId } from "../shared/domain";
import { IDENTITY_EVIDENCE_WEIGHTS } from "./constants";
import type { IdentityFeatureGroup, IdentityFeatureVector } from "./features";

export interface SubjectCandidate {
  subjectId: SubjectId;
  features: IdentityFeatureVector;
}

export interface IdentityCandidateScore {
  subjectId: SubjectId;
  similarity: number;
  confidence: number;
  evidence: IdentityEvidence[];
}

const round = (value: number): number => Number(value.toFixed(4));

function compareGroups(
  evidenceClass: IdentityEvidenceClass,
  observed: IdentityFeatureGroup | undefined,
  candidate: IdentityFeatureGroup | undefined,
): IdentityEvidence | undefined {
  if (!observed || !candidate) return undefined;

  const similarities: number[] = [];
  for (const [key, value] of Object.entries(observed.numeric)) {
    const candidateValue = candidate.numeric[key];
    if (candidateValue !== undefined) similarities.push(Math.max(0, 1 - Math.abs(value - candidateValue)));
  }
  for (const [key, value] of Object.entries(observed.categorical)) {
    const candidateValue = candidate.categorical[key];
    if (candidateValue !== undefined) similarities.push(value === candidateValue ? 1 : 0);
  }
  if (similarities.length === 0) return undefined;

  const observedCount = Object.keys(observed.numeric).length + Object.keys(observed.categorical).length;
  const candidateCount = Object.keys(candidate.numeric).length + Object.keys(candidate.categorical).length;
  const overlap = similarities.length / Math.max(observedCount, candidateCount);
  const similarity = similarities.reduce((sum, value) => sum + value, 0) / similarities.length;
  const quality = Math.min(observed.quality, candidate.quality) * overlap;
  const weight = IDENTITY_EVIDENCE_WEIGHTS[evidenceClass];
  return {
    evidenceClass,
    similarity: round(similarity),
    quality: round(quality),
    weight,
    comparableFeatures: similarities.length,
    explanation: `${similarities.length} ${evidenceClass} feature${similarities.length === 1 ? " was" : "s were"} comparable.`,
  };
}

export function compareIdentityFeatures(
  observed: IdentityFeatureVector,
  candidate: SubjectCandidate,
): IdentityCandidateScore {
  const evidenceClasses = ["behavior", "device", "context", "network"] as const;
  const evidence = evidenceClasses.flatMap(evidenceClass => {
    const comparison = compareGroups(evidenceClass, observed[evidenceClass], candidate.features[evidenceClass]);
    return comparison ? [comparison] : [];
  });
  const availableWeight = evidence.reduce((sum, item) => sum + item.weight, 0);
  const similarity = availableWeight === 0
    ? 0
    : evidence.reduce((sum, item) => sum + item.similarity * item.weight, 0) / availableWeight;

  // Continuity confidence combines similarity with evidence coverage and sample
  // quality. Dissimilar high-quality observations must not report high confidence
  // in continuity, while sparse perfect comparisons remain explicitly weak.
  const evidenceQuality = evidence.reduce((sum, item) => sum + item.quality * item.weight, 0);
  const confidence = similarity * evidenceQuality;
  return {
    subjectId: candidate.subjectId,
    similarity: round(similarity),
    confidence: round(confidence),
    evidence,
  };
}
