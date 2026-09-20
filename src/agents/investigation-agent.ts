import { AIChatAgent, type ChatResponseResult } from "@cloudflare/ai-chat";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { DurableHistoryService } from "../storage/durable-history-service";
import {
  INVESTIGATION_MODEL,
  hasValidInvestigationQuestion,
  MAX_INVESTIGATION_STEPS,
  createInvestigationAiTools,
  investigationSystemPrompt,
} from "./investigation-chat";
import { parseInvestigationAgentName } from "./investigation-scope";

export class InvestigationAgent extends AIChatAgent<Cloudflare.Env> {
  maxPersistedMessages = 40;
  hydrationByteBudget = 2 * 1024 * 1024;
  chatStreamStallTimeoutMs = 60_000;

  async onChatMessage(onFinish: Parameters<AIChatAgent["onChatMessage"]>[0], options?: Parameters<AIChatAgent["onChatMessage"]>[1]) {
    const scope = parseInvestigationAgentName(this.name);
    if (!scope) {
      return Response.json({ error: "Investigation scope is invalid." }, { status: 400 });
    }
    if (!hasValidInvestigationQuestion(this.messages)) {
      return Response.json({ error: "Investigation question is invalid." }, { status: 400 });
    }
    if (!this.env.AI) {
      return Response.json({ error: "Workers AI is not enabled in this environment." }, { status: 503 });
    }

    const history = new DurableHistoryService(this.env);
    const workersAi = createWorkersAI({ binding: this.env.AI });
    const result = streamText({
      model: workersAi(INVESTIGATION_MODEL, { safePrompt: true, reasoning_effort: "low" }),
      system: investigationSystemPrompt(scope),
      messages: await convertToModelMessages(this.messages),
      tools: createInvestigationAiTools(history, scope.namespace),
      stopWhen: stepCountIs(MAX_INVESTIGATION_STEPS),
      ...(options?.abortSignal ? { abortSignal: options.abortSignal } : {}),
      onFinish,
    });
    return result.toUIMessageStreamResponse({
      onError: () => "The investigation model is temporarily unavailable.",
    });
  }

  protected onChatResponse(result: ChatResponseResult): void {
    if (result.status !== "error") return;
    console.error(JSON.stringify({
      event: "investigation_turn_error",
      agentName: this.name,
      requestId: result.requestId,
    }));
  }
}
