import type {
  AssessmentHistoryService,
  AssessmentRecord,
  HistoryNamespace,
  SessionDetail,
  SessionSummary,
} from "../../src/storage/types";

function summary(record: AssessmentRecord): SessionSummary {
  return {
    assessmentId: record.assessmentId,
    sessionId: record.sessionId,
    createdAt: record.createdAt,
    source: record.source,
    simulationProfile: record.simulationProfile ?? null,
    humanScore: record.human.score,
    humanConfidence: record.human.confidence,
    flagCodes: record.human.flags.map(flag => flag.code),
  };
}

export class MemoryHistoryService implements AssessmentHistoryService {
  private readonly records = new Map<HistoryNamespace, Map<string, AssessmentRecord>>();

  async saveAssessment(namespace: HistoryNamespace, record: AssessmentRecord): Promise<void> {
    const namespaceRecords = this.records.get(namespace) ?? new Map<string, AssessmentRecord>();
    namespaceRecords.set(record.sessionId, structuredClone(record));
    this.records.set(namespace, namespaceRecords);
  }

  async listSessions(namespace: HistoryNamespace, limit: number): Promise<SessionSummary[]> {
    return [...(this.records.get(namespace)?.values() ?? [])]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.sessionId.localeCompare(left.sessionId))
      .slice(0, limit)
      .map(summary);
  }

  async getSession(namespace: HistoryNamespace, sessionId: string): Promise<SessionDetail | null> {
    const record = this.records.get(namespace)?.get(sessionId);
    if (!record) return null;
    return {
      ...summary(record),
      signals: structuredClone(record.signals),
      assessment: {
        assessmentId: record.assessmentId,
        sessionId: record.sessionId,
        human: structuredClone(record.human),
        identity: {
          status: "unavailable",
          subjectId: null,
          continuityConfidence: null,
          reason: "Identity continuity is not implemented in this prototype.",
        },
      },
    };
  }
}
