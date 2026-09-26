import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Route handlers import "@/lib/...", so tests need the same alias as tsconfig. E2E specs run under Playwright, not Vitest.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["e2e/**", ".claude/**", "node_modules/**"],
    env: { DEMO_PAUSE_MS: "0" }, // the demo's one-second pause would only slow the suite
  },
});
