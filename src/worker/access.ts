import { createRemoteJWKSet, jwtVerify } from "jose";

const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";
const CLOUDFLARE_ACCESS_SUFFIX = ".cloudflareaccess.com";

export interface AccessEnv {
  POLICY_AUD?: string;
  TEAM_DOMAIN?: string;
}

export type AccessDecision =
  | { authorized: true; source: "local" | "cloudflare-access" }
  | { authorized: false; code: "access_denied"; status: 403 }
  | { authorized: false; code: "access_misconfigured"; status: 503 };

export type AccessTokenVerifier = (
  token: string,
  config: Readonly<{ audience: string; teamDomain: string }>,
) => Promise<void>;

const remoteKeySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function isLocalRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function parseAccessConfig(env: AccessEnv): { audience: string; teamDomain: string } | null {
  const audience = env.POLICY_AUD?.trim();
  const rawTeamDomain = env.TEAM_DOMAIN?.trim();
  if (!audience || !rawTeamDomain) return null;

  try {
    const url = new URL(rawTeamDomain);
    const validDomain = url.protocol === "https:" && url.hostname.endsWith(CLOUDFLARE_ACCESS_SUFFIX);
    const originOnly = url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password;
    if (!validDomain || !originOnly) return null;
    return { audience, teamDomain: url.origin };
  } catch {
    return null;
  }
}

export async function verifyAccessToken(
  token: string,
  config: Readonly<{ audience: string; teamDomain: string }>,
): Promise<void> {
  let keySet = remoteKeySets.get(config.teamDomain);
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL("/cdn-cgi/access/certs", config.teamDomain));
    remoteKeySets.set(config.teamDomain, keySet);
  }

  await jwtVerify(token, keySet, {
    issuer: config.teamDomain,
    audience: config.audience,
  });
}

export async function authorizeRequest(
  request: Request,
  env: AccessEnv,
  verifier: AccessTokenVerifier = verifyAccessToken,
): Promise<AccessDecision> {
  // Local development is the only bypass. Deployed requests fail closed when
  // Access configuration or proof is absent.
  if (isLocalRequest(request)) return { authorized: true, source: "local" };

  const config = parseAccessConfig(env);
  if (!config) return { authorized: false, code: "access_misconfigured", status: 503 };

  const token = request.headers.get(ACCESS_JWT_HEADER)?.trim();
  if (!token) return { authorized: false, code: "access_denied", status: 403 };

  try {
    await verifier(token, config);
    return { authorized: true, source: "cloudflare-access" };
  } catch {
    return { authorized: false, code: "access_denied", status: 403 };
  }
}
