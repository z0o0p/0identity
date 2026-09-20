import { dashboardOverviewSchema, subjectHistoryResponseSchema } from "../../src/api/dashboard";
import {
  sessionDetailSchema,
  sessionListResponseSchema,
  type SessionDetailResponse,
  type SessionListResponse,
} from "../../src/api/history";
import type { HistorySource } from "../../src/storage/types";

function apiErrorMessage(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || !("error" in value)) return undefined;
  const error = value.error;
  if (typeof error !== "object" || error === null || !("message" in error)) return undefined;
  return typeof error.message === "string" ? error.message : undefined;
}

async function responseBody(response: Response): Promise<unknown> {
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(apiErrorMessage(body) ?? "Dashboard data is unavailable.");
  return body;
}

export async function getDashboardOverview(source: HistorySource, signal: AbortSignal) {
  const response = await fetch(`/api/v1/overview?source=${source}`, { cache: "no-store", signal });
  return dashboardOverviewSchema.parse(await responseBody(response));
}

export async function getDashboardSessions(
  source: HistorySource,
  signal: AbortSignal,
): Promise<SessionListResponse["sessions"]> {
  const response = await fetch(`/api/v1/sessions?source=${source}&limit=50`, { cache: "no-store", signal });
  return sessionListResponseSchema.parse(await responseBody(response)).sessions;
}

export async function getDashboardSession(
  sessionId: string,
  source: HistorySource,
  signal: AbortSignal,
): Promise<SessionDetailResponse> {
  const response = await fetch(
    `/api/v1/sessions/${encodeURIComponent(sessionId)}?source=${source}`,
    { cache: "no-store", signal },
  );
  return sessionDetailSchema.parse(await responseBody(response));
}

export async function getSubjectSessions(
  subjectId: string,
  source: HistorySource,
  signal: AbortSignal,
): Promise<SessionListResponse["sessions"]> {
  const response = await fetch(
    `/api/v1/subjects/${encodeURIComponent(subjectId)}/sessions?source=${source}&limit=12`,
    { cache: "no-store", signal },
  );
  return subjectHistoryResponseSchema.parse(await responseBody(response)).sessions;
}
