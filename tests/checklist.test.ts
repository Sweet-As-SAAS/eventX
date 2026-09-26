import { describe, expect, it } from "vitest";
import { checkedStatus, checklistCovered, documentsReadyForTicketing, HttpError } from "../lib/api/server";
import type { CheckResult } from "../lib/schemas";

const checklist = [{ id: "first" }, { id: "second" }];
const result = (ids: string[], failed: string[] = []): CheckResult => ({
  items: ids.map((itemId) => ({ itemId, text: itemId, pass: !failed.includes(itemId), evidence: "evidence", suggestedFix: null, alternatives: [] })),
});

describe("document checks", () => {
  it("marks a complete passing checklist ready and a failed item as needing a fix", () => {
    expect(checkedStatus(result(["second", "first"]), checklist)).toBe("ready");
    expect(checkedStatus(result(["first", "second"], ["second"]), checklist)).toBe("needs_fix");
  });

  it.each([
    ["omitted item", result(["first"])],
    ["duplicate item", result(["first", "first"])],
    ["unrecognised item", result(["first", "third"])],
  ])("rejects an %s before the document can unlock ticketing", (_name, check) => {
    expect(checklistCovered(check, checklist)).toBe(false);
    expect(() => checkedStatus(check, checklist)).toThrow(HttpError);
  });

  it("rejects an empty checklist", () => {
    expect(checklistCovered(result([]), [])).toBe(false);
    expect(() => checkedStatus(result([]), [])).toThrow(HttpError);
  });
});

describe("Eventbrite document gate", () => {
  const required = new Set(["site_plan", "safety_plan"]);
  const lists = new Map([["safety_plan", checklist]]);
  const manual = { document_type: "site_plan", status: "manual", content: null, check_results: null };
  const ready = { document_type: "safety_plan", status: "ready", content: { sections: [] },
    check_results: result(["first", "second"]) };

  it("accepts a manual document alongside a complete verified passing draft", () => {
    expect(documentsReadyForTicketing(required, [manual, ready], lists)).toBe(true);
  });

  it.each([
    ["no requirements", new Set<string>(), [manual, ready], lists],
    ["missing document", required, [ready], lists],
    ["unexpected document type", required, [{ ...manual, document_type: "other" }, ready], lists],
    ["pending draft", required, [manual, { ...ready, status: "pending" }], lists],
    ["unfixed draft", required, [manual, { ...ready, status: "needs_fix" }], lists],
    ["no content", required, [manual, { ...ready, content: null }], lists],
    ["no check result", required, [manual, { ...ready, check_results: null }], lists],
    ["failed check", required, [manual, { ...ready, check_results: result(["first", "second"], ["second"]) }], lists],
    ["incomplete check", required, [manual, { ...ready, check_results: result(["first"]) }], lists],
    ["no verified checklist", required, [manual, ready], new Map()],
  ] as const)("locks ticketing for %s", (_reason, types, docs, verified) => {
    expect(documentsReadyForTicketing(types, docs, verified)).toBe(false);
  });
});
