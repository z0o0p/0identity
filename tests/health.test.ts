import { describe, expect, it } from "vitest";
import worker from "../src/worker/index";
import { isHealthResponse } from "../src/shared/health";

describe("health API", () => {
  it("reports service health without cacheable or sensitive data", async () => {
    const response = await worker.fetch(new Request("http://localhost/api/v1/health"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ status: "ok", service: "0identity" });
  });

  it("supports HEAD without a response body", async () => {
    const response = await worker.fetch(new Request("http://localhost/api/v1/health", { method: "HEAD" }));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  it.each(["POST", "PUT", "DELETE", "OPTIONS"])("rejects %s", async method => {
    const response = await worker.fetch(new Request("http://localhost/api/v1/health", { method }));
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
    expect(await response.json()).toMatchObject({ error: { code: "method_not_allowed" } });
  });

  it.each(["/api", "/api/v1/unknown", "/api/v1/health/"])("returns JSON 404 for %s", async path => {
    const response = await worker.fetch(new Request(`http://localhost${path}`));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "not_found" } });
  });
});

describe("health response validation", () => {
  it("accepts the expected service response", () => {
    expect(isHealthResponse({ status: "ok", service: "0identity" })).toBe(true);
  });
  it.each([null, "ok", {}, { status: "ok" }, { status: "error", service: "0identity" }, { status: "ok", service: "other" }])("rejects an invalid response: %j", value => {
    expect(isHealthResponse(value)).toBe(false);
  });
});
