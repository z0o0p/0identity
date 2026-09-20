import { z } from "zod";
import { sessionSummarySchema } from "./history";

export const dashboardOverviewSchema = z.strictObject({
  totalSessions: z.number().int().min(0),
  likelyHumanSessions: z.number().int().min(0),
  suspiciousSessions: z.number().int().min(0),
  anonymousSubjects: z.number().int().min(0),
  uncertainMatches: z.number().int().min(0),
});

export const subjectHistoryResponseSchema = z.strictObject({
  sessions: z.array(sessionSummarySchema).max(50),
});

export type DashboardOverview = z.infer<typeof dashboardOverviewSchema>;
export type SubjectHistoryResponse = z.infer<typeof subjectHistoryResponseSchema>;
