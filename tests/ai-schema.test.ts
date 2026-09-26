// Recorded live AI outputs (scripts/record-ai-outputs.ts) must parse against lib/schemas.ts and satisfy the guards'
// invariants. No OpenAI calls in CI: re-record after changing a prompt, a model or a schema.
import { describe, it, expect } from "vitest";
import { z } from "zod";
import recordings from "./recordings/ai-outputs.json";
import { CheckResult, Classification, DraftDocument, EventProfile, FollowUpQuestion } from "../lib/schemas";
import { extractPlaceholders, profileFields } from "../lib/ai/guards";

describe("recorded live AI outputs", () => {
  it.each([
    ["profiles", EventProfile, recordings.profiles],
    ["classifications", Classification, recordings.classifications],
    ["drafts", DraftDocument, recordings.drafts],
    ["checks", CheckResult, recordings.checks],
  ] as const)("%s: at least 10, and every one parses", (_, schema, values) => {
    expect(values.length).toBeGreaterThanOrEqual(10);
    for (const v of values) expect(() => schema.parse(v)).not.toThrow();
  });

  it("profiles: missing is exactly the unknown fields, and no field claims the organiser answered it", () => {
    for (const raw of recordings.profiles) {
      const p = EventProfile.parse(raw);
      const fields = profileFields(p);
      expect(p.missing).toEqual(fields.filter((f) => f.field.value == null).map((f) => f.path));
      expect(fields.some((f) => f.field.source === "answered")).toBe(false);
    }
  });

  // Questions come from the fixed bank (no AI), so there are fewer distinct sets; they still must parse.
  it("questions: every set parses, at most 3 per event", () => {
    for (const q of recordings.questions) expect(z.array(FollowUpQuestion).max(3).parse(q)).toBeTruthy();
  });

  it("drafts: placeholder list matches the text, and no citation ids in the text", () => {
    for (const raw of recordings.drafts) {
      const d = DraftDocument.parse(raw);
      expect(new Set(d.placeholders)).toEqual(new Set(extractPlaceholders(d)));
      expect(JSON.stringify(d.sections)).not.toMatch(/chunk [\w-]*\d/i);
    }
  });

  it("checks: every failed item carries a fix; every pass carries evidence", () => {
    for (const raw of recordings.checks)
      for (const i of CheckResult.parse(raw).items) expect(i.pass ? i.evidence.length > 0 : !!i.suggestedFix).toBe(true);
  });

  it("classifications: grounded in cited council text, or unclear", () => {
    for (const raw of recordings.classifications) {
      const c = Classification.parse(raw);
      expect(c.category === "unclear" || c.citedChunkIds.length > 0).toBe(true);
      expect(`${c.reasoning} ${c.howToPresent ?? ""}`).not.toMatch(/chunk [\w-]*\d/i);
    }
  });
});
