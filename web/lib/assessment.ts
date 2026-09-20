import { assessmentResponseSchema, type AssessmentResponse } from "../../src/api/assessment";
import { sessionDetailSchema, sessionListResponseSchema, type SessionDetailResponse } from "../../src/api/history";
import type { SimulationProfile } from "../../src/simulator/profiles";

function apiErrorMessage(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || !("error" in value)) return undefined;
  const error = value.error;
  if (typeof error !== "object" || error === null || !("message" in error)) return undefined;
  return typeof error.message === "string" ? error.message : undefined;
}

async function responseBody(response: Response): Promise<unknown> {
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(apiErrorMessage(body) ?? "The request could not be completed.");
  return body;
}

export async function submitSimulation(profile: SimulationProfile, signal: AbortSignal): Promise<AssessmentResponse> {
  const response = await fetch("/api/v1/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal,
    body: JSON.stringify({ profile }),
  });

  const body = await responseBody(response);
  const parsed = assessmentResponseSchema.safeParse(body);
  if (!parsed.success) throw new Error("The Worker returned an unexpected assessment response.");
  return parsed.data;
}

export async function getSimulationHistory(signal: AbortSignal) {
  const response = await fetch("/api/v1/sessions?source=simulation&limit=12", { cache: "no-store", signal });
  return sessionListResponseSchema.parse(await responseBody(response)).sessions;
}

export async function getSimulationSession(sessionId: string, signal: AbortSignal): Promise<SessionDetailResponse> {
  const response = await fetch(`/api/v1/sessions/${encodeURIComponent(sessionId)}?source=simulation`, {
    cache: "no-store",
    signal,
  });
  return sessionDetailSchema.parse(await responseBody(response));
}
