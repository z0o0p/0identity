import { assessmentResponseSchema, type AssessmentResponse } from "../api/assessment";
import { normalizeSignals, type NormalizedSignals } from "../signals/normalize";
import { clientSignalsSchema } from "../signals/schema";
import { SIMULATION_PROFILES, type SimulationProfile } from "../simulator/profiles";
import type { HumanLikelihoodAssessment } from "../shared/domain";
import type { SyncSqlDatabase } from "./sql-database";
import type { AssessmentHistoryRepository, AssessmentRecord, HistorySource, SessionDetail, SessionSummary } from "./types";

interface SummaryRow {
  assessment_id: string;
  session_id: string;
  created_at: string;
  source: string;
  simulation_profile: string | null;
  human_score: number;
  human_confidence: number;
  flags_json: string;
}

interface DetailRow extends SummaryRow {
  scoring_version: string;
  components_json: string;
  signals_json: string;
}

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
  };
}

export class SqlAssessmentRepository implements AssessmentHistoryRepository {
  constructor(private readonly database: SyncSqlDatabase) {}

  saveAssessment(record: AssessmentRecord): void {
    this.database.transaction(() => {
      this.database.execute(
        `INSERT INTO sessions (session_id, created_at, source, simulation_profile)
         VALUES (?, ?, ?, ?)`,
        record.sessionId,
        record.createdAt,
        record.source,
        record.simulationProfile ?? null,
      );
      this.database.execute(
        `INSERT INTO assessments (
          assessment_id, session_id, human_score, human_confidence, scoring_version,
          components_json, flags_json, signals_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        record.assessmentId,
        record.sessionId,
        record.human.score,
        record.human.confidence,
        record.human.scoringVersion,
        JSON.stringify(record.human.components),
        JSON.stringify(record.human.flags),
        JSON.stringify(record.signals),
      );
    });
  }

  listSessions(limit: number): SessionSummary[] {
    return this.database.query<SummaryRow>(
      `SELECT s.session_id, s.created_at, s.source, s.simulation_profile,
              a.assessment_id, a.human_score, a.human_confidence, a.flags_json
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
              a.components_json, a.flags_json, a.signals_json
       FROM sessions s
       JOIN assessments a ON a.session_id = s.session_id
       WHERE s.session_id = ?
       LIMIT 1`,
      sessionId,
    );
    const row = rows[0];
    if (!row) return null;

    const summary = mapSummary(row);
    const humanValue = {
      score: row.human_score,
      confidence: row.human_confidence,
      components: parseJson(row.components_json, "score components"),
      flags: parseJson(row.flags_json, "risk flags"),
      scoringVersion: row.scoring_version,
    };
    const signals = normalizeSignals(clientSignalsSchema.parse(parseJson(row.signals_json, "signals")));
    const assessment = assessmentResponseSchema.parse({
      assessmentId: row.assessment_id,
      sessionId: row.session_id,
      human: humanValue,
      identity: {
        status: "unavailable",
        subjectId: null,
        continuityConfidence: null,
        reason: "Identity continuity is not implemented in this prototype.",
      },
    }) satisfies AssessmentResponse;

    return { ...summary, assessment, signals: signals satisfies NormalizedSignals };
  }
}

export function createAssessmentRecord(
  assessment: AssessmentResponse,
  signals: NormalizedSignals,
  createdAt: string,
  source: HistorySource,
  simulationProfile?: SimulationProfile,
): AssessmentRecord {
  return {
    assessmentId: assessment.assessmentId,
    sessionId: assessment.sessionId,
    createdAt,
    source,
    ...(simulationProfile ? { simulationProfile } : {}),
    signals,
    human: assessment.human satisfies HumanLikelihoodAssessment,
  };
}
