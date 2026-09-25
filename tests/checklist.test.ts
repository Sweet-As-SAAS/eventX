import { describe, expect, it } from "vitest";
import { checkedStatus, checklistCovered, HttpError } from "../lib/api/server";
import type { CheckResult } from "../lib/schemas";

const checklist = [{ id: "first" }, { id: "second" }];
const result = (ids: string[], failed: string[] = []): CheckResult => ({
  items: ids.map((itemId) => ({ itemId, text: itemId, pass: !failed.includes(itemId), evidence: "evidence", suggestedFix: null })),
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
