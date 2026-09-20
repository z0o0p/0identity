import { assessmentRequestSchema, type AssessmentResponse } from "./assessment";
import { parseJsonRequest } from "./request";
import { assessHumanLikelihood } from "../scoring/human";
import { normalizeSignals, type NormalizedSignals } from "../signals/normalize";
import type { ClientSignals } from "../signals/schema";

export { MAX_JSON_BODY_BYTES as MAX_ASSESSMENT_BODY_BYTES } from "./request";

export type AssessmentIdFactory = (prefix: "asm" | "sess") => string;

export interface ProcessedAssessment {
  response: AssessmentResponse;
  signals: NormalizedSignals;
}

const defaultIdFactory: AssessmentIdFactory = prefix => `${prefix}_${crypto.randomUUID()}`;

export function buildAssessment(
  signals: ClientSignals,
  serverUserAgent: string | undefined,
  createId: AssessmentIdFactory = defaultIdFactory,
): ProcessedAssessment {
  const human = assessHumanLikelihood(signals, serverUserAgent ? { server: { userAgent: serverUserAgent } } : {});
  return {
    signals: normalizeSignals(signals),
    response: {
      assessmentId: createId("asm"),
      sessionId: createId("sess"),
      human,
      identity: {
        status: "unavailable",
        subjectId: null,
        continuityConfidence: null,
        reason: "Identity continuity is not implemented in this prototype.",
      },
    },
  };
}

export async function assessRequest(
  request: Request,
  createId: AssessmentIdFactory = defaultIdFactory,
): Promise<ProcessedAssessment> {
  const body = await parseJsonRequest(
    request,
    assessmentRequestSchema,
    "The assessment request does not match the expected signal contract.",
  );
  return buildAssessment(body.signals, request.headers.get("user-agent") ?? undefined, createId);
}
