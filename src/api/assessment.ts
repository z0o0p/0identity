import { z } from "zod";
import { HUMAN_COMPONENT_NAMES } from "../shared/domain";
import { clientSignalsSchema } from "../signals/schema";

const riskFlagCodeSchema = z.enum([
  "browser_platform_mismatch",
  "browser_user_agent_mismatch",
  "unexpected_api_support",
  "header_browser_mismatch",
  "rendering_environment_mismatch",
  "implausible_touch_configuration",
  "webdriver_exposed",
  "highly_regular_pointer",
  "highly_regular_keyboard",
]);

const componentAssessmentSchema = z.strictObject({
  score: z.number().min(0).max(10),
  confidence: z.number().min(0).max(1),
  evidenceCount: z.number().int().min(0),
});

export const assessmentRequestSchema = z.strictObject({
  signals: clientSignalsSchema,
});

export const assessmentResponseSchema = z.strictObject({
  assessmentId: z.string().min(1).max(80),
  sessionId: z.string().min(1).max(80),
  human: z.strictObject({
    score: z.number().min(0).max(10),
    confidence: z.number().min(0).max(1),
    components: z.partialRecord(z.enum(HUMAN_COMPONENT_NAMES), componentAssessmentSchema),
    flags: z.array(z.strictObject({
      code: riskFlagCodeSchema,
      category: z.enum(["behavior", "environment"]),
      severity: z.enum(["low", "medium", "high"]),
      explanation: z.string().min(1),
    })),
    scoringVersion: z.string().min(1),
  }),
  identity: z.strictObject({
    status: z.literal("unavailable"),
    subjectId: z.null(),
    continuityConfidence: z.null(),
    reason: z.string().min(1),
  }),
});

export type AssessmentRequest = z.infer<typeof assessmentRequestSchema>;
export type AssessmentResponse = z.infer<typeof assessmentResponseSchema>;
