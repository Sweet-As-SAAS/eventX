// AI modules with OpenAI mocked out: no network, no key. `structured` is the one place that calls the model.
import { beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../fixtures/demo-event.json";
import recorded from "./fixtures/ai-live.json";
import { DRAFTED_TYPES, DraftDocument, EventProfile } from "../lib/schemas";

vi.mock("../lib/ai/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/ai/client")>()),
  structured: vi.fn(),
  embed: vi.fn(async () => { throw new Error("embed must not be called in tests"); }),
  openai: vi.fn(() => { throw new Error("OpenAI must not be called in tests"); }),
}));
vi.mock("../lib/ai/retrieve", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/ai/retrieve")>()),
  retrieve: vi.fn(async () => [{ id: "chunk-1", heading: "Council guidance", content: "Plan for hazards.", url: "https://ccc.govt.nz/" }]),
}));

const { structured } = await import("../lib/ai/client");
const { buildProfile, missingPaths } = await import("../lib/ai/profile");
const { draftDocument } = await import("../lib/ai/draft");
const mocked = vi.mocked(structured);

beforeEach(() => { mocked.mockReset(); }); // braces: a returned function would run as a cleanup hook

describe("profile parsing (mocked model)", () => {
  it("parses the model output, forces the council, fixes the year and recomputes missing paths", async () => {
    const modelOutput = structuredClone(fixture.profile) as any;
    modelOutput.date = { value: "2026-03-14", source: "stated" }; // model picked a past year
    modelOutput.missing = ["generators.value"]; // and a malformed path
    mocked.mockResolvedValueOnce(EventProfile.parse(modelOutput));

    const profile = await buildProfile(fixture.description, "ccc", "2026-09-26");

    expect(mocked).toHaveBeenCalledTimes(1);
    expect(mocked.mock.calls[0][0].user).toContain(fixture.description);
    expect(mocked.mock.calls[0][0].schema).toBe(EventProfile);
    expect(profile.councilSlug).toBe("ccc");
    expect(profile.date).toEqual({ value: "2027-03-14", source: "stated" });
    expect(profile.missing).toEqual(missingPaths(profile));
    expect(EventProfile.safeParse(profile).success).toBe(true);
  });

  it("parses every recorded live profile the same way", async () => {
    for (const recordedProfile of recorded.profiles) {
      mocked.mockResolvedValueOnce(EventProfile.parse(recordedProfile));
      const profile = await buildProfile(fixture.description, "ccc", "2026-09-26");
      expect(profile.missing).toEqual(missingPaths(profile));
    }
  });

  it("surfaces a model failure instead of inventing a profile", async () => {
    mocked.mockRejectedValueOnce(new Error("AI refused event_profile"));
    await expect(buildProfile(fixture.description, "ccc", "2026-09-26")).rejects.toThrow("refused");
  });
});

describe("parallel drafting (mocked model, 200 ms per call)", () => {
  it("drafts every document in about the time of one", async () => {
    const DELAY = 200;
    mocked.mockImplementation(async (request: { user: string }) => {
      await new Promise((r) => setTimeout(r, DELAY));
      const type = /Document type: (\w+)/.exec(request.user)?.[1] ?? "health_safety_plan";
      return DraftDocument.parse({ documentType: type, title: "Draft", placeholders: [], citedChunkIds: ["chunk-1"],
        sections: [{ heading: "Hazards", body: "Hazards are reviewed before the event." }] });
    });
    const profile = EventProfile.parse(fixture.profile);
    const types = [...DRAFTED_TYPES];
    const template = { sections: ["Hazards"], checklist: [{ id: "h-1", text: "Hazards listed" }] };

    const started = performance.now();
    const drafts = await Promise.all(types.map((t) => draftDocument(profile, t, template)));
    const elapsed = performance.now() - started;

    // Each draft is two sequential model calls (draft, then review), so one draft takes about 2 × DELAY.
    expect(mocked).toHaveBeenCalledTimes(types.length * 2);
    expect(drafts.map((d) => d.documentType)).toEqual(types);
    expect(elapsed).toBeLessThan(2 * DELAY * 2); // serial would be types.length × 2 × DELAY = 2400 ms
  });
});
