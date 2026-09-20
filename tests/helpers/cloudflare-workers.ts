// Node-based unit tests exercise Worker routing with injected dependencies.
// The actual Durable Object base class is supplied by workerd in local runtime
// and deployment; this shim prevents Node from resolving the runtime-only URL.
export class DurableObject<Environment = unknown> {
  protected readonly ctx: unknown;
  protected readonly env: Environment;

  constructor(ctx: unknown, env: Environment) {
    this.ctx = ctx;
    this.env = env;
  }
}
