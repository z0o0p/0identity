import { z } from "zod";
import { assessmentResponseSchema, subjectIdentifierSchema } from "./assessment";
import { clientSignalsSchema } from "../signals/schema";
import { SIMULATION_PROFILES } from "../simulator/profiles";
import { HISTORY_SOURCES } from "../storage/types";

export const historySourceSchema = z.enum(HISTORY_SOURCES);

export const sessionIdentifierSchema = z.string().regex(/^sess_[A-Za-z0-9-]{1,64}$/);

export const sessionSummarySchema = z.strictObject({
  assessmentId: z.string().min(1).max(80),
  sessionId: sessionIdentifierSchema,
  createdAt: z.iso.datetime(),
  source: historySourceSchema,
  simulationProfile: z.enum(SIMULATION_PROFILES).nullable(),
  humanScore: z.number().min(0).max(10),
  humanConfidence: z.number().min(0).max(1),
  flagCodes: z.array(z.string().min(1).max(80)).max(32),
  subjectId: subjectIdentifierSchema.nullable(),
  matchStatus: z.enum(["matched", "uncertain", "new", "unavailable"]),
  continuityConfidence: z.number().min(0).max(1).nullable(),
});

export const sessionListResponseSchema = z.strictObject({
  sessions: z.array(sessionSummarySchema).max(50),
});

export const sessionDetailSchema = sessionSummarySchema.extend({
  assessment: assessmentResponseSchema,
  signals: clientSignalsSchema,
});

export type SessionListResponse = z.infer<typeof sessionListResponseSchema>;
export type SessionDetailResponse = z.infer<typeof sessionDetailSchema>;
