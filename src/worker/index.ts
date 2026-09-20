import type { HealthResponse } from "../shared/health";
import { authorizeRequest, type AccessEnv, type AccessTokenVerifier } from "./access";

interface WorkerDependencies {
  verifyAccessToken?: AccessTokenVerifier;
}

const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
} as const;

function errorResponse(status: number, code: string, message: string, headers?: Record<string, string>): Response {
  return Response.json({ error: { code, message } }, {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

export function createWorker(dependencies: WorkerDependencies = {}) {
  return {
    async fetch(request: Request, env: AccessEnv = {}): Promise<Response> {
      const access = await authorizeRequest(request, env, dependencies.verifyAccessToken);
      if (!access.authorized) {
        const message = access.code === "access_misconfigured"
          ? "Access protection is not configured."
          : "Access denied.";
        return errorResponse(access.status, access.code, message);
      }

      const { pathname } = new URL(request.url);

      if (pathname !== "/api/v1/health") {
        return errorResponse(404, "not_found", "Route not found.");
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        return errorResponse(405, "method_not_allowed", "Use GET or HEAD.", { Allow: "GET, HEAD" });
      }

      const health: HealthResponse = { status: "ok", service: "0identity" };
      return new Response(request.method === "HEAD" ? null : JSON.stringify(health), {
        headers: JSON_HEADERS,
      });
    },
  };
}

export default createWorker();
