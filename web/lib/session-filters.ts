import type { SessionListResponse } from "../../src/api/history";

export type HumanFilter = "all" | "likely-human" | "mixed" | "suspicious";
export type ContinuityFilter = "all" | "matched" | "uncertain" | "new" | "unavailable";

export interface SessionFilters {
  query: string;
  human: HumanFilter;
  continuity: ContinuityFilter;
}

type SessionSummary = SessionListResponse["sessions"][number];

function matchesHumanFilter(session: SessionSummary, filter: HumanFilter): boolean {
  if (filter === "all") return true;
  if (filter === "likely-human") return session.humanScore >= 7.5 && session.humanConfidence >= 0.5;
  if (filter === "suspicious") return session.humanScore < 4.5 && session.humanConfidence >= 0.5;
  return session.humanConfidence < 0.5 || (session.humanScore >= 4.5 && session.humanScore < 7.5);
}

export function filterDashboardSessions(
  sessions: SessionListResponse["sessions"],
  filters: SessionFilters,
): SessionListResponse["sessions"] {
  const query = filters.query.trim().toLowerCase();
  return sessions.filter(session => {
    const matchesQuery = !query || [
      session.sessionId,
      session.assessmentId,
      session.subjectId ?? "",
      session.simulationProfile ?? "",
      ...session.flagCodes,
    ].some(value => value.toLowerCase().includes(query));
    const matchesContinuity = filters.continuity === "all" || session.matchStatus === filters.continuity;
    return matchesQuery && matchesContinuity && matchesHumanFilter(session, filters.human);
  });
}
