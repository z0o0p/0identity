import type { AssessmentResponse } from "../api/assessment";
import type { HumanLikelihoodAssessment } from "../shared/domain";
import type { SimulationProfile } from "../simulator/profiles";
import type { NormalizedSignals } from "../signals/normalize";

export const HISTORY_SOURCES = ["live", "simulation"] as const;

export type HistorySource = (typeof HISTORY_SOURCES)[number];
export type HistoryNamespace = "live-v1" | "simulation-v1";

export interface AssessmentRecord {
  assessmentId: string;
  sessionId: string;
  createdAt: string;
  source: HistorySource;
  simulationProfile?: SimulationProfile;
  signals: NormalizedSignals;
  human: HumanLikelihoodAssessment;
}

export interface SessionSummary {
  assessmentId: string;
  sessionId: string;
  createdAt: string;
  source: HistorySource;
  simulationProfile: SimulationProfile | null;
  humanScore: number;
  humanConfidence: number;
  flagCodes: string[];
}

export interface SessionDetail extends SessionSummary {
  assessment: AssessmentResponse;
  signals: NormalizedSignals;
}

export interface AssessmentHistoryRepository {
  saveAssessment(record: AssessmentRecord): void;
  listSessions(limit: number): SessionSummary[];
  getSession(sessionId: string): SessionDetail | null;
}

export interface AssessmentHistoryService {
  saveAssessment(namespace: HistoryNamespace, record: AssessmentRecord): Promise<void>;
  listSessions(namespace: HistoryNamespace, limit: number): Promise<SessionSummary[]>;
  getSession(namespace: HistoryNamespace, sessionId: string): Promise<SessionDetail | null>;
}
