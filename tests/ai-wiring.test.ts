// Every AI function must run its guard on the model's output. The model and retrieval are faked, so this runs
// without keys: each fake returns deliberately bad output and the test checks the function's result was fixed.
import { describe, it, expect, vi, beforeEach } from "vitest";
import fixture from "../fixtures/demo-event.json";
import { EventProfile, EventDocument, type Classification, type CheckResult, type DraftDocument } from "../lib/schemas";

const fake = vi.hoisted(() => ({ output: null as unknown, prompts: [] as string[] }));
vi.mock("../lib/ai/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/ai/client")>()),
  structured: vi.fn(async (opts: { user: string }) => { fake.prompts.push(opts.user); return structuredClone(fake.output); }),
}));
vi.mock("../lib/ai/retrieve", () => ({
  retrieve: vi.fn(async () => [{ id: "c1", heading: "Fees", content: "Special licence fee $207", url: "https://example.org" }]),
  chunksToText: () => "chunk text",
}));

const { buildProfile, applyAnswers } = await import("../lib/ai/profile");
const { draftDocument } = await import("../lib/ai/draft");
const { checkDocument, applyFix } = await import("../lib/ai/check");
const { classify } = await import("../lib/ai/classify");

const profile = () => EventProfile.parse(structuredClone(fixture.profile));
const hs = EventDocument.parse(fixture.documents.find((d) => d.id === fixture.fixedDocument.id));

beforeEach(() => { fake.prompts = []; });

describe("each AI function applies its guard", () => {
  it("buildProfile: missing recomputed, past date rolled forward, council forced", async () => {
    fake.output = { ...profile(), councilSlug: "waimakariri", date: { value: "2026-03-14", source: "stated" },
      generators: { value: null, source: null }, missing: ["generators.value"] };
    const out = await buildProfile(fixture.description, "ccc", "2026-09-26");
    expect(out.councilSlug).toBe("ccc");
    expect(out.date.value).toBe("2027-03-14");
    expect(out.missing).toContain("generators");
    expect(out.missing).not.toContain("generators.value");
  });

  it("draftDocument: type forced, invented citation dropped, placeholders from text, crowd-scoped items marked", async () => {
    fake.output = { documentType: "hazard_register", title: "Waste", placeholders: [], citedChunkIds: ["c1", "invented"],
      sections: [{ heading: "How waste will be managed", body: "Bins by [CONTRACTOR]." }] } satisfies DraftDocument;
    const out = await draftDocument(profile(), "waste_management_confirmation", {
      sections: ["How waste will be managed"],
      checklist: [{ id: "a", text: "Explains how waste is managed" }, { id: "b", text: "For events of about 1000 attendees or more: lists equipment" }],
    });
    expect(out).toMatchObject({ documentType: "waste_management_confirmation", citedChunkIds: ["c1"], placeholders: ["[CONTRACTOR]"] });
    expect(fake.prompts[0]).toMatch(/do not apply because of this event's expected crowd size[\s\S]*\(b\)/);
  });

  it("draftDocument: gives the drafter the deadline engine's dates, and flags a lodgement that is already late", async () => {
    fake.output = hs.content;
    const { keyDates } = await import("../lib/ai/draft");
    const p = { ...profile(), date: { value: "2027-02-13", source: "stated" as const } };
    await draftDocument(p, "special_licence_application", { sections: [], checklist: [] });
    expect(fake.prompts[0]).toMatch(/Key dates from HostReady's deadline engine[\s\S]*no later than 2026-12-18/);
    expect(keyDates(p, "special_licence_application", "2026-09-26")).not.toContain("already past");
    expect(keyDates(p, "special_licence_application", "2027-01-20")).toContain("already past the legal minimum");
    expect(keyDates({ ...p, date: { value: null, source: null } }, "special_licence_application")).toBe("");
  });

  it("draftDocument: tells the drafter a band answer is not an exact number", async () => {
    fake.output = hs.content;
    const answered = applyAnswers({ ...profile(), missing: ["peakAttendance"] }, [{ path: "peakAttendance", answer: "151 to 400" }]);
    await draftDocument(answered, "health_safety_plan", { sections: [], checklist: [] });
    expect(fake.prompts[0]).toContain('"151 to 400"');
  });

  it("checkDocument: one result per applicable item, hallucinated pass failed, crowd-scoped items skipped", async () => {
    fake.output = { items: [{ itemId: "a", text: "x", pass: true, evidence: "Words that are not in the draft", suggestedFix: null }] } satisfies CheckResult;
    const out = await checkDocument(hs.content!, [
      { id: "a", text: "Assembly point named" },
      { id: "b", text: "For events of about 1000 attendees or more: lists equipment" },
    ], profile());
    expect(out.items.map((i) => i.itemId)).toEqual(["a"]);
    expect(out.items[0]).toMatchObject({ pass: false, evidence: "" });
    expect(out.items[0].suggestedFix).toBeTruthy();
  });

  it("checkDocument: asks again for items the model skipped instead of failing them by default", async () => {
    const quote = hs.content!.sections[0].body.split(".")[0];
    let call = 0;
    const { structured } = await import("../lib/ai/client");
    vi.mocked(structured).mockImplementation(async () => (++call === 1
      ? { items: [{ itemId: "a", text: "a", pass: true, evidence: quote, suggestedFix: null }] }
      : { items: [{ itemId: "b", text: "b", pass: true, evidence: quote, suggestedFix: null }] }) as never);
    const out = await checkDocument(hs.content!, [{ id: "a", text: "A" }, { id: "b", text: "B" }]);
    expect(call).toBe(2);
    expect(out.items.map((i) => [i.itemId, i.pass])).toEqual([["a", true], ["b", true]]);
    vi.mocked(structured).mockImplementation(async (opts: { user: string }) => { fake.prompts.push(opts.user); return structuredClone(fake.output) as never; });
  });

  it("checkDocument: a pass with an unfindable quote gets one retry, and only a real quote turns it green", async () => {
    const real = hs.content!.sections[0].body.split(".")[0];
    const { structured } = await import("../lib/ai/client");
    const answers = [
      { items: [{ itemId: "a", text: "a", pass: true, evidence: "A sentence that is not in the draft at all", suggestedFix: null }] },
      { items: [{ itemId: "a", text: "a", pass: true, evidence: real, suggestedFix: null }] },
    ];
    const notes: string[] = [];
    vi.mocked(structured).mockImplementation(async (opts: { user: string }) => { notes.push(opts.user); return answers.shift() as never; });
    const out = await checkDocument(hs.content!, [{ id: "a", text: "A" }]);
    expect(notes).toHaveLength(2);
    expect(notes[1]).toContain("were not found in the draft");
    expect(out.items[0]).toMatchObject({ pass: true, evidence: real });
    vi.mocked(structured).mockImplementation(async (opts: { user: string }) => { fake.prompts.push(opts.user); return structuredClone(fake.output) as never; });
  });

  it("applyFix: the model's one-section edit is merged, every other section kept", async () => {
    const target = hs.content!.sections.at(-1)!;
    fake.output = { heading: target.heading, body: `${target.body} Assembly point: the north lawn.` };
    const out = await applyFix(hs.content!, "Name the assembly point.");
    expect(out.documentType).toBe(hs.content!.documentType);
    expect(out.sections).toHaveLength(hs.content!.sections.length);
    expect(out.sections.at(-1)!.body).toContain("north lawn");
    expect(out.sections.slice(0, -1)).toEqual(hs.content!.sections.slice(0, -1));
  });

  it("classify: invented citations dropped, unsourced fee removed", async () => {
    fake.output = { category: "community", reasoning: "A club event. The fee is $207. Hire is $900.", howToPresent: null,
      citedChunkIds: ["c1", "made-up"] } satisfies Classification;
    const out = await classify(profile());
    expect(out.citedChunkIds).toEqual(["c1"]);
    expect(out.reasoning).toContain("$207");
    expect(out.reasoning).not.toContain("$900");
  });
});
