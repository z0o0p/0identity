import type { IdentityHistory } from "./identity-history";
import type {
  AssessmentHistoryService,
  AssessmentRecord,
  HistoryNamespace,
  SessionDetail,
  SessionSummary,
} from "./types";

interface DurableHistoryEnv {
  IDENTITY_HISTORY: DurableObjectNamespace<IdentityHistory>;
}

export class DurableHistoryService implements AssessmentHistoryService {
  constructor(private readonly env: DurableHistoryEnv) {}

  async assessAndSave(
    namespace: HistoryNamespace,
    record: AssessmentRecord,
    proposedSubjectId: string,
  ): Promise<AssessmentRecord> {
    return this.env.IDENTITY_HISTORY.getByName(namespace).assessAndSave(record, proposedSubjectId);
  }

  async listSessions(namespace: HistoryNamespace, limit: number): Promise<SessionSummary[]> {
    return this.env.IDENTITY_HISTORY.getByName(namespace).listSessions(limit);
  }

  async getSession(namespace: HistoryNamespace, sessionId: string): Promise<SessionDetail | null> {
    return this.env.IDENTITY_HISTORY.getByName(namespace).getSession(sessionId);
  }

  async getSubject(namespace: HistoryNamespace, subjectId: string) {
    return this.env.IDENTITY_HISTORY.getByName(namespace).getSubject(subjectId);
  }

  async getOverview(namespace: HistoryNamespace) {
    return this.env.IDENTITY_HISTORY.getByName(namespace).getOverview();
  }

  async listSubjectSessions(namespace: HistoryNamespace, subjectId: string, limit: number) {
    return this.env.IDENTITY_HISTORY.getByName(namespace).listSubjectSessions(subjectId, limit);
  }
}
