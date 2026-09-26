import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "../fixtures/demo-event.json";
import { isSeeded, withDemoFallback } from "../lib/ai/demo";

const originalMode = process.env.DEMO_MODE;
afterEach(() => {
  if (originalMode === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = originalMode;
  vi.restoreAllMocks();
});

describe("demo fallback", () => {
  it("matches only the exact seeded description and council", () => {
    expect(isSeeded({ description: fixture.description, council: fixture.profile.councilSlug })).toBe(true);
    expect(isSeeded({ description: `${fixture.description} Extra detail`, council: fixture.profile.councilSlug })).toBe(false);
    expect(isSeeded({ description: fixture.description, council: "waimakariri" })).toBe(false);
  });

  it("uses cached data promptly when the live call fails or times out", async () => {
    process.env.DEMO_MODE = "1";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(withDemoFallback(async () => { throw new Error("offline"); }, "cached")).resolves.toBe("cached");
    await expect(withDemoFallback(() => new Promise<string>(() => {}), "cached", 10)).resolves.toBe("cached");
  });

  it("does not substitute demo data for another event", async () => {
    process.env.DEMO_MODE = "1";
    await expect(withDemoFallback(async () => { throw new Error("offline"); }, null)).rejects.toThrow("offline");
  });
});
