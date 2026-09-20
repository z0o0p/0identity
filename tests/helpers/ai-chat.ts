export interface ChatResponseResult {
  status: "completed" | "error" | "skipped" | "aborted";
  requestId: string;
}

export class AIChatAgent<Environment = unknown> {
  protected readonly env: Environment;
  readonly name = "test-agent";
  readonly messages = [];

  constructor(_ctx: unknown, env: Environment) {
    this.env = env;
  }

  async onChatMessage(): Promise<Response | undefined> {
    return undefined;
  }
}
