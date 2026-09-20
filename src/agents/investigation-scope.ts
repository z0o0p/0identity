import { z } from "zod";
import { sessionIdentifierSchema } from "../api/history";
import { historySourceSchema } from "../api/history";
import type { HistoryNamespace, HistorySource } from "../storage/types";

const AGENT_NAME_SEPARATOR = "__";
export const MAX_INVESTIGATION_QUESTION_CHARS = 1_200;

export interface InvestigationScope {
  source: HistorySource;
  namespace: HistoryNamespace;
  sessionId: string;
}

const investigationAgentNameSchema = z.string().max(96).transform((name, context): InvestigationScope => {
  const separator = name.indexOf(AGENT_NAME_SEPARATOR);
  if (separator < 1 || name.indexOf(AGENT_NAME_SEPARATOR, separator + AGENT_NAME_SEPARATOR.length) !== -1) {
    context.addIssue({ code: "custom", message: "Investigation Agent name is invalid." });
    return z.NEVER;
  }
  const source = historySourceSchema.safeParse(name.slice(0, separator));
  const sessionId = sessionIdentifierSchema.safeParse(name.slice(separator + AGENT_NAME_SEPARATOR.length));
  if (!source.success || !sessionId.success) {
    context.addIssue({ code: "custom", message: "Investigation Agent scope is invalid." });
    return z.NEVER;
  }
  return {
    source: source.data,
    namespace: source.data === "live" ? "live-v1" : "simulation-v1",
    sessionId: sessionId.data,
  };
});

export function investigationAgentName(source: HistorySource, sessionId: string): string {
  return `${source}${AGENT_NAME_SEPARATOR}${sessionIdentifierSchema.parse(sessionId)}`;
}

export function parseInvestigationAgentName(name: string): InvestigationScope | null {
  const result = investigationAgentNameSchema.safeParse(name);
  return result.success ? result.data : null;
}

export function investigationScopeFromPath(pathname: string): InvestigationScope | null {
  const match = pathname.match(/^\/agents\/investigation-agent\/([^/]+)(?:\/.*)?$/);
  if (!match?.[1]) return null;
  return parseInvestigationAgentName(match[1]);
}
