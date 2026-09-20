import type {
  ComponentAssessment,
  HumanLikelihoodAssessment,
  HumanScoreComponents,
  RiskFlag,
} from "../shared/domain";
import { normalizeSignals } from "../signals/normalize";
import type { ClientSignals, ServerSignalContext } from "../signals/schema";
import { BEHAVIOR_SAMPLE_TARGETS, HUMAN_SCORE_WEIGHTS, HUMAN_SCORING_VERSION, REGULARITY_THRESHOLDS } from "./constants";
import { inspectEnvironmentConsistency } from "./consistency";

export interface HumanScoringContext {
  server?: ServerSignalContext;
  history?: ComponentAssessment;
}

interface WeightedObservation {
  score: number;
  confidence: number;
  evidenceCount: number;
  weight: number;
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const round = (value: number, places: number) => Number(value.toFixed(places));

function variabilityScore(value: number): number {
  if (value < 0.03) return 1;
  if (value < 0.08) return 3;
  if (value < 0.18) return 6;
  if (value <= 1.5) return 9;
  if (value <= 3) return 7;
  return 5;
}

function directionScore(value: number): number {
  if (value < 0.01) return 1;
  if (value < 0.05) return 3;
  if (value < 0.12) return 6;
  if (value <= 0.75) return 9;
  return 6;
}

function aggregateObservations(observations: WeightedObservation[]): ComponentAssessment | undefined {
  if (observations.length === 0) return undefined;

  const effectiveWeight = observations.reduce((total, item) => total + item.weight * item.confidence, 0);
  if (effectiveWeight === 0) return undefined;

  const score = observations.reduce((total, item) => total + item.score * item.weight * item.confidence, 0) / effectiveWeight;
  const availableWeight = observations.reduce((total, item) => total + item.weight, 0);
  const confidence = observations.reduce((total, item) => total + item.weight * item.confidence, 0);

  return {
    score: round(clamp(score, 0, 10), 2),
    confidence: round(clamp(confidence, 0, availableWeight), 3),
    evidenceCount: observations.reduce((total, item) => total + item.evidenceCount, 0),
  };
}

function scoreBehavior(signals: ClientSignals): { component?: ComponentAssessment; flags: RiskFlag[] } {
  const behavior = signals.behavior;
  if (!behavior) return { flags: [] };

  const observations: WeightedObservation[] = [];
  const flags: RiskFlag[] = [];

  if (behavior.pointer && behavior.pointer.eventCount > 0) {
    const pointer = behavior.pointer;
    observations.push({
      score:
        (variabilityScore(pointer.velocityCoefficientOfVariation) +
          variabilityScore(pointer.accelerationCoefficientOfVariation) +
          variabilityScore(pointer.pauseCoefficientOfVariation) +
          directionScore(pointer.directionChangeRate)) /
        4,
      confidence: Math.min(1, pointer.eventCount / BEHAVIOR_SAMPLE_TARGETS.pointerEvents),
      evidenceCount: 4,
      weight: 0.45,
    });
    if (
      pointer.eventCount >= REGULARITY_THRESHOLDS.minimumPointerEvents &&
      pointer.velocityCoefficientOfVariation < REGULARITY_THRESHOLDS.coefficientOfVariation &&
      pointer.pauseCoefficientOfVariation < REGULARITY_THRESHOLDS.coefficientOfVariation
    ) {
      flags.push({
        code: "highly_regular_pointer",
        category: "behavior",
        severity: "high",
        explanation: "Pointer velocity and pauses are unusually regular for the observed sample.",
      });
    }
  }

  if (behavior.scroll && behavior.scroll.eventCount > 0) {
    const scroll = behavior.scroll;
    observations.push({
      score:
        (variabilityScore(scroll.velocityCoefficientOfVariation) +
          variabilityScore(scroll.pauseCoefficientOfVariation) +
          directionScore(scroll.directionChangeRate)) /
        3,
      confidence: Math.min(1, scroll.eventCount / BEHAVIOR_SAMPLE_TARGETS.scrollEvents),
      evidenceCount: 3,
      weight: 0.2,
    });
  }

  if (behavior.keyboard && behavior.keyboard.eventCount > 0) {
    const keyboard = behavior.keyboard;
    observations.push({
      score:
        (variabilityScore(keyboard.interKeyCoefficientOfVariation) +
          variabilityScore(keyboard.keyDownCoefficientOfVariation) +
          (keyboard.correctionRate > 0 && keyboard.correctionRate < 0.35 ? 8 : 5)) /
        3,
      confidence: Math.min(1, keyboard.eventCount / BEHAVIOR_SAMPLE_TARGETS.keyboardEvents),
      evidenceCount: 3,
      weight: 0.2,
    });
    if (
      keyboard.eventCount >= REGULARITY_THRESHOLDS.minimumKeyboardEvents &&
      keyboard.interKeyCoefficientOfVariation < REGULARITY_THRESHOLDS.coefficientOfVariation &&
      keyboard.keyDownCoefficientOfVariation < REGULARITY_THRESHOLDS.coefficientOfVariation
    ) {
      flags.push({
        code: "highly_regular_keyboard",
        category: "behavior",
        severity: "high",
        explanation: "Keyboard intervals and key-down durations are unusually regular for the observed sample.",
      });
    }
  }

  if (behavior.session && behavior.session.interactionCount > 0) {
    const session = behavior.session;
    const diversityScore = session.interactionTypeCount >= 3 ? 9 : session.interactionTypeCount === 2 ? 7 : 5;
    const activityScore = session.activeRatio >= 0.05 && session.activeRatio <= 0.95 ? 8 : 5;
    observations.push({
      score: (diversityScore + activityScore) / 2,
      confidence: Math.min(
        1,
        Math.min(1, session.durationMs / BEHAVIOR_SAMPLE_TARGETS.sessionDurationMs) *
          Math.min(1, session.interactionCount / BEHAVIOR_SAMPLE_TARGETS.sessionInteractions),
      ),
      evidenceCount: 2,
      weight: 0.15,
    });
  }

  const component = aggregateObservations(observations);
  return component ? { component, flags } : { flags };
}

function scoreDevice(signals: ClientSignals): ComponentAssessment | undefined {
  const environment = signals.environment;
  if (!environment) return undefined;

  const evidence = [
    environment.locale,
    environment.timezone,
    environment.screen,
    environment.viewport,
    environment.devicePixelRatio,
    environment.hardwareConcurrency,
    environment.deviceMemoryGb,
    environment.maxTouchPoints,
    environment.capabilities,
    environment.webgl,
  ].filter(value => value !== undefined).length;

  let score = 8;
  if (environment.screen && environment.viewport) {
    const exceedsScreen =
      environment.viewport.width > environment.screen.width || environment.viewport.height > environment.screen.height;
    if (exceedsScreen) score -= 2;
  }

  return {
    score,
    confidence: round(0.2 + 0.8 * (evidence / 10), 3),
    evidenceCount: evidence + 3,
  };
}

export function fuseHumanScore(components: HumanScoreComponents): Pick<HumanLikelihoodAssessment, "score" | "confidence"> {
  const entries = Object.entries(components) as [keyof HumanScoreComponents, ComponentAssessment][];
  const effectiveWeight = entries.reduce(
    (total, [name, component]) => total + HUMAN_SCORE_WEIGHTS[name] * component.confidence,
    0,
  );

  if (effectiveWeight === 0) return { score: 5, confidence: 0 };

  const score =
    entries.reduce(
      (total, [name, component]) => total + component.score * HUMAN_SCORE_WEIGHTS[name] * component.confidence,
      0,
    ) / effectiveWeight;
  const coverage = entries.reduce(
    (total, [name, component]) => total + HUMAN_SCORE_WEIGHTS[name] * component.confidence,
    0,
  );
  const disagreement =
    entries.reduce(
      (total, [name, component]) =>
        total + Math.abs(component.score - score) * HUMAN_SCORE_WEIGHTS[name] * component.confidence,
      0,
    ) /
    (effectiveWeight * 10);

  return {
    score: round(clamp(score, 0, 10), 2),
    confidence: round(clamp(coverage * (1 - 0.25 * disagreement), 0, 1), 3),
  };
}

export function assessHumanLikelihood(signals: ClientSignals, context: HumanScoringContext = {}): HumanLikelihoodAssessment {
  const normalized = normalizeSignals(signals);
  const behavior = scoreBehavior(signals);
  const consistency = inspectEnvironmentConsistency(normalized, context.server);
  const components: HumanScoreComponents = {};
  const device = scoreDevice(signals);
  if (behavior.component) components.behavior = behavior.component;
  if (consistency.component) components.consistency = consistency.component;
  if (device) components.device = device;
  if (context.history) components.history = context.history;

  return {
    ...fuseHumanScore(components),
    components,
    flags: [...behavior.flags, ...consistency.flags],
    scoringVersion: HUMAN_SCORING_VERSION,
  };
}
