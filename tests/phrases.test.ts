import { describe, expect, it } from "vitest";
import fixture from "../fixtures/demo-event.json";
import { EventProfile } from "../lib/schemas";
import { field, findPhrases } from "../components/profile-fields";

describe("findPhrases", () => {
  const profile = EventProfile.parse(fixture.profile);
  const text = fixture.description;
  const phrases = findPhrases(text, profile);

  it("marks only text that is really in the description, without overlaps", () => {
    expect(phrases.length).toBeGreaterThan(0);
    phrases.forEach((p, i) => {
      expect(text.slice(p.start, p.end).trim().length).toBeGreaterThan(0);
      if (i) expect(p.start).toBeGreaterThanOrEqual(phrases[i - 1].end);
    });
  });

  it("never marks inferred or unknown fields", () => {
    for (const p of phrases) expect(field(profile, p.path).source).toBe("stated");
  });

  it("marks nothing when nothing was stated", () => {
    const blank = JSON.parse(JSON.stringify(profile), (_k, v) => (v && typeof v === "object" && "source" in v ? { ...v, source: "inferred" } : v));
    expect(findPhrases(text, blank)).toEqual([]);
  });
});
