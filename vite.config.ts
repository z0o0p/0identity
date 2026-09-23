import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import agents from "agents/vite";

export default defineConfig(({ command, mode }) => ({
  plugins: [
    react(),
    cloudflare({
      config: (config) => {
        if (mode === "offline" || (command === "serve" && mode !== "ai")) {
          // Workers AI has no local emulator; ordinary development stays offline.
          config.name = "0identity-local";
          config.ai = undefined;
        }
      },
    }),
    agents(),
  ],
}));
