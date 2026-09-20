import { describe, expect, it, vi } from "vitest";
import { authorizeRequest, type AccessEnv } from "../src/worker/access";
import { createWorker } from "../src/worker/index";

const validEnv: AccessEnv = {
  POLICY_AUD: "reviewer-app-audience",
  TEAM_DOMAIN: "https://zeroidentity.cloudflareaccess.com",
};

describe("Cloudflare Access boundary", () => {
  it.each([
    "http://localhost/api/v1/health",
    "http://127.0.0.1/api/v1/health",
    "http://[::1]/api/v1/health",
  ])("allows local development without Access: %s", async url => {
    const verifier = vi.fn();
    const decision = await authorizeRequest(new Request(url), {}, verifier);
    expect(decision).toEqual({ authorized: true, source: "local" });
    expect(verifier).not.toHaveBeenCalled();
  });

  it("fails closed when deployed Access configuration is absent", async () => {
    const decision = await authorizeRequest(new Request("https://app.example.com/api/v1/health"), {});
    expect(decision).toEqual({ authorized: false, code: "access_misconfigured", status: 503 });
  });

  it.each([
    { POLICY_AUD: "aud", TEAM_DOMAIN: "http://team.cloudflareaccess.com" },
    { POLICY_AUD: "aud", TEAM_DOMAIN: "https://example.com" },
    { POLICY_AUD: "aud", TEAM_DOMAIN: "https://team.cloudflareaccess.com/path" },
    { POLICY_AUD: " ", TEAM_DOMAIN: "https://team.cloudflareaccess.com" },
  ])("rejects invalid deployed configuration: %j", async env => {
    const decision = await authorizeRequest(new Request("https://app.example.com/api/v1/health"), env);
    expect(decision).toEqual({ authorized: false, code: "access_misconfigured", status: 503 });
  });

  it("rejects a deployed request without the Access assertion", async () => {
    const decision = await authorizeRequest(
      new Request("https://app.example.com/api/v1/health"),
      validEnv,
    );
    expect(decision).toEqual({ authorized: false, code: "access_denied", status: 403 });
  });

  it("rejects a token that fails verification without exposing the reason", async () => {
    const verifier = vi.fn().mockRejectedValue(new Error("sensitive verifier detail"));
    const request = new Request("https://app.example.com/api/v1/health", {
      headers: { "Cf-Access-Jwt-Assertion": "invalid-token" },
    });

    const worker = createWorker({ verifyAccessToken: verifier });
    const response = await worker.fetch(request, validEnv);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: "access_denied", message: "Access denied." } });
  });

  it("accepts a token only after issuer and audience verification", async () => {
    const verifier = vi.fn().mockResolvedValue(undefined);
    const request = new Request("https://app.example.com/api/v1/health", {
      headers: { "Cf-Access-Jwt-Assertion": "signed-token" },
    });

    const worker = createWorker({ verifyAccessToken: verifier });
    const response = await worker.fetch(request, validEnv);

    expect(verifier).toHaveBeenCalledWith("signed-token", {
      audience: "reviewer-app-audience",
      teamDomain: "https://zeroidentity.cloudflareaccess.com",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", service: "0identity" });
  });
});
