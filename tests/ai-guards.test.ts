// Deterministic guards on AI output (lib/ai/guards.ts), the follow-up question bank and the DEMO_MODE fallback.
// No OpenAI calls: every "model output" here is hand-written, including deliberately bad ones.
import { describe, it, expect, vi, afterEach } from "vitest";
import fixture from "../fixtures/demo-event.json";
import { EventProfile, EventDocument, type CheckResult, type Classification, type DraftDocument } from "../lib/schemas";
import {
  profileFields, normalizeProfile, extractPlaceholders, normalizeDraft, mergeFix, normalizeCheck, quoteInDraft,
  normalizeClassification, defaultFix, UNCLEAR, FEES_VARY, itemApplies, splitChecklist, namesSpecificDay,
} from "../lib/ai/guards";
import { QUESTIONS, followUps, applyAnswers, rangeNotes } from "../lib/ai/profile";
import { isSeeded, withDemoFallback } from "../lib/ai/demo";
import { conditionPaths, staticRules } from "../lib/rules";

const TODAY = "2026-09-26";
const baseProfile = () => EventProfile.parse(structuredClone(fixture.profile));
const ctx = { council: "ccc" as const, today: TODAY, description: fixture.description };
const docs = [...fixture.documents, fixture.fixedDocument].map((d) => EventDocument.parse(d)).filter((d) => d.content);
const checklistOf = (d: EventDocument) => d.checkResults!.items.map((i) => ({ id: i.itemId, text: i.text }));

describe("normalizeProfile", () => {
  it("recomputes missing as exactly the unknown fields, in schema order", () => {
    const p = baseProfile();
    p.peakAttendance = { value: null, source: "stated" };
    p.missing = ["name", "not.a.field", "structures.largestMarqueeSqm"];
    const out = normalizeProfile(p, ctx);
    expect(out.missing).toEqual(profileFields(out).filter((f) => f.field.value == null).map((f) => f.path));
    expect(out.missing).toContain("peakAttendance");
    expect(out.missing).not.toContain("not.a.field");
    expect(out.missing).not.toContain("name");
    expect(out.peakAttendance).toEqual({ value: null, source: null });
  });

  it("never lets the model claim 'answered', and tags untagged known values as inferred", () => {
    const p = baseProfile();
    p.generators = { value: true, source: "answered" };
    p.vehicleAccess = { value: false, source: null };
    const out = normalizeProfile(p, ctx);
    expect(out.generators.source).toBe("inferred");
    expect(out.vehicleAccess).toEqual({ value: false, source: "inferred" });
  });

  it("drops malformed dates, times and negative counts to unknown", () => {
    const p = baseProfile();
    p.date = { value: "14/03/2027", source: "stated" };
    p.startTime = { value: "12pm", source: "stated" };
    p.endTime = { value: "25:00", source: "stated" };
    p.peakAttendance = { value: -5, source: "stated" };
    const out = normalizeProfile(p, ctx);
    expect([out.date.value, out.startTime.value, out.endTime.value, out.peakAttendance.value]).toEqual([null, null, null, null]);
    expect(out.missing).toEqual(expect.arrayContaining(["date", "startTime", "endTime", "peakAttendance"]));
  });

  it("keeps a date only when the description names an actual day, never a guess from 'next month'", () => {
    const p = { ...baseProfile(), date: { value: "2026-10-01", source: "inferred" as const } };
    expect(normalizeProfile(p, { ...ctx, description: "A market in a park sometime next month with some stalls." }).date.value).toBeNull();
    expect(normalizeProfile(p, { ...ctx, description: "A market in March." }).date.value).toBeNull();
    for (const said of ["Saturday 13 February", "on 1 October", "October 1st", "this Sunday", "on 1/10", "New Year's Day"])
      expect(namesSpecificDay(`Market ${said}, 10am.`), said).toBe(true);
  });

  it("rejects impossible calendar dates", () => {
    const p = baseProfile();
    p.date = { value: "2027-02-30", source: "stated" };
    expect(normalizeProfile(p, ctx).date.value).toBeNull();
  });

  it("rolls a past date forward a year only when the description never gives a year", () => {
    const p = baseProfile();
    p.date = { value: "2026-03-14", source: "stated" };
    expect(normalizeProfile(p, ctx).date.value).toBe("2027-03-14");
    expect(normalizeProfile(p, { ...ctx, description: "Our 2026 fair on 14 March" }).date.value).toBe("2026-03-14");
    const future = baseProfile();
    expect(normalizeProfile(future, ctx).date.value).toBe(fixture.profile.date.value);
  });

  it("forces the council the event was created for", () => {
    const p = { ...baseProfile(), councilSlug: "waimakariri" as const };
    expect(normalizeProfile(p, ctx).councilSlug).toBe("ccc");
  });
});

describe("follow-up question bank", () => {
  const fieldPaths = new Set(profileFields(baseProfile()).map((f) => f.path));
  const cccReads = new Set(staticRules.filter((r) => r.verified && r.council === "ccc").flatMap((r) => conditionPaths(r.condition)));

  it("every question is about a real profile field", () => {
    for (const path of Object.keys(QUESTIONS)) expect(fieldPaths, path).toContain(path);
  });

  it("every field a verified CCC rule reads has a question", () => {
    for (const path of cccReads) expect(QUESTIONS, path).toHaveProperty([path]);
  });

  it("every option of every question applies cleanly and settles the field", () => {
    for (const [path, q] of Object.entries(QUESTIONS)) {
      for (const answer of q.options) {
        const p = { ...baseProfile(), missing: [path] };
        const out = applyAnswers(p, [{ path, answer }]);
        expect(out.missing).not.toContain(path);
        const field = profileFields(out).find((f) => f.path === path)!.field;
        expect(field.source).toBe("answered");
        if (answer === "Not sure") expect(field.value).toBeNull();
        else expect(field.value).not.toBeNull();
      }
    }
  });

  it("asks at most 3, in priority order, never twice", () => {
    const p = { ...baseProfile(), missing: ["food.stalls", "structures.inflatables", "food.stalls", "openToPublic", "venue.councilLand"] };
    expect(followUps(p, staticRules).map((q) => q.path)).toEqual(["openToPublic", "venue.councilLand", "structures.inflatables"]);
  });

  it("never asks about a field no verified rule for this council reads", () => {
    const p = { ...baseProfile(), missing: ["food.cookingOnSite", "childrenAttending"] };
    expect(followUps(p, staticRules)).toEqual([]);
  });

  it("food.stalls answers land on the right side of the > 0 rule", () => {
    const yes = applyAnswers({ ...baseProfile(), missing: ["food.stalls"] }, [{ path: "food.stalls", answer: "Yes" }]);
    const no = applyAnswers({ ...baseProfile(), missing: ["food.stalls"] }, [{ path: "food.stalls", answer: "No" }]);
    expect([yes.food.stalls.value, no.food.stalls.value]).toEqual([1, 0]);
  });
});

describe("drafts", () => {
  it("placeholders are read from the text, and agree with every fixture draft", () => {
    for (const d of docs) expect(new Set(extractPlaceholders(d.content!)), d.id).toEqual(new Set(d.content!.placeholders));
  });

  it("citation markers and lowercase brackets are not placeholders", () => {
    const doc: DraftDocument = { documentType: "hazard_register", title: "T", placeholders: [], citedChunkIds: [],
      sections: [{ heading: "H", body: "Per [chunk 12] and [see below], contact [NAME] or [NAME]." }] };
    expect(extractPlaceholders(doc)).toEqual(["[NAME]"]);
  });

  it("normalizeDraft forces the type, restores missing template sections and drops invented citations", () => {
    const raw: DraftDocument = {
      documentType: "hazard_register", title: "Plan",
      sections: [{ heading: "Event overview", body: "A fair for [EVENT NAME]." }, { heading: "Emergency response plan", body: "Exits." }],
      placeholders: ["[SOMETHING NOT IN THE TEXT]"],
      citedChunkIds: ["c1", "invented", "c1"],
    };
    const out = normalizeDraft(raw, { type: "health_safety_plan", sections: ["Event overview", "Emergency response", "Roles and contacts"], chunkIds: ["c1", "c2"] });
    expect(out.documentType).toBe("health_safety_plan");
    expect(out.sections.map((s) => s.heading)).toEqual(["Event overview", "Emergency response plan", "Roles and contacts"]);
    expect(out.sections[2].body).toBe("[TO COMPLETE: Roles and contacts]");
    expect(out.placeholders).toEqual(["[EVENT NAME]", "[TO COMPLETE: Roles and contacts]"]);
    expect(out.citedChunkIds).toEqual(["c1"]);
  });

  it("mergeFix reproduces the fixture's fixed document from its red original", () => {
    const before = EventDocument.parse(fixture.documents.find((d) => d.id === fixture.fixedDocument.id)).content!;
    const after = EventDocument.parse(fixture.fixedDocument).content!;
    const changed = after.sections.find((s, i) => s.body !== before.sections[i].body)!;
    expect(mergeFix(before, changed, "unused")).toEqual(after);
  });

  it("mergeFix replaces one section and leaves every other section, the type, title and citations alone", () => {
    const before = docs[0].content!;
    const out = mergeFix(before, { heading: before.sections[1].heading.toUpperCase(), body: "Rewritten with [NEW DETAIL]." }, "unused");
    expect(out.sections.map((s) => s.heading)).toEqual(before.sections.map((s) => s.heading));
    expect(out.sections[1].body).toBe("Rewritten with [NEW DETAIL].");
    expect(out.sections.filter((_, i) => i !== 1)).toEqual(before.sections.filter((_, i) => i !== 1));
    expect(out).toMatchObject({ documentType: before.documentType, title: before.title, citedChunkIds: before.citedChunkIds });
    expect(out.placeholders).toContain("[NEW DETAIL]");
  });

  it("mergeFix adds a new section when no heading fits", () => {
    const before = docs[0].content!;
    const out = mergeFix(before, { heading: "Distribution", body: "Copies go to every owner." }, "unused");
    expect(out.sections.at(-1)).toEqual({ heading: "Distribution", body: "Copies go to every owner." });
    expect(out.sections).toHaveLength(before.sections.length + 1);
  });

  it("mergeFix never pastes our default fix instruction into the document", () => {
    const before = docs[0].content!;
    const noop = { heading: before.sections[0].heading, body: before.sections[0].body };
    expect(mergeFix(before, noop, defaultFix("Attaches food and drinks menus"))).toEqual(before);
    const echoed = { heading: before.sections[0].heading, body: `${before.sections[0].body}\nAdd a sentence that covers: Attaches menus.\nAttach: menus.` };
    expect(mergeFix(before, echoed, "x").sections[0].body).toBe(`${before.sections[0].body}\nAttach: menus.`);
  });

  it("mergeFix never leaves the draft unchanged: a no-op edit appends the suggested fix", () => {
    const before = docs[0].content!;
    const noop = { heading: before.sections[0].heading, body: before.sections[0].body };
    const out = mergeFix(before, noop, "The register is given to every owner.");
    expect(out.sections.at(-1)!.body.endsWith("The register is given to every owner.")).toBe(true);
    expect(out.sections).toHaveLength(before.sections.length);
  });
});

describe("normalizeCheck", () => {
  it("leaves every honest fixture check result unchanged", () => {
    for (const d of docs) expect(normalizeCheck(d.checkResults!, checklistOf(d), d.content!), d.id).toEqual(d.checkResults);
  });

  const red = EventDocument.parse(fixture.documents.find((d) => d.id === fixture.fixedDocument.id));
  const redDoc = red.content!;
  const redList = checklistOf(red);
  const allPass = (evidence: Record<string, string>): CheckResult => ({
    items: redList.map((c) => ({ itemId: c.id, text: c.text, pass: true, evidence: evidence[c.id] ?? "", suggestedFix: null })),
  });

  it("fails a pass whose evidence is not in the draft (hallucinated quote) and still offers a fix", () => {
    const invented = Object.fromEntries(redList.map((c) => [c.id, "Twelve licensed security guards patrol the site."]));
    const out = normalizeCheck(allPass(invented), redList, redDoc);
    expect(out.items.every((i) => !i.pass && i.evidence === "" && i.suggestedFix)).toBe(true);
  });

  // Hand-made plan, independent of the demo fixture.
  const plan = (body: string): DraftDocument => ({ documentType: "health_safety_plan", title: "Plan", placeholders: [], citedChunkIds: [],
    sections: [{ heading: "Emergency plan", body }] });
  const item = [{ id: "assembly", text: "Emergency assembly point named" }];
  const passWith = (evidence: string): CheckResult => ({ items: [{ itemId: "assembly", text: "x", pass: true, evidence, suggestedFix: null }] });

  it("fails a pass whose evidence is only a placeholder, then passes once the fix fills it in", () => {
    const before = plan("Marshals direct people to [ASSEMBLY POINT].");
    expect(normalizeCheck(passWith("[ASSEMBLY POINT]"), item, before).items[0]).toMatchObject({ pass: false, evidence: "" });
    const after = plan("Marshals direct people to the assembly point on the open lawn by the main gate.");
    const evidence = "the assembly point on the open lawn by the main gate";
    expect(normalizeCheck(passWith(evidence), item, after).items[0]).toMatchObject({ pass: true, evidence, suggestedFix: null });
  });

  it("a real sentence that still holds a placeholder can pass: roles are documented, names stay open", () => {
    const doc = plan("Duty manager [DUTY MANAGER NAME] leads the evacuation to the north lawn.");
    const line = "Duty manager [DUTY MANAGER NAME] leads the evacuation to the north lawn.";
    expect(normalizeCheck(passWith(line), item, doc).items[0]).toMatchObject({ pass: true, evidence: line });
  });

  it("one result per checklist item: missing items fail with a default fix, extras dropped, checklist text wins", () => {
    const raw: CheckResult = { items: [
      { itemId: "extra", text: "Invented item", pass: true, evidence: "", suggestedFix: null },
      { itemId: redList[1].id, text: "Reworded by the model", pass: false, evidence: "", suggestedFix: null },
    ] };
    const out = normalizeCheck(raw, redList, redDoc);
    expect(out.items.map((i) => i.itemId)).toEqual(redList.map((c) => c.id));
    expect(out.items.map((i) => i.text)).toEqual(redList.map((c) => c.text));
    expect(out.items[0].suggestedFix).toBe(defaultFix(redList[0].text));
    expect(out.items[1].suggestedFix).toBe(defaultFix(redList[1].text));
  });

  it("keeps the model's own fix when it gave one", () => {
    const raw: CheckResult = { items: [{ itemId: redList[0].id, text: "", pass: false, evidence: "x", suggestedFix: "  Say when it starts.  " }] };
    expect(normalizeCheck(raw, redList.slice(0, 1), redDoc).items[0]).toMatchObject({ evidence: "", suggestedFix: "Say when it starts." });
  });

  it("quote matching tolerates case, whitespace, curly quotes and ellipses, but not paraphrase", () => {
    const doc: DraftDocument = { documentType: "hazard_register", title: "T", placeholders: [], citedChunkIds: [],
      sections: [{ heading: "Crowd", body: "Marshals stand at both   entrances. The club's first aid tent is by the gate." }] };
    expect(quoteInDraft("marshals stand at both entrances", doc)).toBe(true);
    expect(quoteInDraft("“The club’s first aid tent”", doc)).toBe(true);
    expect(quoteInDraft("Marshals stand ... by the gate", doc)).toBe(true);
    expect(quoteInDraft("Marshals stand at both entrances.\nThe club's first aid tent is by the gate.", doc)).toBe(true);
    expect(quoteInDraft("Marshals stand at both entrances.\nSecurity patrols the car park.", doc)).toBe(false);
    const list: DraftDocument = { ...doc, sections: [{ heading: "Documents attached", body: "Attach: Site plan of the licensed area, Alcohol Management Plan, food and drinks menus." }] };
    expect(quoteInDraft("Attach: Alcohol Management Plan", list)).toBe(true);
    expect(quoteInDraft("Attach: food and drinks menus.", list)).toBe(true);
    expect(quoteInDraft("Attach: host responsibility policy", list)).toBe(false);
    expect(quoteInDraft("Attach, plan", list)).toBe(false);
    expect(quoteInDraft("Marshals are posted at both entrances", doc)).toBe(false);
    expect(quoteInDraft("", doc)).toBe(false);
  });
});

describe("normalizeClassification", () => {
  const verdict: Classification = { category: "community", reasoning: "r", howToPresent: "h", citedChunkIds: ["c1", "made-up"] };

  const chunk = (id: string, content = "") => ({ id, content });

  it("keeps only chunks we sent", () => {
    expect(normalizeClassification(verdict, [chunk("c1"), chunk("c2")]).citedChunkIds).toEqual(["c1"]);
  });

  it("a verdict with no real citation becomes unclear", () => {
    expect(normalizeClassification(verdict, [chunk("c9")])).toEqual(UNCLEAR);
    expect(normalizeClassification({ ...verdict, category: "commercial", citedChunkIds: [] }, [chunk("c1")])).toEqual(UNCLEAR);
  });

  it("an honest unclear is left alone", () => {
    const unclear: Classification = { category: "unclear", reasoning: "Not settled.", howToPresent: null, citedChunkIds: [] };
    expect(normalizeClassification(unclear, [chunk("c1")])).toEqual(unclear);
  });

  it("chunk ids never reach the text a volunteer reads, and ordinary words survive", () => {
    const out = normalizeClassification({ ...verdict,
      reasoning: "It fits the 300 to 1000 band, as per chunk 2db13665-9560-4a2d. It is a fundraiser [chunk c1]. A chunk of the park is fenced." }, [chunk("c1")]);
    expect(out.reasoning).toBe("It fits the 300 to 1000 band. It is a fundraiser. A chunk of the park is fenced.");
  });

  it("states a fee only if a cited chunk states it; otherwise drops the sentence and says fees vary", () => {
    const withFees: Classification = {
      category: "community", citedChunkIds: ["c1"],
      reasoning: "Run by a club for its members. The special licence fee is $207. Park hire is $1,500 a day.",
      howToPresent: "Say proceeds go to the club. Expect to pay $99.",
    };
    const out = normalizeClassification(withFees, [chunk("c1", "Medium events: fee $207.00"), chunk("c2", "Park hire $1,500")]);
    expect(out.reasoning).toBe(`Run by a club for its members. The special licence fee is $207. ${FEES_VARY}`);
    expect(out.howToPresent).toBe("Say proceeds go to the club.");
  });
});

describe("checklist applicability by crowd size (CCC wording)", () => {
  it.each([
    ["For events of about 1000 attendees or more: estimates the types and amounts of waste", 999, false],
    ["For events of about 1000 attendees or more: estimates the types and amounts of waste", 1000, true],
    ["Attaches an Alcohol Management Plan if more than 150 guests are expected", 150, false],
    ["Attaches an Alcohol Management Plan if more than 150 guests are expected", 151, true],
    ["Details certified security (guideline: over 100 patrons)", 100, false],
    ["Details certified security (guideline: over 100 patrons)", 101, true],
    ["Explains how waste will be managed at the event", 10, true],
    ["For events of about 1000 attendees or more: names who collects the waste", null, true],
  ])("%s at %s people: %s", (text, peak, applies) => {
    expect(itemApplies(text, peak)).toBe(applies);
  });

  it("splitChecklist uses the profile's peak attendance, and keeps everything when it is unknown", () => {
    const items = [{ id: "a", text: "Explains how waste is managed" }, { id: "b", text: "For events of about 1000 attendees or more: lists equipment" }];
    const small = { ...baseProfile(), peakAttendance: { value: 400, source: "stated" as const } };
    expect(splitChecklist(items, small)).toEqual({ applicable: [items[0]], notApplicable: [items[1]] });
    expect(splitChecklist(items, { ...small, peakAttendance: { value: null, source: null } }).applicable).toEqual(items);
    expect(splitChecklist(items, null).applicable).toEqual(items);
  });
});

describe("registers and range answers", () => {
  it("chunk ids never stay in document text, and register line breaks survive", () => {
    const raw: DraftDocument = { documentType: "hazard_register", title: "Hazard register", placeholders: [], citedChunkIds: ["c1"],
      sections: [{ heading: "Bar", body: "Hazards: intoxication. [chunk 44fd807e-e151-4db5]\nControls: ID checks (as per chunk c1).\nOwner: [NAME]" }] };
    const out = normalizeDraft(raw, { type: "hazard_register", sections: [], chunkIds: ["c1"] });
    expect(out.sections[0].body).toBe("Hazards: intoxication.\nControls: ID checks.\nOwner: [NAME]");
    expect(out.citedChunkIds).toEqual(["c1"]);
    const fixed = mergeFix(out, { heading: "Bar", body: "Hazards: intoxication.\nControls: ID checks and free water [chunk 9f2a].\nOwner: [NAME]" }, "unused");
    expect(fixed.sections[0].body).toBe("Hazards: intoxication.\nControls: ID checks and free water.\nOwner: [NAME]");
  });

  it("a register keeps its rows: template columns are not added as sections", () => {
    const raw: DraftDocument = { documentType: "hazard_register", title: "Hazard register", placeholders: [], citedChunkIds: [],
      sections: [{ heading: "Bouncy castle", body: "Hazards: falls.\nControls: supervised.\nOwner: [NAME]" }] };
    const out = normalizeDraft(raw, { type: "hazard_register", sections: ["Activity", "Hazards", "Controls", "Owner"], chunkIds: [] });
    expect(out.sections.map((s) => s.heading)).toEqual(["Bouncy castle"]);
  });

  it("rangeNotes explains every numeric band answer, and nothing the organiser stated", () => {
    const answered = applyAnswers({ ...baseProfile(), missing: ["peakAttendance"] }, [{ path: "peakAttendance", answer: "151 to 400" }]);
    const notes = rangeNotes(answered);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('"151 to 400"');
    expect(rangeNotes(baseProfile()).some((n) => n.startsWith("peakAttendance"))).toBe(false);
  });

  it("peakAttendance bands land on the right side of every CCC size threshold", () => {
    const value = (answer: string) =>
      applyAnswers({ ...baseProfile(), missing: ["peakAttendance"] }, [{ path: "peakAttendance", answer }]).peakAttendance.value!;
    expect(value("101 to 150")).toBeLessThanOrEqual(150); // no alcohol management plan
    expect(value("151 to 400")).toBeGreaterThan(150);
    expect(value("401 to 1,000")).toBeLessThan(1000); // no large-event waste detail
    expect(value("Over 1,000")).toBeGreaterThanOrEqual(1000);
  });
});

describe("DEMO_MODE fallback", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("recognises the seeded event despite whitespace changes, and nothing else", () => {
    const messy = `  ${fixture.description.replaceAll(" ", "  ").replace(". ", ".\r\n")}\n`;
    expect(isSeeded({ council: "ccc", description: messy })).toBe(true);
    expect(isSeeded({ council: "waimakariri", description: fixture.description })).toBe(false);
    expect(isSeeded({ council: "ccc", description: fixture.description + " Also a raffle." })).toBe(false);
  });

  it("serves the cached answer on failure or timeout only when DEMO_MODE=1 and a cache exists", async () => {
    const fail = () => Promise.reject(new Error("network down"));
    const hang = () => new Promise<string>(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.stubEnv("DEMO_MODE", "1");
    await expect(withDemoFallback(fail, "cached")).resolves.toBe("cached");
    await expect(withDemoFallback(hang, "cached", 20)).resolves.toBe("cached");
    await expect(withDemoFallback(fail, null)).rejects.toThrow("network down");
    await expect(withDemoFallback(() => Promise.resolve("live"), "cached")).resolves.toBe("live");

    vi.stubEnv("DEMO_MODE", "0");
    await expect(withDemoFallback(fail, "cached")).rejects.toThrow("network down");
  });
});
