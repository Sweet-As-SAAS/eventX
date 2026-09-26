import { describe, expect, it } from "vitest";
import fixture from "../fixtures/demo-event.json";
import { EventProfile } from "../lib/schemas";
import { feeTotal, feesFor } from "../lib/rules/fees";

const profile = (patch: (p: EventProfile) => void) => { const p = EventProfile.parse(structuredClone(fixture.profile)); patch(p); return p; };

describe("council fees", () => {
  it("prices a Hagley Park permit by crowd, community to commercial until classified", () => {
    const p = profile((p) => { p.councilSlug = "ccc"; p.venue.name = { value: "Hagley Park", source: "stated" }; p.peakAttendance = { value: 1200, source: "stated" }; });
    const [permit] = feesFor(p, ["event_permit_application"]);
    expect([permit.min, permit.max]).toEqual([392 + 93, 938 + 206]);
    expect(feesFor(p, ["event_permit_application"], "community")[0].max).toBe(392 + 93);
  });

  it("sets the special licence class by crowd size", () => {
    const at = (n: number) => feesFor(profile((p) => { p.peakAttendance = { value: n, source: "stated" }; }), ["special_licence_application"])[0].min;
    expect([at(80), at(400), at(401)]).toEqual([63.25, 207, 575]);
  });

  it("adds known fees and counts the ones to confirm", () => {
    const p = profile((p) => { p.councilSlug = "ccc"; p.peakAttendance = { value: null, source: null }; });
    expect(feeTotal(feesFor(p, ["building_consent_exemption", "special_licence_application", "site_plan"]))).toEqual({ min: 500, max: 500, unknown: 1 });
  });
});
