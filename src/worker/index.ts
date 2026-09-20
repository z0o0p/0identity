import { assessRequest, type AssessmentIdFactory } from "../api/assess";
import { historySourceSchema, sessionIdentifierSchema } from "../api/history";
import { ApiRequestError } from "../api/request";
import { simulateRequest } from "../api/simulation";
import type { HealthResponse } from "../shared/health";
import { DurableHistoryService } from "../storage/durable-history-service";
import { createAssessmentRecord } from "../storage/sql-assessment-repository";
import type { AssessmentHistoryService, HistoryNamespace, HistorySource } from "../storage/types";
import { authorizeRequest, type AccessEnv, type AccessTokenVerifier } from "./access";

export { IdentityHistory } from "../storage/identity-history";

type WorkerEnv = AccessEnv & Partial<Pick<Cloudflare.Env, "IDENTITY_HISTORY">>;

interface WorkerDependencies {
  verifyAccessToken?: AccessTokenVerifier;
  createId?: AssessmentIdFactory;
  history?: AssessmentHistoryService;
  now?: () => Date;
}

class HistoryUnavailableError extends Error {
  constructor(readonly cause: unknown) {
    super("Assessment history is unavailable.");
    this.name = "HistoryUnavailableError";
  }
}

const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
} as const;

const HISTORY_NAMESPACE: Record<HistorySource, HistoryNamespace> = {
  live: "live-v1",
  simulation: "simulation-v1",
};

function errorResponse(
  status: number,
  code: string,
  message: string,
  requestId: string,
  headers?: Record<string, string>,
  details?: ApiRequestError["details"],
): Response {
  return Response.json({ error: { code, message, ...(details ? { details } : {}) } }, {
    status,
    headers: { ...JSON_HEADERS, "X-Request-Id": requestId, ...headers },
  });
}

function historyService(env: WorkerEnv | undefined, dependencies: WorkerDependencies): AssessmentHistoryService {
  if (dependencies.history) return dependencies.history;
  if (env?.IDENTITY_HISTORY) return new DurableHistoryService({ IDENTITY_HISTORY: env.IDENTITY_HISTORY });
  throw new HistoryUnavailableError("Durable Object binding is missing.");
}

function parseHistoryQuery(url: URL): { source: HistorySource; limit: number } {
  for (const key of url.searchParams.keys()) {
    if (key !== "source" && key !== "limit") {
      throw new ApiRequestError(400, "invalid_query", "History query parameters are invalid.");
    }
  }

  if (url.searchParams.getAll("source").length > 1 || url.searchParams.getAll("limit").length > 1) {
    throw new ApiRequestError(400, "invalid_query", "History query parameters must not be repeated.");
  }

  const sourceResult = historySourceSchema.safeParse(url.searchParams.get("source") ?? "simulation");
  const limitText = url.searchParams.get("limit") ?? "12";
  const limit = Number(limitText);
  if (!sourceResult.success || !/^\d+$/.test(limitText) || !Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new ApiRequestError(400, "invalid_query", "History source or limit is invalid.");
  }
  return { source: sourceResult.data, limit };
}

async function withHistory<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof HistoryUnavailableError) throw error;
    throw new HistoryUnavailableError(error);
  }
}

export function createWorker(dependencies: WorkerDependencies = {}) {
  return {
    async fetch(request: Request, env?: WorkerEnv): Promise<Response> {
      const requestId = crypto.randomUUID();
      const access = await authorizeRequest(request, env ?? {}, dependencies.verifyAccessToken);
      if (!access.authorized) {
        const message = access.code === "access_misconfigured"
          ? "Access protection is not configured."
          : "Access denied.";
        return errorResponse(access.status, access.code, message, requestId);
      }

      const url = new URL(request.url);
      const { pathname } = url;

      try {
        if (pathname === "/api/v1/assess" || pathname === "/api/v1/simulate") {
          if (request.method !== "POST") {
            return errorResponse(405, "method_not_allowed", "Use POST.", requestId, { Allow: "POST" });
          }

          const history = historyService(env, dependencies);
          const createdAt = (dependencies.now?.() ?? new Date()).toISOString();
          if (pathname === "/api/v1/simulate") {
            const simulation = await simulateRequest(request, dependencies.createId);
            await withHistory(() => history.saveAssessment(
              HISTORY_NAMESPACE.simulation,
              createAssessmentRecord(
                simulation.response,
                simulation.signals,
                createdAt,
                "simulation",
                simulation.profile,
              ),
            ));
            return Response.json(simulation.response, {
              headers: { ...JSON_HEADERS, "X-Request-Id": requestId },
            });
          }

          const assessment = await assessRequest(request, dependencies.createId);
          await withHistory(() => history.saveAssessment(
            HISTORY_NAMESPACE.live,
            createAssessmentRecord(assessment.response, assessment.signals, createdAt, "live"),
          ));
          return Response.json(assessment.response, {
            headers: { ...JSON_HEADERS, "X-Request-Id": requestId },
          });
        }

        if (pathname === "/api/v1/sessions") {
          if (request.method !== "GET") {
            return errorResponse(405, "method_not_allowed", "Use GET.", requestId, { Allow: "GET" });
          }
          const { source, limit } = parseHistoryQuery(url);
          const history = historyService(env, dependencies);
          const sessions = await withHistory(() => history.listSessions(HISTORY_NAMESPACE[source], limit));
          return Response.json({ sessions }, { headers: { ...JSON_HEADERS, "X-Request-Id": requestId } });
        }

        if (pathname.startsWith("/api/v1/sessions/")) {
          if (request.method !== "GET") {
            return errorResponse(405, "method_not_allowed", "Use GET.", requestId, { Allow: "GET" });
          }
          const sessionId = pathname.slice("/api/v1/sessions/".length);
          const identifier = sessionIdentifierSchema.safeParse(sessionId);
          if (!identifier.success) {
            return errorResponse(400, "invalid_identifier", "Session identifier is invalid.", requestId);
          }
          const { source } = parseHistoryQuery(url);
          const history = historyService(env, dependencies);
          const session = await withHistory(() => history.getSession(HISTORY_NAMESPACE[source], identifier.data));
          if (!session) return errorResponse(404, "session_not_found", "Session was not found.", requestId);
          return Response.json(session, { headers: { ...JSON_HEADERS, "X-Request-Id": requestId } });
        }

        if (pathname !== "/api/v1/health") {
          return errorResponse(404, "not_found", "Route not found.", requestId);
        }

        if (request.method !== "GET" && request.method !== "HEAD") {
          return errorResponse(405, "method_not_allowed", "Use GET or HEAD.", requestId, { Allow: "GET, HEAD" });
        }

        const health: HealthResponse = { status: "ok", service: "0identity" };
        return new Response(request.method === "HEAD" ? null : JSON.stringify(health), {
          headers: { ...JSON_HEADERS, "X-Request-Id": requestId },
        });
      } catch (error) {
        if (error instanceof ApiRequestError) {
          return errorResponse(error.status, error.code, error.message, requestId, undefined, error.details);
        }

        const historyUnavailable = error instanceof HistoryUnavailableError;
        console.error(JSON.stringify({
          event: historyUnavailable ? "history_error" : "request_error",
          requestId,
          path: pathname,
          error: error instanceof Error ? error.message : "Unknown error",
        }));
        return errorResponse(
          historyUnavailable ? 503 : 500,
          historyUnavailable ? "history_unavailable" : "internal_error",
          historyUnavailable ? "Assessment history is temporarily unavailable." : "The request could not be completed.",
          requestId,
        );
      }
    },
  };
}

export default createWorker();
