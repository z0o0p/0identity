import type { HealthResponse } from "../shared/health";

export default {
  fetch(request: Request): Response {
    const { pathname } = new URL(request.url);
    const headers = { "Cache-Control": "no-store" };

    if (pathname !== "/api/v1/health") {
      return Response.json({ error: { code: "not_found", message: "Route not found." } }, {
        status: 404,
        headers,
      });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return Response.json({ error: { code: "method_not_allowed", message: "Use GET or HEAD." } }, {
        status: 405,
        headers: { ...headers, Allow: "GET, HEAD" },
      });
    }

    const health: HealthResponse = { status: "ok", service: "0identity" };
    return new Response(request.method === "HEAD" ? null : JSON.stringify(health), {
      headers: { ...headers, "Content-Type": "application/json" },
    });
  },
};
