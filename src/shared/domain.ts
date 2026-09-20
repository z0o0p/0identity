export type SessionId = string;
export type SubjectId = string;
export type AssessmentId = string;

export const HUMAN_COMPONENT_NAMES = ["behavior", "consistency", "device", "network", "history"] as const;

export type HumanComponentName = (typeof HUMAN_COMPONENT_NAMES)[number];

export type RiskFlagCode =
  | "browser_platform_mismatch"
  | "browser_user_agent_mismatch"
  | "unexpected_api_support"
  | "header_browser_mismatch"
  | "rendering_environment_mismatch"
  | "implausible_touch_configuration"
  | "webdriver_exposed"
  | "highly_regular_pointer"
  | "highly_regular_keyboard";

export interface RiskFlag {
  code: RiskFlagCode;
  category: "behavior" | "environment";
  severity: "low" | "medium" | "high";
  explanation: string;
}

export interface ComponentAssessment {
  score: number;
  confidence: number;
  evidenceCount: number;
}

export type HumanScoreComponents = Partial<Record<HumanComponentName, ComponentAssessment>>;

export interface HumanLikelihoodAssessment {
  score: number;
  confidence: number;
  components: HumanScoreComponents;
  flags: RiskFlag[];
  scoringVersion: string;
}
