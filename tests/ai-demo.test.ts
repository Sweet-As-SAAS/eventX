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
    expect(isSeeded({ description: fixture.description, council: "another-council" })).toBe(false);
  });

  it("uses cached data promptly when the live call fails or times out", async () => {
    process.env.DEMO_MODE = "1";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(withDemoFallback(async () => { throw new Error("offline"); }, "cached")).resolves.toBe("cached");
    await expect(withDemoFallback(() => new Promise<string>(() => {}), "cached", 10)).resolves.toBe("cached");
  });

  it("falls back at exactly 20 s by default for the seeded event, and never for any other event", async () => {
    process.env.DEMO_MODE = "1";
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const slowLive = () => new Promise<string>((resolve) => setTimeout(() => resolve("live"), 60_000));
      const seeded = isSeeded({ description: fixture.description, council: fixture.profile.councilSlug });
      const other = isSeeded({ description: "A different event entirely", council: fixture.profile.councilSlug });

      let seededResult: string | undefined;
      void withDemoFallback(slowLive, seeded ? "cached" : null).then((v) => (seededResult = v));
      let otherResult: string | undefined;
      void withDemoFallback(slowLive, other ? "cached" : null).then((v) => (otherResult = v));

      await vi.advanceTimersByTimeAsync(19_999);
      expect(seededResult).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      expect(seededResult).toBe("cached");
      expect(otherResult).toBeUndefined(); // still waiting on the live call
      await vi.advanceTimersByTimeAsync(40_000);
      expect(otherResult).toBe("live");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not substitute demo data for another event", async () => {
    process.env.DEMO_MODE = "1";
    await expect(withDemoFallback(async () => { throw new Error("offline"); }, null)).rejects.toThrow("offline");
  });
});
