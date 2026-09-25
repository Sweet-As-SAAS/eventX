import { describe, it, expect } from "vitest";
import { nzLocalToUtc } from "../lib/integrations/eventbrite";

describe("NZ time to UTC", () => {
  it("handles NZDT (+13) in March", () => {
    expect(nzLocalToUtc("2027-03-14", "12:00")).toBe("2027-03-13T23:00:00Z");
  });
  it("handles NZST (+12) in June", () => {
    expect(nzLocalToUtc("2027-06-14", "12:00")).toBe("2027-06-14T00:00:00Z");
  });
  it("handles the day daylight saving starts (27 Sep 2026, 2am jumps to 3am)", () => {
    expect(nzLocalToUtc("2026-09-27", "01:00")).toBe("2026-09-26T13:00:00Z");
    expect(nzLocalToUtc("2026-09-27", "10:00")).toBe("2026-09-26T21:00:00Z");
  });
});
