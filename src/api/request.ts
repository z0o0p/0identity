import type { z } from "zod";

export const MAX_JSON_BODY_BYTES = 64 * 1_024;

export interface ApiErrorDetails {
  path: string;
  code: string;
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: ApiErrorDetails[],
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function readBoundedBody(request: Request): Promise<string> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (Number.isFinite(length) && length > MAX_JSON_BODY_BYTES) {
      throw new ApiRequestError(413, "payload_too_large", "Request payload exceeds 64 KiB.");
    }
  }

  if (!request.body) throw new ApiRequestError(400, "invalid_json", "A JSON request body is required.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_JSON_BODY_BYTES) {
      await reader.cancel();
      throw new ApiRequestError(413, "payload_too_large", "Request payload exceeds 64 KiB.");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export async function parseJsonRequest<T>(request: Request, schema: z.ZodType<T>, invalidMessage: string): Promise<T> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new ApiRequestError(415, "unsupported_media_type", "Use application/json for requests with a body.");
  }

  const body = await readBoundedBody(request);
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new ApiRequestError(400, "invalid_json", "The request body is not valid JSON.");
  }

  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiRequestError(
      400,
      "invalid_request",
      invalidMessage,
      parsed.error.issues.slice(0, 12).map(issue => ({ path: issue.path.join("."), code: issue.code })),
    );
  }
  return parsed.data;
}
