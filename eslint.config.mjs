import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Supabase rows are untyped here (no generated DB types); `any` at that edge is the codebase's idiom, TS strict does the rest.
  { rules: { "@typescript-eslint/no-explicit-any": "off" } },
  globalIgnores([".claude/**", ".next/**", "node_modules/**", "next-env.d.ts", "reports/**", "playwright-report/**", "test-results/**"]),
]);
