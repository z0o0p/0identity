import { assessmentResponseSchema, type AssessmentResponse } from "../../src/api/assessment";
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
