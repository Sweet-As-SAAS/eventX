import { describe, expect, it } from "vitest";
import fixture from "../fixtures/demo-event.json";
import { EventProfile } from "../lib/schemas";
import { followUps, missingPaths, resolveStatedDate } from "../lib/ai/profile";
import type { Rule } from "../lib/rules/engine";

describe("profile safety checks", () => {
  it("moves an unspecified year to the next future date with the stated weekday", () => {
    expect(resolveStatedDate("Event Saturday 2 May", "2026-05-01", { value: "2025-05-02", source: "stated" }))
      .toEqual({ value: "2026-05-02", source: "stated" });
    expect(resolveStatedDate("Event 3 Jun", "2026-07-01", { value: "2026-06-03", source: "stated" }))
      .toEqual({ value: "2027-06-03", source: "stated" });
  });

  it("does not silently change an explicit year that contradicts the weekday", () => {
    expect(resolveStatedDate("Event Monday 2 May 2026", "2026-05-01", { value: "2026-05-02", source: "stated" }))
      .toEqual({ value: null, source: null });
  });

  it("uses field paths, including top-level fields, for every unknown", () => {
    const profile = EventProfile.parse(structuredClone(fixture.profile));
    profile.generators = { value: null, source: null };
    profile.food.cookingOnSite = { value: null, source: null };
    expect(missingPaths(profile)).toContain("generators");
    expect(missingPaths(profile)).toContain("food.cookingOnSite");
    expect(missingPaths(profile).some((path) => path.endsWith(".value"))).toBe(false);
  });

  it("asks about an unknown read by a verified Waimakariri rule", () => {
    const profile = EventProfile.parse(structuredClone(fixture.profile));
    profile.councilSlug = "waimakariri";
    profile.alcohol.supply = { value: null, source: null };
    profile.missing = missingPaths(profile);
    const rule: Rule = { id: "waimakariri-test", council: "waimakariri", verified: true,
      condition: { path: "alcohol.supply", eq: "sold" },
      outcome: { documentType: "special_licence_application", reason: "Test requirement" },
      sourceUrl: "https://example.org", sourceQuote: "Test quote", lastChecked: null };
    expect(followUps(profile, [rule]).map((q) => q.path)).toContain("alcohol.supply");
    expect(followUps(profile, [{ ...rule, verified: false }])).toEqual([]);
  });
});
