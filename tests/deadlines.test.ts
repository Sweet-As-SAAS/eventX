import { describe, it, expect } from "vitest";
import fixture from "../fixtures/demo-event.json";
import {
  addDays, computeDeadlines, workingDaysBefore, isWorkingDay, inLiquorHolidayPeriod, nzToday, type TrafficImpact,
} from "../lib/deadlines";
import { Requirement, type Deadline } from "../lib/schemas";

// TODO(audit): backend may drop computeDeadlines' council param, moving trafficImpact to 3rd. This works with either
// signature (an impact in the council slot yields no traffic deadline); simplify to one call after the merge.
const withImpact = (date: string, reqs: Requirement[], impact: TrafficImpact): Deadline[] => {
  const call = computeDeadlines as (...args: unknown[]) => Deadline[];
  const first = call(date, reqs, impact);
  return first.length ? first : call(date, reqs, "ccc", impact);
};
const fixtureDeadlines = () => computeDeadlines(fixture.profile.date.value, fixture.requirements.map((r) => Requirement.parse(r)));

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

  it("uses the permit form for the licence date, and gives its alcohol plan the same date", () => {
    const deadlines = computeDeadlines(fixture.profile.date.value, fixture.requirements.map((r) => Requirement.parse(r)));
    const licence = deadlines.find((d) => d.documentType === "special_licence_application")!;
    const alcoholPlan = deadlines.find((d) => d.documentType === "alcohol_management_plan")!;
    expect(licence.sourceUrl).toBe("https://ccc.tfaforms.net/177");
    expect([alcoholPlan.legalMinimum, alcoholPlan.recommended]).toEqual([licence.legalMinimum, licence.recommended]);
    expect(deadlines.filter((d) => ["site_plan", "health_safety_plan"].includes(d.documentType))
      .map((d) => d.legalMinimum)).toEqual(["2027-01-31", "2027-01-31"]);
  });

  it("uses 30, 60 or 120 calendar days for an assessed CCC road-closure tier", () => {
    const traffic = Requirement.parse({ documentType: "traffic_management_plan", reason: "Road impact", ruleId: "ccc-traffic",
      sourceUrl: "https://ccc.govt.nz/", lastChecked: "2026-09-26" });
    for (const [impact, days] of [["small", 30], ["medium", 60], ["large", 120]] as const) {
      const [deadline] = withImpact("2027-07-01", [traffic], impact);
      expect(deadline.legalMinimum).toBe(addDays("2027-07-01", -days));
      expect(deadline.recommended).toBe(addDays("2027-07-01", -Math.max(days, 84)));
      expect(deadline.sourceUrl).toContain("Road-closure-for-events-3-tier.pdf");
    }
    const [unknown] = computeDeadlines("2027-07-01", [traffic]);
    expect(unknown.legalMinimum).toBeNull();
    expect(unknown.recommended).toBe(addDays("2027-07-01", -120));
  });

  it("Sarah's special licence: legal minimum Mon 15 Feb 2027, recommended Fri 29 Jan 2027", () => {
    const licence = fixtureDeadlines().find((d) => d.documentType === "special_licence_application")!;
    expect(licence.legalMinimum).toBe("2027-02-15");
    expect(licence.recommended).toBe("2027-01-29");
    // Ten working days back from 15 Feb skips the weekends and Mondayised Waitangi Day (8 Feb), landing on the 29th.
    expect(workingDaysBefore("2027-02-15", 10, { liquor: true })).toBe("2027-01-29");
    expect(isWorkingDay("2027-02-08")).toBe(false); // Waitangi Day (Sat 6 Feb) is observed on Mon 8 Feb
  });

  it("20 Dec to 15 Jan is not counted for liquor, but is for other documents", () => {
    for (const d of ["2026-12-20", "2026-12-24", "2027-01-05", "2027-01-15"]) {
      expect(inLiquorHolidayPeriod(d)).toBe(true);
      expect(isWorkingDay(d, { liquor: true })).toBe(false);
    }
    expect(inLiquorHolidayPeriod("2026-12-19")).toBe(false);
    expect(inLiquorHolidayPeriod("2027-01-16")).toBe(false);
    expect(isWorkingDay("2026-12-21")).toBe(true);
    // Twenty liquor working days before 1 Feb 2027: ten in late January, then the period is skipped, ten in December.
    expect(workingDaysBefore("2027-02-01", 20, { liquor: true })).toBe("2026-12-07");
    expect(workingDaysBefore("2027-02-01", 20)).toBe("2026-12-31"); // period counts when liquor is off; 1 and 4 Jan are holidays
  });

  it("weekends and Canterbury holidays are not working days", () => {
    expect(isWorkingDay("2027-03-13")).toBe(false); // Saturday
    expect(isWorkingDay("2027-03-14")).toBe(false); // Sunday
    expect(isWorkingDay("2027-03-12")).toBe(true);
    expect(isWorkingDay("2026-11-13")).toBe(false); // Canterbury Anniversary (Show Day)
    expect(isWorkingDay("2027-03-26")).toBe(false); // Good Friday
    expect(workingDaysBefore("2027-03-15", 1)).toBe("2027-03-12"); // Monday back to Friday
  });

  it("nzToday is the NZ date, not the UTC date", () => {
    // 10:00 UTC on 26 Sep 2026 is already 22:00 the same day in NZ (NZST, +12)...
    expect(nzToday(new Date("2026-09-26T10:00:00Z"))).toBe("2026-09-26");
    // ...and 13:00 UTC is 1am on the 27th, just before daylight saving starts at 2am.
    expect(nzToday(new Date("2026-09-26T13:00:00Z"))).toBe("2026-09-27");
  });

  it("nzToday rolls over at NZ midnight in NZST, NZDT and across the 27 Sep 2026 change", () => {
    expect(nzToday(new Date("2027-06-14T11:59:00Z"))).toBe("2027-06-14"); // 23:59 NZST (+12)
    expect(nzToday(new Date("2027-06-14T12:00:00Z"))).toBe("2027-06-15");
    expect(nzToday(new Date("2027-03-13T10:59:00Z"))).toBe("2027-03-13"); // 23:59 NZDT (+13)
    expect(nzToday(new Date("2027-03-13T11:00:00Z"))).toBe("2027-03-14");
    // 27 Sep 2026 is a 23-hour day: it starts at 12:00 UTC on the 26th (+12) and ends at 11:00 UTC on the 27th (+13).
    expect(nzToday(new Date("2026-09-26T11:59:00Z"))).toBe("2026-09-26");
    expect(nzToday(new Date("2026-09-26T14:30:00Z"))).toBe("2026-09-27"); // 03:30 NZDT, just after the jump
    expect(nzToday(new Date("2026-09-27T10:59:00Z"))).toBe("2026-09-27");
    expect(nzToday(new Date("2026-09-27T11:00:00Z"))).toBe("2026-09-28");
  });
});
