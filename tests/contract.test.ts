// The fixture is what MOCK=1 serves and what the frontend is built against. If this fails, the contract drifted.
import { describe, it, expect } from "vitest";
import { z } from "zod";
import fixture from "../fixtures/demo-event.json";
import {
  Classification, Deadline, DRAFTED_TYPES, EventDocument, EventProfile, FollowUpQuestion, Licence, Requirement,
} from "../lib/schemas";
import { followUps } from "../lib/ai/profile";
import { staticRules } from "../lib/rules";

describe("fixture matches lib/schemas.ts", () => {
  it.each([
    ["profile", EventProfile, fixture.profile],
    ["questions", z.array(FollowUpQuestion), fixture.questions],
    ["classification", Classification, fixture.classification],
    ["requirements", z.array(Requirement), fixture.requirements],
    ["documents", z.array(EventDocument), fixture.documents],
    ["fixedDocument", EventDocument, fixture.fixedDocument],
    ["deadlines", z.array(Deadline), fixture.deadlines],
    ["licences", z.array(Licence), fixture.licences],
  ])("%s", (_, schema, value) => {
    expect(() => schema.parse(value)).not.toThrow();
  });

  it("questions are exactly what the follow-up logic asks", () => {
    expect(followUps(EventProfile.parse(fixture.profile), staticRules)).toEqual(fixture.questions);
  });

  it("one document per requirement, drafted types have drafts, the rest are manual", () => {
    const docs = z.array(EventDocument).parse(fixture.documents);
    expect(docs.map((d) => d.documentType)).toEqual(fixture.requirements.map((r) => r.documentType));
    for (const d of docs) {
      if (DRAFTED_TYPES.has(d.documentType)) expect(d.content?.documentType).toBe(d.documentType);
      else expect(d.status).toBe("manual");
    }
  });

  it("the mock flow can go all green: fixedDocument repairs the one document that is not ready or manual", () => {
    const docs = z.array(EventDocument).parse(fixture.documents);
    const open = docs.filter((d) => d.status !== "ready" && d.status !== "manual");
    const fixed = EventDocument.parse(fixture.fixedDocument);
    expect(open.map((d) => d.id)).toEqual([fixed.id]);
    expect(open[0].checkResults?.items.some((i) => !i.pass)).toBe(true); // a red item to show
    expect(fixed.status).toBe("ready");
    expect(fixed.checkResults!.items.every((i) => i.pass)).toBe(true);
  });

  it("fixture checklist evidence is in the draft and ready drafts have no missing placeholders", () => {
    const docs = z.array(EventDocument).parse([...fixture.documents, fixture.fixedDocument]);
    for (const doc of docs) {
      if (!doc.content) continue;
      const body = doc.content.sections.map((section) => section.body).join("\n");
      const placeholders = [...new Set(body.match(/\[[^\]]+\]/g) ?? [])];
      expect(doc.content.placeholders).toEqual(placeholders);
      if (doc.status === "ready") expect(placeholders).toEqual([]);
      for (const item of doc.checkResults?.items ?? []) {
        if (!item.pass) continue;
        expect(item.evidence).not.toContain("[");
        expect(body).toContain(item.evidence);
      }
    }
  });
});
