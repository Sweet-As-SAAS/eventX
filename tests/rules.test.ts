import { describe, it, expect } from "vitest";
import fixture from "../fixtures/demo-event.json";
import { EventProfile, Requirement, type DocumentType } from "../lib/schemas";
import { requiredDocuments, staticRules } from "../lib/rules";
import { applyAnswers } from "../lib/ai/profile";

// Tests force the fields they depend on, so they hold whatever the demo scenario is.
const base = EventProfile.parse(fixture.profile);
function withFields(fields: Record<string, unknown>): EventProfile {
  const p: any = structuredClone(base);
  for (const [path, value] of Object.entries(fields)) {
    const keys = path.split(".");
    keys.slice(0, -1).reduce((o, k) => o[k], p)[keys.at(-1)!] = { value, source: "answered" };
  }
  return EventProfile.parse({ ...p, councilSlug: "ccc" });
}
const types = (p: EventProfile) => requiredDocuments(p, staticRules).map((r) => r.documentType);

describe("rules engine", () => {
  it("the demo fixture's requirements are exactly what the engine computes", () => {
    expect(requiredDocuments(base, staticRules)).toEqual(fixture.requirements.map((r) => Requirement.parse(r)));
  });

  const publicLand = { openToPublic: true, "venue.councilLand": true };
  it.each<[DocumentType, Record<string, unknown>, Record<string, unknown>]>([
    ["event_permit_application", publicLand, { openToPublic: false }],
    ["site_plan", publicLand, { "venue.councilLand": false }],
    ["health_safety_plan", publicLand, { openToPublic: false }],
    ["waste_management_confirmation", publicLand, { openToPublic: false }],
    ["building_consent_exemption", { "structures.largestMarqueeSqm": 150 }, { "structures.largestMarqueeSqm": 50 }],
    ["hazard_register", { "structures.inflatables": true }, { "structures.inflatables": false }],
    ["amusement_device_permit", { "structures.mechanicalRides": true }, { "structures.mechanicalRides": false }],
    ["traffic_management_plan", { roadOrFootpathImpact: true }, { roadOrFootpathImpact: false }],
    ["food_licence_check", { "food.stalls": 3 }, { "food.stalls": 0 }],
    ["special_licence_application", { "alcohol.supply": "sold" }, { "alcohol.supply": "none" }],
    ["alcohol_management_plan", { "alcohol.supply": "sold", peakAttendance: 151 }, { "alcohol.supply": "sold", peakAttendance: 150 }],
  ])("CCC: %s fires only when its trigger holds", (doc, on, off) => {
    expect(types(withFields(on))).toContain(doc);
    expect(types(withFields(off))).not.toContain(doc);
  });

  it("answering 'Over 100 sqm' records it and triggers a building consent exemption", () => {
    const p = applyAnswers(withFields({}), [{ path: "structures.largestMarqueeSqm", answer: "Over 100 sqm" }]);
    expect(p.structures.largestMarqueeSqm).toEqual({ value: 150, source: "answered" });
    expect(p.missing).not.toContain("structures.largestMarqueeSqm");
    expect(types(p)).toContain("building_consent_exemption");
  });

  it("'Not sure' clears the question without inventing a value", () => {
    const p = applyAnswers(withFields({}), [{ path: "structures.largestMarqueeSqm", answer: "Not sure" }]);
    expect(p.structures.largestMarqueeSqm.value).toBeNull();
    expect(p.missing).not.toContain("structures.largestMarqueeSqm");
  });

  it("rejects answers that are not one of the question's options", () => {
    expect(() => applyAnswers(base, [{ path: "structures.largestMarqueeSqm", answer: "huge" }])).toThrow();
    expect(() => applyAnswers(base, [{ path: "__proto__.polluted", answer: "Yes" }])).toThrow();
  });

  it("unverified rules never fire", () => {
    const p = withFields(publicLand);
    const unverified = staticRules.map((r) => ({ ...r, verified: false }));
    expect(requiredDocuments(p, unverified)).toEqual([]);
  });

  it("CCC rules never apply to a Waimakariri event", () => {
    const ids = requiredDocuments({ ...withFields(publicLand), councilSlug: "waimakariri" }, staticRules).map((r) => r.ruleId);
    expect(ids.filter((id) => id.startsWith("ccc-"))).toEqual([]);
  });
});
