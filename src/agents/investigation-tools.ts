import { z } from "zod";
import {
  assessmentResponseSchema,
  componentAssessmentSchema,
  riskFlagSchema,
  subjectIdentifierSchema,
} from "../api/assessment";
import { sessionDetailSchema, sessionIdentifierSchema, sessionSummarySchema } from "../api/history";
import { identityFeatureVectorSchema } from "../identity/features";
import { HUMAN_COMPONENT_NAMES } from "../shared/domain";
import type { AssessmentHistoryReader, HistoryNamespace } from "../storage/types";

export const sessionToolInputSchema = z.strictObject({
  sessionId: sessionIdentifierSchema,
});

export const subjectToolInputSchema = z.strictObject({
  subjectId: subjectIdentifierSchema,
});

export const subjectHistoryToolInputSchema = subjectToolInputSchema.extend({
  limit: z.number().int().min(1).max(20).default(10),
});

export const compareSessionsToolInputSchema = z.strictObject({
  sessionA: sessionIdentifierSchema,
  sessionB: sessionIdentifierSchema,
}).refine(input => input.sessionA !== input.sessionB, {
  message: "Comparison requires two different session identifiers.",
});

const sessionNotFoundSchema = z.strictObject({
  status: z.literal("not_found"),
  entity: z.literal("session"),
  sessionId: sessionIdentifierSchema,
});

const subjectNotFoundSchema = z.strictObject({
  status: z.literal("not_found"),
  entity: z.literal("subject"),
  subjectId: subjectIdentifierSchema,
});

export const assessmentToolResultSchema = z.union([
  sessionNotFoundSchema,
  z.strictObject({
    status: z.literal("found"),
    assessment: assessmentResponseSchema,
  }),
]);

export const sessionToolResultSchema = z.union([
  sessionNotFoundSchema,
  z.strictObject({
    status: z.literal("found"),
    session: sessionDetailSchema,
  }),
]);

export const subjectToolResultSchema = z.union([
  subjectNotFoundSchema,
  z.strictObject({
    status: z.literal("found"),
    subject: z.strictObject({
      subjectId: subjectIdentifierSchema,
      createdAt: z.iso.datetime(),
      lastSeenAt: z.iso.datetime(),
      sessionCount: z.number().int().min(1),
      confidence: z.number().min(0).max(1),
      features: identityFeatureVectorSchema,
    }),
  }),
]);

export const subjectHistoryToolResultSchema = z.union([
  subjectNotFoundSchema,
  z.strictObject({
    status: z.literal("found"),
    subjectId: subjectIdentifierSchema,
    sessions: z.array(sessionSummarySchema).max(20),
  }),
]);

export const comparisonToolResultSchema = z.union([
  z.strictObject({
    status: z.literal("not_found"),
    entity: z.literal("session"),
    sessionIds: z.array(sessionIdentifierSchema).min(1).max(2),
  }),
  z.strictObject({
    status: z.literal("found"),
    sessions: z.tuple([sessionDetailSchema, sessionDetailSchema]),
  }),
]);

export const riskFlagsToolResultSchema = z.union([
  sessionNotFoundSchema,
  z.strictObject({
    status: z.literal("found"),
    sessionId: sessionIdentifierSchema,
    flags: z.array(riskFlagSchema).max(32),
  }),
]);

export const scoreBreakdownToolResultSchema = z.union([
  sessionNotFoundSchema,
  z.strictObject({
    status: z.literal("found"),
    sessionId: sessionIdentifierSchema,
    score: z.number().min(0).max(10),
    confidence: z.number().min(0).max(1),
    scoringVersion: z.string().min(1),
    components: z.partialRecord(z.enum(HUMAN_COMPONENT_NAMES), componentAssessmentSchema),
  }),
]);

export class InvestigationToolInputError extends Error {
  constructor(readonly issues: readonly z.core.$ZodIssue[]) {
    super("Investigation tool input is invalid.");
    this.name = "InvestigationToolInputError";
  }
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new InvestigationToolInputError(result.error.issues);
  return result.data;
}

/**
 * Read-only, namespace-bound evidence access for the investigation agent.
 * The narrower reader dependency prevents future tool handlers from reaching
 * enrollment or persistence methods by mistake.
 */
export class InvestigationTools {
  constructor(
    private readonly history: AssessmentHistoryReader,
    private readonly namespace: HistoryNamespace,
  ) {}

  async getAssessment(input: unknown): Promise<z.infer<typeof assessmentToolResultSchema>> {
    const { sessionId } = parseInput(sessionToolInputSchema, input);
    const session = await this.history.getSession(this.namespace, sessionId);
    return assessmentToolResultSchema.parse(session
      ? { status: "found", assessment: session.assessment }
      : { status: "not_found", entity: "session", sessionId });
  }

  async getSession(input: unknown): Promise<z.infer<typeof sessionToolResultSchema>> {
    const { sessionId } = parseInput(sessionToolInputSchema, input);
    const session = await this.history.getSession(this.namespace, sessionId);
    return sessionToolResultSchema.parse(session
      ? { status: "found", session }
      : { status: "not_found", entity: "session", sessionId });
  }

  async getSubject(input: unknown): Promise<z.infer<typeof subjectToolResultSchema>> {
    const { subjectId } = parseInput(subjectToolInputSchema, input);
    const subject = await this.history.getSubject(this.namespace, subjectId);
    return subjectToolResultSchema.parse(subject
      ? { status: "found", subject }
      : { status: "not_found", entity: "subject", subjectId });
  }

  async getSubjectHistory(input: unknown): Promise<z.infer<typeof subjectHistoryToolResultSchema>> {
    const { subjectId, limit } = parseInput(subjectHistoryToolInputSchema, input);
    const subject = await this.history.getSubject(this.namespace, subjectId);
    if (!subject) {
      return subjectHistoryToolResultSchema.parse({ status: "not_found", entity: "subject", subjectId });
    }
    const sessions = await this.history.listSubjectSessions(this.namespace, subjectId, limit);
    return subjectHistoryToolResultSchema.parse({ status: "found", subjectId, sessions });
  }

  async compareSessions(input: unknown): Promise<z.infer<typeof comparisonToolResultSchema>> {
    const { sessionA, sessionB } = parseInput(compareSessionsToolInputSchema, input);
    const [first, second] = await Promise.all([
      this.history.getSession(this.namespace, sessionA),
      this.history.getSession(this.namespace, sessionB),
    ]);
    if (!first || !second) {
      const sessionIds = [!first ? sessionA : null, !second ? sessionB : null]
        .filter((sessionId): sessionId is string => sessionId !== null);
      return comparisonToolResultSchema.parse({ status: "not_found", entity: "session", sessionIds });
    }
    return comparisonToolResultSchema.parse({ status: "found", sessions: [first, second] });
  }

  async getRiskFlags(input: unknown): Promise<z.infer<typeof riskFlagsToolResultSchema>> {
    const { sessionId } = parseInput(sessionToolInputSchema, input);
    const session = await this.history.getSession(this.namespace, sessionId);
    return riskFlagsToolResultSchema.parse(session
      ? { status: "found", sessionId, flags: session.assessment.human.flags }
      : { status: "not_found", entity: "session", sessionId });
  }

  async getScoreBreakdown(input: unknown): Promise<z.infer<typeof scoreBreakdownToolResultSchema>> {
    const { sessionId } = parseInput(sessionToolInputSchema, input);
    const session = await this.history.getSession(this.namespace, sessionId);
    if (!session) {
      return scoreBreakdownToolResultSchema.parse({ status: "not_found", entity: "session", sessionId });
    }
    const { score, confidence, scoringVersion, components } = session.assessment.human;
    return scoreBreakdownToolResultSchema.parse({
      status: "found",
      sessionId,
      score,
      confidence,
      scoringVersion,
      components,
    });
  }
}
