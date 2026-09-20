import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import agents from "agents/vite";

export default defineConfig(({ command, mode }) => ({
  plugins: [
    react(),
    cloudflare({
      configPath: mode === "offline" || (command === "serve" && mode !== "ai")
        ? "./wrangler.local.jsonc"
        : "./wrangler.jsonc",
    }),
    agents(),
  ],
}));
