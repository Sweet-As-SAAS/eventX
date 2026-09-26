import { describe, expect, it } from "vitest";
import recorded from "./fixtures/ai-live.json";
import { CheckResult, Classification, DraftDocument, EventProfile } from "../lib/schemas";
import { missingPaths } from "../lib/ai/profile";

describe("recorded live AI responses", () => {
  it.each([
    ["profiles", EventProfile, recorded.profiles],
    ["classifications", Classification, recorded.classifications],
    ["drafts", DraftDocument, recorded.drafts],
    ["checks", CheckResult, recorded.checks],
  ])("has ten schema-valid %s", (_name, schema, values) => {
    expect(values).toHaveLength(10);
    for (const value of values) expect(schema.safeParse(value).success).toBe(true);
  });

  it("keeps unknown profile paths consistent", () => {
    for (const value of recorded.profiles) {
      const profile = EventProfile.parse(value);
      expect(profile.missing).toEqual(missingPaths(profile));
      expect(profile.date.value === null || profile.date.value >= "2026-09-26").toBe(true);
    }
  });

  it("does not print unverified fee amounts in classification", () => {
    for (const value of recorded.classifications) {
      const result = Classification.parse(value);
      expect(result.citedChunkIds.length).toBeGreaterThan(0);
      expect(`${result.reasoning} ${result.howToPresent ?? ""}`).not.toMatch(/\$\s?\d|\b\d+(?:\.\d{2})?\s*(?:NZD|dollars)\b/i);
    }
  });

  it("lists every literal draft placeholder and gives no evidence for failed checks", () => {
    for (const value of recorded.drafts) {
      const draft = DraftDocument.parse(value);
      const literal = [...new Set(draft.sections.flatMap((section) => section.body.match(/\[[^\[\]\n]+\]/g) ?? []))];
      expect(draft.placeholders).toEqual(literal);
      expect(draft.citedChunkIds.length).toBeGreaterThan(0);
    }
    for (const value of recorded.checks) {
      const checked = CheckResult.parse(value);
      expect(checked.items.length).toBeGreaterThan(0);
      for (const item of checked.items) if (!item.pass) expect(item.evidence).toBe("");
    }
  });
});
