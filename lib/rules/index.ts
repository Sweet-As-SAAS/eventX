import { cccRules } from "./ccc";
import { waimakaririRules } from "./waimakariri";
export * from "./engine";
// Runtime reads verified rules from Supabase (lib/api/server.ts loadRules). This static set is the fallback and test fixture.
export const staticRules = [...cccRules, ...waimakaririRules];
