// Site plan: schema, layout and checks. Everything here is pure, so the page and the routes share it.
import { describe, expect, it } from "vitest";
import { SiteItem, SitePlan } from "../lib/schemas";

const item = (over: Partial<SiteItem> = {}): SiteItem =>
  ({ id: "firstaid-0", kind: "firstaid", label: "First aid", x: 48, y: 48, w: 80, h: 46, placed: true, ...over });

describe("SitePlan schema", () => {
  it("accepts placed items, tray items and an organiser-added exit", () => {
    const plan = { items: [item(), item({ id: "assembly-0", kind: "assembly", label: "Assembly point", placed: false }),
      item({ id: "exit-1727330000000", kind: "exit", label: "Exit 3", x: 20, y: 237, w: 64, h: 26 })] };
    expect(SitePlan.parse(plan)).toEqual(plan);
  });

  it("accepts an empty plan", () => {
    expect(SitePlan.parse({ items: [] })).toEqual({ items: [] });
  });

  it("trims labels and rejects blank ones", () => {
    expect(SiteItem.parse(item({ label: "  North gate " })).label).toBe("North gate");
    expect(SiteItem.safeParse(item({ label: "   " })).success).toBe(false);
  });

  it.each([
    ["an unknown kind", { kind: "toilets" }],
    ["an empty id", { id: "" }],
    ["an id over 64 characters", { id: "x".repeat(65) }],
    ["a zero width", { w: 0 }],
    ["a negative height", { h: -10 }],
    ["a non-number position", { x: NaN }],
    ["an infinite position", { y: Infinity }],
    ["a label over 80 characters", { label: "x".repeat(81) }],
  ])("rejects %s", (_, over) => {
    expect(SitePlan.safeParse({ items: [{ ...item(), ...over }] }).success).toBe(false);
  });

  it("rejects an item with no placed flag", () => {
    const { placed: _, ...rest } = item();
    expect(SitePlan.safeParse({ items: [rest] }).success).toBe(false);
  });

  it("rejects more than 100 items", () => {
    const items = Array.from({ length: 101 }, (_, i) => item({ id: `exit-${i}`, kind: "exit" }));
    expect(SitePlan.safeParse({ items }).success).toBe(false);
  });
});
