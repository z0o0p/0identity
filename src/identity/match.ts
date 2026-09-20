import type { IdentityEvidence, IdentityMatch } from "../shared/domain";
import { IDENTITY_MATCH_THRESHOLDS } from "./constants";
import type { IdentityFeatureVector } from "./features";
import { compareIdentityFeatures, type IdentityCandidateScore, type SubjectCandidate } from "./similarity";

function deviceSupportsMatch(evidence: IdentityEvidence[]): boolean {
  const device = evidence.find(item => item.evidenceClass === "device");
  return Boolean(
    device
      && device.similarity >= IDENTITY_MATCH_THRESHOLDS.minimumDeviceSimilarityForMatch
      && device.quality >= IDENTITY_MATCH_THRESHOLDS.minimumDeviceQualityForMatch,
  );
}

export function decideIdentityMatch(candidateScores: readonly IdentityCandidateScore[]): IdentityMatch {
  const ranked = [...candidateScores].sort((left, right) =>
    right.similarity - left.similarity || right.confidence - left.confidence || left.subjectId.localeCompare(right.subjectId));
  const best = ranked[0];
  if (!best) {
    return {
      subjectId: null,
      continuityConfidence: 0,
      matchStatus: "new",
      evidence: [],
      reason: "No existing anonymous subjects were available for comparison.",
    };
  }

  const second = ranked[1];
  const ambiguous = Boolean(
    second
      && second.similarity >= IDENTITY_MATCH_THRESHOLDS.uncertainSimilarity
      && best.similarity - second.similarity <= IDENTITY_MATCH_THRESHOLDS.ambiguityMargin,
  );
  const canMatch = best.similarity >= IDENTITY_MATCH_THRESHOLDS.matchSimilarity
    && best.confidence >= IDENTITY_MATCH_THRESHOLDS.matchConfidence
    && deviceSupportsMatch(best.evidence)
    && !ambiguous;
  if (canMatch) {
    return {
      subjectId: best.subjectId,
      continuityConfidence: best.confidence,
      matchStatus: "matched",
      evidence: best.evidence,
      reason: "The strongest candidate met the multimodal match thresholds.",
    };
  }

  const isUncertain = best.similarity >= IDENTITY_MATCH_THRESHOLDS.uncertainSimilarity
    && best.confidence >= IDENTITY_MATCH_THRESHOLDS.uncertainConfidence;
  if (isUncertain) {
    return {
      subjectId: null,
      continuityConfidence: best.confidence,
      matchStatus: "uncertain",
      evidence: best.evidence,
      reason: ambiguous
        ? "Multiple anonymous subjects had similarly plausible evidence."
        : "The best candidate did not meet the conservative match requirements.",
    };
  }

  return {
    subjectId: null,
    continuityConfidence: best.confidence,
    matchStatus: "new",
    evidence: best.evidence,
    reason: "No candidate had enough similarity and evidence quality for continuity.",
  };
}

export function matchIdentity(
  observed: IdentityFeatureVector,
  candidates: readonly SubjectCandidate[],
): IdentityMatch {
  return decideIdentityMatch(candidates.map(candidate => compareIdentityFeatures(observed, candidate)));
}
