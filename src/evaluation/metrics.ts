export type GroundTruthHumanClass = "human" | "automation";

export interface HumanEvaluationSample {
  actual: GroundTruthHumanClass;
  humanScore: number;
}

export interface HumanEvaluationMetrics {
  sampleCount: number;
  threshold: number;
  truePositive: number;
  falsePositive: number;
  trueNegative: number;
  falseNegative: number;
  precision: number | null;
  recall: number | null;
  falsePositiveRate: number | null;
  falseNegativeRate: number | null;
  accuracy: number | null;
  auroc: number | null;
}

export interface IdentityEvaluationSample {
  actualSubjectId: string | null;
  predictedSubjectId: string | null;
  matchStatus: "matched" | "uncertain" | "new";
}

export interface IdentityEvaluationMetrics {
  sampleCount: number;
  returningSampleCount: number;
  unknownSampleCount: number;
  correctKnownMatches: number;
  wrongSubjectMatches: number;
  rejectedUnknownSubjects: number;
  matchAccuracy: number | null;
  falseMatchRate: number | null;
  falseNonMatchRate: number | null;
  unknownSubjectRejectionRate: number | null;
}

export interface CalibrationSample {
  confidence: number;
  correct: boolean;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function assertFiniteRange(value: number, minimum: number, maximum: number, name: string): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be between ${minimum} and ${maximum}.`);
  }
}

function calculateAuroc(samples: readonly HumanEvaluationSample[]): number | null {
  const humans = samples.filter(sample => sample.actual === "human");
  const automation = samples.filter(sample => sample.actual === "automation");
  if (humans.length === 0 || automation.length === 0) return null;

  let pairScore = 0;
  for (const human of humans) {
    for (const automated of automation) {
      if (human.humanScore > automated.humanScore) pairScore += 1;
      if (human.humanScore === automated.humanScore) pairScore += 0.5;
    }
  }
  return pairScore / (humans.length * automation.length);
}

export function evaluateHumanDetection(
  samples: readonly HumanEvaluationSample[],
  threshold: number,
): HumanEvaluationMetrics {
  assertFiniteRange(threshold, 0, 10, "threshold");

  let truePositive = 0;
  let falsePositive = 0;
  let trueNegative = 0;
  let falseNegative = 0;
  for (const sample of samples) {
    assertFiniteRange(sample.humanScore, 0, 10, "humanScore");
    const predictsHuman = sample.humanScore >= threshold;
    if (sample.actual === "human") {
      predictsHuman ? truePositive++ : falseNegative++;
    } else {
      predictsHuman ? falsePositive++ : trueNegative++;
    }
  }

  return {
    sampleCount: samples.length,
    threshold,
    truePositive,
    falsePositive,
    trueNegative,
    falseNegative,
    precision: ratio(truePositive, truePositive + falsePositive),
    recall: ratio(truePositive, truePositive + falseNegative),
    falsePositiveRate: ratio(falsePositive, falsePositive + trueNegative),
    falseNegativeRate: ratio(falseNegative, truePositive + falseNegative),
    accuracy: ratio(truePositive + trueNegative, samples.length),
    auroc: calculateAuroc(samples),
  };
}

export function evaluateIdentityContinuity(
  samples: readonly IdentityEvaluationSample[],
): IdentityEvaluationMetrics {
  for (const sample of samples) {
    if (sample.matchStatus === "matched" && sample.predictedSubjectId === null) {
      throw new TypeError("A matched result must include a predictedSubjectId.");
    }
    if (sample.matchStatus !== "matched" && sample.predictedSubjectId !== null) {
      throw new TypeError("A non-matched result cannot include a predictedSubjectId.");
    }
  }

  const returning = samples.filter(sample => sample.actualSubjectId !== null);
  const unknown = samples.filter(sample => sample.actualSubjectId === null);
  const correctKnownMatches = returning.filter(sample => (
    sample.matchStatus === "matched" && sample.predictedSubjectId === sample.actualSubjectId
  )).length;
  const wrongSubjectMatches = samples.filter(sample => (
    sample.matchStatus === "matched" && sample.predictedSubjectId !== sample.actualSubjectId
  )).length;
  const rejectedUnknownSubjects = unknown.filter(sample => sample.matchStatus !== "matched").length;

  return {
    sampleCount: samples.length,
    returningSampleCount: returning.length,
    unknownSampleCount: unknown.length,
    correctKnownMatches,
    wrongSubjectMatches,
    rejectedUnknownSubjects,
    matchAccuracy: ratio(correctKnownMatches, returning.length),
    falseMatchRate: ratio(wrongSubjectMatches, samples.length),
    falseNonMatchRate: ratio(returning.length - correctKnownMatches, returning.length),
    unknownSubjectRejectionRate: ratio(rejectedUnknownSubjects, unknown.length),
  };
}

export function expectedCalibrationError(
  samples: readonly CalibrationSample[],
  binCount = 10,
): number | null {
  if (!Number.isInteger(binCount) || binCount < 1 || binCount > 100) {
    throw new RangeError("binCount must be an integer between 1 and 100.");
  }
  if (samples.length === 0) return null;

  const bins = Array.from({ length: binCount }, () => ({ count: 0, confidence: 0, correct: 0 }));
  for (const sample of samples) {
    assertFiniteRange(sample.confidence, 0, 1, "confidence");
    const index = Math.min(Math.floor(sample.confidence * binCount), binCount - 1);
    const bin = bins[index]!;
    bin.count += 1;
    bin.confidence += sample.confidence;
    bin.correct += sample.correct ? 1 : 0;
  }

  return bins.reduce((error, bin) => {
    if (bin.count === 0) return error;
    const averageConfidence = bin.confidence / bin.count;
    const observedAccuracy = bin.correct / bin.count;
    return error + (bin.count / samples.length) * Math.abs(averageConfidence - observedAccuracy);
  }, 0);
}
