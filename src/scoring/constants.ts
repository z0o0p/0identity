import type { HumanComponentName } from "../shared/domain";

export const HUMAN_SCORING_VERSION = "human-heuristic-v1";

export const HUMAN_SCORE_WEIGHTS: Readonly<Record<HumanComponentName, number>> = {
  behavior: 0.4,
  consistency: 0.25,
  device: 0.15,
  network: 0.05,
  history: 0.15,
};

export const BEHAVIOR_SAMPLE_TARGETS = {
  pointerEvents: 80,
  scrollEvents: 30,
  keyboardEvents: 40,
  sessionDurationMs: 15_000,
  sessionInteractions: 20,
} as const;

export const REGULARITY_THRESHOLDS = {
  minimumPointerEvents: 20,
  minimumKeyboardEvents: 10,
  coefficientOfVariation: 0.05,
} as const;
