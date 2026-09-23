import type {
  AssessmentHistoryService,
  AssessmentRecord,
  HistoryNamespace,
  SessionDetail,
  SessionSummary,
  SubjectProfile,
} from "../../src/storage/types";
import { createIdentityFeatureVector } from "../../src/identity/features";
import { matchIdentity } from "../../src/identity/match";
import { evolveIdentityFeatureVector, identityFeatureQuality } from "../../src/identity/profile";
import type { IdentityAssessment } from "../../src/api/assessment";

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
    subjectId: record.identity.subjectId,
    matchStatus: "matchStatus" in record.identity ? record.identity.matchStatus : "unavailable",
    continuityConfidence: record.identity.continuityConfidence,
  };
}

export class MemoryHistoryService implements AssessmentHistoryService {
  private readonly records = new Map<HistoryNamespace, Map<string, AssessmentRecord>>();
  private readonly subjects = new Map<HistoryNamespace, Map<string, SubjectProfile>>();

  async assessAndSave(
    namespace: HistoryNamespace,
    record: AssessmentRecord,
    proposedSubjectId: string,
  ): Promise<AssessmentRecord> {
    const namespaceRecords = this.records.get(namespace) ?? new Map<string, AssessmentRecord>();
    const namespaceSubjects = this.subjects.get(namespace) ?? new Map<string, SubjectProfile>();
    const observed = createIdentityFeatureVector(record.signals, record.identityNetworkContext);
    const decision = matchIdentity(observed, [...namespaceSubjects.values()].map(subject => ({
      subjectId: subject.subjectId,
      features: subject.features,
    })));
    let identity: Exclude<IdentityAssessment, { status: "unavailable" }>;
    if (decision.matchStatus === "new") {
      identity = {
        ...decision,
        subjectId: proposedSubjectId,
        continuityConfidence: 0,
        reason: "No existing anonymous subject met the continuity thresholds; a new subject was created.",
      };
      namespaceSubjects.set(proposedSubjectId, {
        subjectId: proposedSubjectId,
        createdAt: record.createdAt,
        lastSeenAt: record.createdAt,
        sessionCount: 1,
        confidence: identityFeatureQuality(observed),
        features: observed,
      });
    } else if (decision.matchStatus === "matched" && decision.subjectId) {
      identity = decision;
      const subject = namespaceSubjects.get(decision.subjectId);
      if (!subject) throw new Error("Matched subject is missing.");
      const features = evolveIdentityFeatureVector(subject.features, observed, subject.sessionCount);
      namespaceSubjects.set(subject.subjectId, {
        ...subject,
        lastSeenAt: record.createdAt,
        sessionCount: subject.sessionCount + 1,
        confidence: identityFeatureQuality(features),
        features,
      });
    } else {
      identity = decision;
    }
    const stored = { ...record, identity } as AssessmentRecord;
    namespaceRecords.set(record.sessionId, structuredClone(stored));
    this.records.set(namespace, namespaceRecords);
    this.subjects.set(namespace, namespaceSubjects);
    return structuredClone(stored);
  }

  async listSessions(namespace: HistoryNamespace, limit: number, offset = 0): Promise<SessionSummary[]> {
    return [...(this.records.get(namespace)?.values() ?? [])]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.sessionId.localeCompare(left.sessionId))
      .slice(offset, offset + limit)
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
        identity: structuredClone(record.identity),
      },
    };
  }

  async getSubject(namespace: HistoryNamespace, subjectId: string): Promise<SubjectProfile | null> {
    const subject = this.subjects.get(namespace)?.get(subjectId);
    return subject ? structuredClone(subject) : null;
  }

  async getOverview(namespace: HistoryNamespace) {
    const records = [...(this.records.get(namespace)?.values() ?? [])];
    return {
      totalSessions: records.length,
      likelyHumanSessions: records.filter(record => record.human.score >= 7.5 && record.human.confidence >= 0.5).length,
      suspiciousSessions: records.filter(record => record.human.score < 4.5 && record.human.confidence >= 0.5).length,
      anonymousSubjects: this.subjects.get(namespace)?.size ?? 0,
      uncertainMatches: records.filter(record => (
        "matchStatus" in record.identity && record.identity.matchStatus === "uncertain"
      )).length,
    };
  }

  async listSubjectSessions(namespace: HistoryNamespace, subjectId: string, limit: number): Promise<SessionSummary[]> {
    return [...(this.records.get(namespace)?.values() ?? [])]
      .filter(record => record.identity.subjectId === subjectId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.sessionId.localeCompare(left.sessionId))
      .slice(0, limit)
      .map(summary);
  }
}
