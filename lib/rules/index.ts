import { cccRules } from "./ccc";
export * from "./engine";
// Runtime reads verified rules from Supabase (lib/api/server.ts loadRules). This static set is the fallback and test fixture.
export const staticRules = [...cccRules];
