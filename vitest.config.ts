import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "cloudflare:workers",
        replacement: fileURLToPath(
          new URL("./tests/helpers/cloudflare-workers.ts", import.meta.url),
        ),
      },
      {
        find: /^agents$/,
        replacement: fileURLToPath(
          new URL("./tests/helpers/agents.ts", import.meta.url),
        ),
      },
      {
        find: /^@cloudflare\/ai-chat$/,
        replacement: fileURLToPath(
          new URL("./tests/helpers/ai-chat.ts", import.meta.url),
        ),
      },
      {
        find: /^workers-ai-provider$/,
        replacement: fileURLToPath(
          new URL("./tests/helpers/workers-ai-provider.ts", import.meta.url),
        ),
      },
    ],
  },
  test: {
    include: ["tests/**/*.test.ts", "web/**/*.test.ts"],
    css: { include: /\.module\.css$/ },
  },
});
