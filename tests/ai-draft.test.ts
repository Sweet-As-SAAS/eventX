import { describe, expect, it } from "vitest";
import fixture from "../fixtures/demo-event.json";
import { DraftDocument, EventProfile } from "../lib/schemas";
import { unsupportedDraftFacts } from "../lib/ai/draft";

describe("draft source guard", () => {
  const profile = EventProfile.parse(structuredClone(fixture.profile));
  profile.name = { value: "Harbour Gathering", source: "stated" };

  const draftWith = (body: string) => DraftDocument.parse({ documentType: "special_licence_application", title: "Draft",
    sections: [{ heading: "Premises", body }], placeholders: [], citedChunkIds: [] });

  it("flags event-specific names absent from the profile", () => {
    expect(unsupportedDraftFacts(draftWith("Harbour Events Limited is the organiser."), profile)).toContain(
      'Unsupported event-specific name: "Harbour Events Limited". Use the exact profile name or a placeholder.');
    expect(unsupportedDraftFacts(draftWith("Harbour Gathering is the event."), profile)).toEqual([]);
    expect(unsupportedDraftFacts(draftWith("Harbour Events Limited issued the guidance."), profile,
      "Council source: Harbour Events Limited issued the guidance.")).toEqual([]);
  });

  it("flags unknown licence status and legal alcohol designation", () => {
    const issues = unsupportedDraftFacts(draftWith("The premises are not currently licensed. This is a supervised designation."), profile);
    expect(issues).toHaveLength(2);
  });
});
