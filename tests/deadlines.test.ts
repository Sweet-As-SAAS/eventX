import { describe, it, expect } from "vitest";
import fixture from "../fixtures/demo-event.json";
import { computeDeadlines, workingDaysBefore, isWorkingDay, nzToday } from "../lib/deadlines";
import { Requirement } from "../lib/schemas";

describe("deadline engine", () => {
  it("special licence for Sun 14 Mar 2027 is Mon 15 Feb", () => {
    expect(workingDaysBefore("2027-03-14", 20, { liquor: true })).toBe("2027-02-15");
  });

  it("liquor holiday period is skipped", () => {
    expect(isWorkingDay("2027-01-12", { liquor: true })).toBe(false);
    expect(isWorkingDay("2027-01-12")).toBe(true);
    expect(workingDaysBefore("2027-01-25", 20, { liquor: true }) < "2026-12-20").toBe(true);
  });

  it("Mondayised Waitangi Day is not a working day", () => {
    expect(isWorkingDay("2027-02-08")).toBe(false);
  });

  it("excludes the observed Christmas and Boxing Day holidays in 2027", () => {
    expect(isWorkingDay("2027-12-27")).toBe(false);
    expect(isWorkingDay("2027-12-28")).toBe(false);
  });

  it("fixture deadlines match the engine", () => {
    expect(computeDeadlines(fixture.profile.date.value, fixture.requirements.map((r) => Requirement.parse(r)))).toEqual(fixture.deadlines);
  });

  it("does not show CCC permit timing or unverified traffic timing for Waimakariri", () => {
    const reqs = fixture.requirements.map((r) => Requirement.parse(r));
    const traffic = Requirement.parse({ documentType: "traffic_management_plan", reason: "Road impact", ruleId: "waimakariri-traffic",
      sourceUrl: "https://www.waimakariri.govt.nz/", lastChecked: "2026-09-26" });
    const deadlines = computeDeadlines(fixture.profile.date.value, [...reqs, traffic], "waimakariri");
    expect(deadlines.map((d) => d.documentType)).toEqual(["special_licence_application"]);
    expect(deadlines[0].sourceUrl).toContain("waimakariri.govt.nz");
  });

  it("nzToday is the NZ date, not the UTC date", () => {
    // 10:00 UTC on 26 Sep 2026 is already 22:00 the same day in NZ (NZST, +12)...
    expect(nzToday(new Date("2026-09-26T10:00:00Z"))).toBe("2026-09-26");
    // ...and 13:00 UTC is 1am on the 27th, just before daylight saving starts at 2am.
    expect(nzToday(new Date("2026-09-26T13:00:00Z"))).toBe("2026-09-27");
  });
});
