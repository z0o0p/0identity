import { describe, expect, it } from "vitest";
import {
  evaluateHumanDetection,
  evaluateIdentityContinuity,
  expectedCalibrationError,
} from "../src/evaluation/metrics";

describe("human-detection evaluation", () => {
  it("calculates confusion metrics and rank-based AUROC independently from confidence", () => {
    const result = evaluateHumanDetection([
      { actual: "human", humanScore: 9 },
      { actual: "human", humanScore: 6 },
      { actual: "automation", humanScore: 8 },
      { actual: "automation", humanScore: 2 },
    ], 7);

    expect(result).toMatchObject({
      truePositive: 1,
      falsePositive: 1,
      trueNegative: 1,
      falseNegative: 1,
      precision: 0.5,
      recall: 0.5,
      falsePositiveRate: 0.5,
      falseNegativeRate: 0.5,
      accuracy: 0.5,
      auroc: 0.75,
    });
  });

  it("handles tied rankings and reports unavailable rates without eligible samples", () => {
    expect(evaluateHumanDetection([
      { actual: "human", humanScore: 5 },
      { actual: "automation", humanScore: 5 },
    ], 5).auroc).toBe(0.5);

    const empty = evaluateHumanDetection([], 7);
    expect(empty.accuracy).toBeNull();
    expect(empty.precision).toBeNull();
    expect(empty.auroc).toBeNull();
  });

  it("rejects scores and thresholds outside their documented scale", () => {
    expect(() => evaluateHumanDetection([], 11)).toThrow(RangeError);
    expect(() => evaluateHumanDetection([{ actual: "human", humanScore: Number.NaN }], 7)).toThrow(RangeError);
  });
});

describe("identity-continuity evaluation", () => {
  it("measures returning matches and unknown rejection separately", () => {
    const result = evaluateIdentityContinuity([
      { actualSubjectId: "0id_a", predictedSubjectId: "0id_a", matchStatus: "matched" },
      { actualSubjectId: "0id_a", predictedSubjectId: null, matchStatus: "uncertain" },
      { actualSubjectId: "0id_b", predictedSubjectId: "0id_wrong", matchStatus: "matched" },
      { actualSubjectId: null, predictedSubjectId: null, matchStatus: "new" },
      { actualSubjectId: null, predictedSubjectId: "0id_wrong", matchStatus: "matched" },
    ]);

    expect(result).toEqual({
      sampleCount: 5,
      returningSampleCount: 3,
      unknownSampleCount: 2,
      correctKnownMatches: 1,
      wrongSubjectMatches: 2,
      rejectedUnknownSubjects: 1,
      matchAccuracy: 1 / 3,
      falseMatchRate: 2 / 5,
      falseNonMatchRate: 2 / 3,
      unknownSubjectRejectionRate: 1 / 2,
    });
  });

  it("uses null when a metric has no eligible population", () => {
    const result = evaluateIdentityContinuity([]);
    expect(result.matchAccuracy).toBeNull();
    expect(result.falseMatchRate).toBeNull();
    expect(result.falseNonMatchRate).toBeNull();
    expect(result.unknownSubjectRejectionRate).toBeNull();
  });

  it("rejects internally inconsistent match results", () => {
    expect(() => evaluateIdentityContinuity([{
      actualSubjectId: "0id_a",
      predictedSubjectId: null,
      matchStatus: "matched",
    }])).toThrow(TypeError);
    expect(() => evaluateIdentityContinuity([{
      actualSubjectId: null,
      predictedSubjectId: "0id_a",
      matchStatus: "new",
    }])).toThrow(TypeError);
  });
});

describe("confidence calibration", () => {
  it("calculates expected calibration error for bounded confidence values", () => {
    expect(expectedCalibrationError([
      { confidence: 0.9, correct: true },
      { confidence: 0.8, correct: true },
      { confidence: 0.2, correct: false },
      { confidence: 0.1, correct: false },
    ], 2)).toBeCloseTo(0.15);
  });

  it("rejects invalid confidence and bin bounds", () => {
    expect(expectedCalibrationError([])).toBeNull();
    expect(() => expectedCalibrationError([{ confidence: 1.1, correct: true }])).toThrow(RangeError);
    expect(() => expectedCalibrationError([], 0)).toThrow(RangeError);
  });
});
