import {
  assessmentResponseSchema,
  identityAssessmentSchema,
  type AssessmentResponse,
  type IdentityAssessment,
} from "../api/assessment";
import { createIdentityFeatureVector, identityFeatureVectorSchema } from "../identity/features";
import { matchIdentity } from "../identity/match";
import { evolveIdentityFeatureVector, identityFeatureQuality } from "../identity/profile";
import { normalizeSignals, type NormalizedSignals } from "../signals/normalize";
import { clientSignalsSchema } from "../signals/schema";
import { SIMULATION_PROFILES, type SimulationProfile } from "../simulator/profiles";
import type { HumanLikelihoodAssessment } from "../shared/domain";
import type { SyncSqlDatabase } from "./sql-database";
import type {
  AssessmentHistoryRepository,
  AssessmentRecord,
  HistorySource,
  SessionDetail,
  SessionSummary,
  SubjectProfile,
} from "./types";

interface SummaryRow {
  assessment_id: string;
  session_id: string;
  created_at: string;
  source: string;
  simulation_profile: string | null;
  human_score: number;
  human_confidence: number;
  flags_json: string;
  identity_status: string;
  subject_id: string | null;
  continuity_confidence: number | null;
}

interface DetailRow extends SummaryRow {
  scoring_version: string;
  components_json: string;
  signals_json: string;
  identity_evidence_json: string;
  identity_reason: string;
}

interface SubjectRow {
  subject_id: string;
  created_at: string;
  last_seen_at: string;
  session_count: number;
  confidence: number;
  features_json: string;
}

type AvailableIdentityAssessment = Exclude<IdentityAssessment, { status: "unavailable" }>;

function parseJson(value: string, field: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Stored ${field} is not valid JSON.`);
  }
}

function parseSource(value: string): HistorySource {
  if (value === "live" || value === "simulation") return value;
  throw new Error("Stored session source is invalid.");
}

function parseProfile(value: string | null): SimulationProfile | null {
  if (value === null) return null;
  if ((SIMULATION_PROFILES as readonly string[]).includes(value)) return value as SimulationProfile;
  throw new Error("Stored simulation profile is invalid.");
}

function parseMatchStatus(value: string): SessionSummary["matchStatus"] {
  if (value === "unavailable" || value === "matched" || value === "uncertain" || value === "new") return value;
  throw new Error("Stored identity status is invalid.");
}

function mapSummary(row: SummaryRow): SessionSummary {
  const flags = parseJson(row.flags_json, "risk flags");
  if (!Array.isArray(flags)) throw new Error("Stored risk flags are invalid.");
  const flagCodes = flags.map(flag => {
    if (typeof flag !== "object" || flag === null || !("code" in flag) || typeof flag.code !== "string") {
      throw new Error("Stored risk flag is invalid.");
    }
    return flag.code;
  });

  return {
    assessmentId: row.assessment_id,
    sessionId: row.session_id,
    createdAt: row.created_at,
    source: parseSource(row.source),
    simulationProfile: parseProfile(row.simulation_profile),
    humanScore: row.human_score,
    humanConfidence: row.human_confidence,
    flagCodes,
    subjectId: row.subject_id,
    matchStatus: parseMatchStatus(row.identity_status),
    continuityConfidence: row.continuity_confidence,
  };
}

function mapSubject(row: SubjectRow): SubjectProfile {
  const parsedFeatures = identityFeatureVectorSchema.parse(parseJson(row.features_json, "subject features"));
  return {
    subjectId: row.subject_id,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    sessionCount: row.session_count,
    confidence: row.confidence,
    features: {
      version: parsedFeatures.version,
      ...(parsedFeatures.behavior ? { behavior: parsedFeatures.behavior } : {}),
      ...(parsedFeatures.device ? { device: parsedFeatures.device } : {}),
      ...(parsedFeatures.context ? { context: parsedFeatures.context } : {}),
      ...(parsedFeatures.network ? { network: parsedFeatures.network } : {}),
    },
  };
}

function storedIdentity(row: DetailRow): IdentityAssessment {
  if (row.identity_status === "unavailable") {
    return identityAssessmentSchema.parse({
      status: "unavailable",
      subjectId: null,
      continuityConfidence: null,
      reason: row.identity_reason,
    });
  }
  return identityAssessmentSchema.parse({
    matchStatus: row.identity_status,
    subjectId: row.subject_id,
    continuityConfidence: row.continuity_confidence,
    evidence: parseJson(row.identity_evidence_json, "identity evidence"),
    reason: row.identity_reason,
  });
}

export class SqlAssessmentRepository implements AssessmentHistoryRepository {
  constructor(private readonly database: SyncSqlDatabase) {}

  assessAndSave(record: AssessmentRecord, proposedSubjectId: string): AssessmentRecord {
    return this.database.transaction(() => {
      const observedFeatures = createIdentityFeatureVector(record.signals, record.identityNetworkContext);
      const candidates = this.listSubjects().map(subject => ({
        subjectId: subject.subjectId,
        features: subject.features,
      }));
      const decision = matchIdentity(observedFeatures, candidates);
      let identity: AvailableIdentityAssessment;

      if (decision.matchStatus === "new") {
        identity = {
          ...decision,
          subjectId: proposedSubjectId,
          continuityConfidence: 0,
          reason: "No existing anonymous subject met the continuity thresholds; a new subject was created.",
        };
        this.database.execute(
          `INSERT INTO subjects (
            subject_id, created_at, last_seen_at, session_count, confidence, features_json
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          proposedSubjectId,
          record.createdAt,
          record.createdAt,
          1,
          identityFeatureQuality(observedFeatures),
          JSON.stringify(observedFeatures),
        );
      } else if (decision.matchStatus === "matched" && decision.subjectId) {
        identity = decision;
        const subject = this.getSubject(decision.subjectId);
        if (!subject) throw new Error("Matched subject disappeared during the assessment transaction.");
        const evolved = evolveIdentityFeatureVector(subject.features, observedFeatures, subject.sessionCount);
        this.database.execute(
          `UPDATE subjects
           SET last_seen_at = ?, session_count = ?, confidence = ?, features_json = ?
           WHERE subject_id = ?`,
          record.createdAt,
          subject.sessionCount + 1,
          identityFeatureQuality(evolved),
          JSON.stringify(evolved),
          subject.subjectId,
        );
      } else {
        identity = decision;
      }

      const storedRecord: AssessmentRecord = { ...record, identity };
      this.insertAssessment(storedRecord);
      if (identity.matchStatus !== "uncertain") {
        this.database.execute(
          `INSERT INTO subject_sessions (
            session_id, subject_id, linked_at, link_status, continuity_confidence
          ) VALUES (?, ?, ?, ?, ?)`,
          record.sessionId,
          identity.subjectId,
          record.createdAt,
          identity.matchStatus,
          identity.continuityConfidence,
        );
      }
      return storedRecord;
    });
  }

  listSessions(limit: number): SessionSummary[] {
    return this.database.query<SummaryRow>(
      `SELECT s.session_id, s.created_at, s.source, s.simulation_profile,
              a.assessment_id, a.human_score, a.human_confidence, a.flags_json,
              a.identity_status, a.subject_id, a.continuity_confidence
       FROM sessions s
       JOIN assessments a ON a.session_id = s.session_id
       ORDER BY s.created_at DESC, s.session_id DESC
       LIMIT ?`,
      limit,
    ).map(mapSummary);
  }

  getSession(sessionId: string): SessionDetail | null {
    const rows = this.database.query<DetailRow>(
      `SELECT s.session_id, s.created_at, s.source, s.simulation_profile,
              a.assessment_id, a.human_score, a.human_confidence, a.scoring_version,
              a.components_json, a.flags_json, a.signals_json, a.identity_status,
              a.subject_id, a.continuity_confidence, a.identity_evidence_json, a.identity_reason
       FROM sessions s
       JOIN assessments a ON a.session_id = s.session_id
       WHERE s.session_id = ?
       LIMIT 1`,
      sessionId,
    );
    const row = rows[0];
    if (!row) return null;

    const summary = mapSummary(row);
    const signals = normalizeSignals(clientSignalsSchema.parse(parseJson(row.signals_json, "signals")));
    const assessment = assessmentResponseSchema.parse({
      assessmentId: row.assessment_id,
      sessionId: row.session_id,
      human: {
        score: row.human_score,
        confidence: row.human_confidence,
        components: parseJson(row.components_json, "score components"),
        flags: parseJson(row.flags_json, "risk flags"),
        scoringVersion: row.scoring_version,
      },
      identity: storedIdentity(row),
    }) satisfies AssessmentResponse;

    return { ...summary, assessment, signals: signals satisfies NormalizedSignals };
  }

  getSubject(subjectId: string): SubjectProfile | null {
    const row = this.database.query<SubjectRow>(
      `SELECT subject_id, created_at, last_seen_at, session_count, confidence, features_json
       FROM subjects WHERE subject_id = ? LIMIT 1`,
      subjectId,
    )[0];
    return row ? mapSubject(row) : null;
  }

  private listSubjects(): SubjectProfile[] {
    return this.database.query<SubjectRow>(
      `SELECT subject_id, created_at, last_seen_at, session_count, confidence, features_json
       FROM subjects ORDER BY last_seen_at DESC, subject_id DESC`,
    ).map(mapSubject);
  }

  private insertAssessment(record: AssessmentRecord): void {
    this.database.execute(
      `INSERT INTO sessions (session_id, created_at, source, simulation_profile)
       VALUES (?, ?, ?, ?)`,
      record.sessionId,
      record.createdAt,
      record.source,
      record.simulationProfile ?? null,
    );
    const identity = record.identity;
    const available = "matchStatus" in identity;
    this.database.execute(
      `INSERT INTO assessments (
        assessment_id, session_id, human_score, human_confidence, scoring_version,
        components_json, flags_json, signals_json, identity_status, subject_id,
        continuity_confidence, identity_evidence_json, identity_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      record.assessmentId,
      record.sessionId,
      record.human.score,
      record.human.confidence,
      record.human.scoringVersion,
      JSON.stringify(record.human.components),
      JSON.stringify(record.human.flags),
      JSON.stringify(record.signals),
      available ? identity.matchStatus : identity.status,
      identity.subjectId,
      identity.continuityConfidence,
      JSON.stringify(available ? identity.evidence : []),
      identity.reason,
    );
  }
}

export function createAssessmentRecord(
  assessment: AssessmentResponse,
  signals: NormalizedSignals,
  createdAt: string,
  source: HistorySource,
  simulationProfile?: SimulationProfile,
  identityNetworkContext?: AssessmentRecord["identityNetworkContext"],
): AssessmentRecord {
  return {
    assessmentId: assessment.assessmentId,
    sessionId: assessment.sessionId,
    createdAt,
    source,
    ...(simulationProfile ? { simulationProfile } : {}),
    signals,
    human: assessment.human satisfies HumanLikelihoodAssessment,
    identity: assessment.identity,
    ...(identityNetworkContext ? { identityNetworkContext } : {}),
  };
}
