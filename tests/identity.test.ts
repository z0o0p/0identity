import { describe, expect, it } from "vitest";
import { IDENTITY_MATCH_THRESHOLDS } from "../src/identity/constants";
import { createIdentityFeatureVector, type IdentityFeatureVector } from "../src/identity/features";
import { decideIdentityMatch, matchIdentity } from "../src/identity/match";
import type { IdentityCandidateScore, SubjectCandidate } from "../src/identity/similarity";
import { normalizeSignals } from "../src/signals/normalize";
import type { ClientSignals } from "../src/signals/schema";
import { normalHumanSignals, regularAutomationSignals } from "./fixtures/signals";

function vector(signals: ClientSignals, country = "IN", asn = 64_512): IdentityFeatureVector {
  return createIdentityFeatureVector(normalizeSignals(signals), { country, asn });
}

function candidate(subjectId: string, features = vector(normalHumanSignals)): SubjectCandidate {
  return { subjectId, features };
}

function score(
  subjectId: string,
  similarity: number,
  confidence: number,
  deviceSimilarity = 1,
): IdentityCandidateScore {
  return {
    subjectId,
    similarity,
    confidence,
    evidence: [{
      evidenceClass: "device",
      similarity: deviceSimilarity,
      quality: 1,
      weight: 0.35,
      comparableFeatures: 8,
      explanation: "Synthetic policy-boundary evidence.",
    }],
  };
}

describe("identity feature extraction and matching", () => {
  it("matches a similar observation to the same anonymous subject", () => {
    const result = matchIdentity(vector(normalHumanSignals), [candidate("0id_same")]);

    expect(result).toMatchObject({ matchStatus: "matched", subjectId: "0id_same" });
    expect(result.continuityConfidence).toBeGreaterThanOrEqual(0.9);
    expect(result.evidence.map(item => item.evidenceClass)).toEqual(["behavior", "device", "context", "network"]);
  });

  it("tolerates a changed network when the stronger evidence classes agree", () => {
    const observed = vector(normalHumanSignals, "GB", 64_520);
    const result = matchIdentity(observed, [candidate("0id_traveller")]);

    expect(result).toMatchObject({ matchStatus: "matched", subjectId: "0id_traveller" });
    expect(result.evidence.find(item => item.evidenceClass === "network")?.similarity).toBe(0);
  });

  it("does not make a strong match across a substantially changed device", () => {
    const changedDevice: ClientSignals = {
      ...normalHumanSignals,
      environment: {
        ...normalHumanSignals.environment!,
        browserFamily: "firefox",
        platformFamily: "android",
        screen: { width: 412, height: 915 },
        viewport: { width: 412, height: 840 },
        devicePixelRatio: 3,
        hardwareConcurrency: 4,
        deviceMemoryGb: 4,
        maxTouchPoints: 5,
        webgl: { vendor: "qualcomm", renderer: "adreno" },
      },
    };

    const result = matchIdentity(vector(changedDevice), [candidate("0id_possible")]);
    expect(result.matchStatus).toBe("uncertain");
    expect(result.subjectId).toBeNull();
  });

  it("rejects a materially different observation as a new subject", () => {
    const differentEnvironment: ClientSignals = {
      ...regularAutomationSignals,
      environment: {
        ...regularAutomationSignals.environment!,
        browserFamily: "firefox",
        platformFamily: "linux",
        locale: "de-DE",
        timezone: "Europe/Berlin",
        screen: { width: 800, height: 600 },
        viewport: { width: 760, height: 520 },
        devicePixelRatio: 1,
        hardwareConcurrency: 2,
        deviceMemoryGb: 2,
        webgl: { vendor: "mesa", renderer: "llvmpipe" },
      },
    };

    const result = matchIdentity(vector(differentEnvironment, "DE", 64_530), [candidate("0id_other")]);
    expect(result).toMatchObject({ matchStatus: "new", subjectId: null });
    expect(result.continuityConfidence).toBeLessThan(IDENTITY_MATCH_THRESHOLDS.matchConfidence);
  });

  it("leaves two similarly plausible candidates uncertain", () => {
    const features = vector(normalHumanSignals);
    const result = matchIdentity(features, [candidate("0id_a", features), candidate("0id_b", features)]);

    expect(result).toMatchObject({ matchStatus: "uncertain", subjectId: null });
    expect(result.reason).toContain("Multiple");
  });

  it("treats an empty candidate set as a new anonymous subject", () => {
    expect(matchIdentity(vector(normalHumanSignals), [])).toMatchObject({
      matchStatus: "new",
      subjectId: null,
      continuityConfidence: 0,
    });
  });

  it("applies exact match and uncertain threshold boundaries", () => {
    expect(decideIdentityMatch([
      score("0id_match", IDENTITY_MATCH_THRESHOLDS.matchSimilarity, IDENTITY_MATCH_THRESHOLDS.matchConfidence),
    ])).toMatchObject({ matchStatus: "matched", subjectId: "0id_match" });

    expect(decideIdentityMatch([
      score("0id_uncertain", IDENTITY_MATCH_THRESHOLDS.uncertainSimilarity, IDENTITY_MATCH_THRESHOLDS.uncertainConfidence),
    ])).toMatchObject({ matchStatus: "uncertain", subjectId: null });

    expect(decideIdentityMatch([
      score("0id_new", IDENTITY_MATCH_THRESHOLDS.uncertainSimilarity - 0.0001, 1),
    ])).toMatchObject({ matchStatus: "new", subjectId: null });
  });

  it("requires device support even when an aggregate score reaches the match threshold", () => {
    const result = decideIdentityMatch([
      score("0id_cross_device", 0.95, 0.9, IDENTITY_MATCH_THRESHOLDS.minimumDeviceSimilarityForMatch - 0.01),
    ]);
    expect(result).toMatchObject({ matchStatus: "uncertain", subjectId: null });
  });
});
