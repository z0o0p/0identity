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

  async saveAssessment(namespace: HistoryNamespace, record: AssessmentRecord): Promise<void> {
    await this.env.IDENTITY_HISTORY.getByName(namespace).saveAssessment(record);
  }

  async listSessions(namespace: HistoryNamespace, limit: number): Promise<SessionSummary[]> {
    return this.env.IDENTITY_HISTORY.getByName(namespace).listSessions(limit);
  }

  async getSession(namespace: HistoryNamespace, sessionId: string): Promise<SessionDetail | null> {
    return this.env.IDENTITY_HISTORY.getByName(namespace).getSession(sessionId);
  }
}
