import { describe, expect, it } from "vitest";
import fixture from "../fixtures/demo-event.json";
import { DraftDocument, EventProfile } from "../lib/schemas";
import { honestAttachments, unsupportedDraftFacts } from "../lib/ai/draft";

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

  it("allows the people the organiser named, and nobody else", () => {
    const named = structuredClone(profile);
    named.people.dutyManager = { value: "Harbour Rivers", source: "answered" };
    expect(unsupportedDraftFacts(draftWith("Harbour Rivers is the duty manager."), named)).toEqual([]);
    expect(unsupportedDraftFacts(draftWith("Harbour Rivers is the duty manager."), profile)).toHaveLength(1);
  });

  it("flags claims that a file is already attached", () => {
    expect(unsupportedDraftFacts(draftWith("Food and drinks menus are attached."), profile)).toHaveLength(1);
    expect(unsupportedDraftFacts(draftWith("Food and drinks menus: [ATTACH MENUS]."), profile)).toEqual([]);
    expect(unsupportedDraftFacts(draftWith("The site plan will be attached when lodging."), profile)).toEqual([]);
    expect(honestAttachments("Food and drinks menus are attached.")).toBe("Food and drinks menus will be attached to the application.");
  });

  it("flags unknown licence status and legal alcohol designation", () => {
    const issues = unsupportedDraftFacts(draftWith("The premises are not currently licensed. This is a supervised designation."), profile);
    expect(issues).toHaveLength(2);
  });
});
