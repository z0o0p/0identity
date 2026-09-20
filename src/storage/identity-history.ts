import { DurableObject } from "cloudflare:workers";
import { CloudflareSqlDatabase } from "./cloudflare-sql";
import { applyStorageMigrations } from "./migrations";
import { SqlAssessmentRepository } from "./sql-assessment-repository";
import type { AssessmentRecord, SessionDetail, SessionSummary, SubjectProfile } from "./types";

export class IdentityHistory extends DurableObject<Cloudflare.Env> {
  private readonly repository: SqlAssessmentRepository;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    const database = new CloudflareSqlDatabase(ctx.storage);
    this.repository = new SqlAssessmentRepository(database);

    // Schema initialization runs behind the input gate so no RPC method can
    // observe a partially migrated database after an object restart.
    ctx.blockConcurrencyWhile(async () => {
      applyStorageMigrations(database);
    });
  }

  assessAndSave(record: AssessmentRecord, proposedSubjectId: string): AssessmentRecord {
    return this.repository.assessAndSave(record, proposedSubjectId);
  }

  listSessions(limit: number): SessionSummary[] {
    return this.repository.listSessions(limit);
  }

  getSession(sessionId: string): SessionDetail | null {
    return this.repository.getSession(sessionId);
  }

  getSubject(subjectId: string): SubjectProfile | null {
    return this.repository.getSubject(subjectId);
  }
}
