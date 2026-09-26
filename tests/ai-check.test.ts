import { describe, expect, it } from "vitest";
import { safeSuggestedFix, unprovidedProperNames } from "../lib/ai/check";

describe("model-suggested fixes", () => {
  it("keeps unsupplied names as placeholders", () => {
    const draft = "Event manager Alex Example will oversee the event.";
    const suggested = "John Smith will lead first aid and Alex Example will coordinate volunteers.";
    expect(safeSuggestedFix(suggested, draft)).toBe(
      "[NAME TO CONFIRM] will lead first aid and Alex Example will coordinate volunteers.",
    );
  });

  it("detects names added by a fix while leaving known names alone", () => {
    const draft = "Taylor Example is the proposed duty manager.";
    expect(unprovidedProperNames("Taylor Example will supervise.", draft)).toEqual([]);
    expect(unprovidedProperNames("John Smith will supervise.", draft)).toEqual(["John Smith"]);
    expect(unprovidedProperNames("[NAME TO CONFIRM] will supervise.", draft)).toEqual([]);
  });
});
