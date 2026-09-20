import { z } from "zod";
import { buildAssessment, type AssessmentIdFactory, type ProcessedAssessment } from "./assess";
import { parseJsonRequest } from "./request";
import { generateSimulation, SIMULATION_PROFILES, type SimulationProfile } from "../simulator/profiles";

export const simulationRequestSchema = z.strictObject({
  profile: z.enum(SIMULATION_PROFILES),
});

export interface ProcessedSimulation extends ProcessedAssessment {
  profile: SimulationProfile;
}

export async function simulateRequest(
  request: Request,
  createId?: AssessmentIdFactory,
): Promise<ProcessedSimulation> {
  const body = await parseJsonRequest(
    request,
    simulationRequestSchema,
    "The simulation request does not contain a supported profile.",
  );
  const signals = generateSimulation(body.profile);
  const processed = buildAssessment(signals, signals.environment?.userAgent, createId);
  return { ...processed, profile: body.profile };
}
