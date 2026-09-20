import type { AssessmentResponse, IdentityAssessment } from "../api/assessment";
import type { IdentityFeatureVector, IdentityNetworkContext } from "../identity/features";
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
  identity: IdentityAssessment;
  identityNetworkContext?: IdentityNetworkContext;
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
  subjectId: string | null;
  matchStatus: "matched" | "uncertain" | "new" | "unavailable";
  continuityConfidence: number | null;
}

export interface SessionDetail extends SessionSummary {
  assessment: AssessmentResponse;
  signals: NormalizedSignals;
}

export interface AssessmentHistoryRepository {
  assessAndSave(record: AssessmentRecord, proposedSubjectId: string): AssessmentRecord;
  listSessions(limit: number): SessionSummary[];
  getSession(sessionId: string): SessionDetail | null;
  getSubject(subjectId: string): SubjectProfile | null;
}

export interface AssessmentHistoryService {
  assessAndSave(
    namespace: HistoryNamespace,
    record: AssessmentRecord,
    proposedSubjectId: string,
  ): Promise<AssessmentRecord>;
  listSessions(namespace: HistoryNamespace, limit: number): Promise<SessionSummary[]>;
  getSession(namespace: HistoryNamespace, sessionId: string): Promise<SessionDetail | null>;
}

export interface SubjectProfile {
  subjectId: string;
  createdAt: string;
  lastSeenAt: string;
  sessionCount: number;
  confidence: number;
  features: IdentityFeatureVector;
}
