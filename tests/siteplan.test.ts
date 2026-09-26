// Site plan: schema, layout and checks. Everything here is pure, so the page and the routes share it.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fixture from "../fixtures/demo-event.json";
import cccSpecialLicence from "../scripts/ingest/verified/ccc/special-licence.json";
import { EventProfile, SiteBasemap, SiteItem, SiteLayout, SitePlan, type CouncilSlug } from "../lib/schemas";
import { requiredDocuments, staticRules } from "../lib/rules";
import {
  SITE_CANVAS, SITE_COUNCIL_FACTS, defaultLayout, normaliseSitePlan, resolveLayout, siteChecks, validateSitePlan,
  type SiteCouncilFact,
} from "../lib/siteplan";

const item = (over: Partial<SiteItem> = {}): SiteItem =>
  ({ id: "firstaid-0", kind: "firstaid", label: "First aid", x: 48, y: 48, w: 80, h: 46, placed: true, ...over });

// Tests force the fields they depend on, so they hold whatever the demo scenario is.
const base = EventProfile.parse(fixture.profile);
function profile(fields: Record<string, unknown> = {}, council: CouncilSlug = "ccc"): EventProfile {
  const p: any = structuredClone(base);
  for (const [path, value] of Object.entries(fields)) {
    const keys = path.split(".");
    keys.slice(0, -1).reduce((o, k) => o[k], p)[keys.at(-1)!] = { value, source: "answered" };
  }
  return EventProfile.parse({ ...p, councilSlug: council });
}
const bare = {
  "alcohol.supply": "none", "structures.marquees": 0, "food.stalls": 0, "structures.inflatables": false,
  "structures.mechanicalRides": false, "structures.stageOver1m": false, generators: false,
};
const everything = {
  "alcohol.supply": "sold", "structures.marquees": 6, "food.stalls": 8, "structures.inflatables": true,
  "structures.mechanicalRides": true, "structures.stageOver1m": true, generators: true,
};
/** [id, x, y, placed] for each item, to read positions at a glance. */
const at = (items: SiteItem[]) => items.map((e) => [e.id, e.x, e.y, e.placed]);
const ids = (items: SiteItem[]) => items.map((e) => e.id);
const find = (items: SiteItem[], id: string) => items.find((e) => e.id === id)!;
const fits = (e: SiteItem) => e.x >= 0 && e.y >= 0 && e.x + e.w <= SITE_CANVAS.w && e.y + e.h <= SITE_CANVAS.h;
const reqs = (p: EventProfile) => requiredDocuments(p, staticRules);

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
    const rest: Partial<SiteItem> = { ...item() };
    delete rest.placed;
    expect(SitePlan.safeParse({ items: [rest] }).success).toBe(false);
  });

  it("rejects more than 100 items", () => {
    const items = Array.from({ length: 101 }, (_, i) => item({ id: `exit-${i}`, kind: "exit" }));
    expect(SitePlan.safeParse({ items }).success).toBe(false);
  });
});

describe("defaultLayout", () => {
  it("gives a bare event first aid, two exits on the boundary and an assembly point in the tray", () => {
    expect(defaultLayout(profile(bare))).toEqual([
      { id: "firstaid-0", kind: "firstaid", label: "First aid", w: 80, h: 46, x: 48, y: 48, placed: true },
      { id: "exit-0", kind: "exit", label: "Exit 1", w: 64, h: 26, x: 150, y: 467, placed: true },
      { id: "exit-1", kind: "exit", label: "Exit 2", w: 64, h: 26, x: 560, y: 7, placed: true },
      { id: "assembly-0", kind: "assembly", label: "Assembly point", w: 110, h: 110, x: 630, y: 330, placed: false },
    ]);
  });

  it("shelf-packs left to right inside the boundary and wraps to a new row", () => {
    const p = profile({ ...bare, "alcohol.supply": "sold", "structures.marquees": 2, "food.stalls": 3, "structures.inflatables": true, generators: true });
    expect(at(defaultLayout(p))).toEqual([
      ["licensed-0", 48, 48, true], ["marquee-0", 264, 48, true], ["marquee-1", 400, 48, true],
      ["food-0", 536, 48, true], ["food-1", 636, 48, true],
      ["food-2", 48, 194, true], ["inflatable-0", 148, 194, true], ["generator-0", 266, 194, true], ["firstaid-0", 368, 194, true],
      ["exit-0", 150, 467, true], ["exit-1", 560, 7, true], ["assembly-0", 630, 330, false],
    ]);
  });

  it("caps marquees at 6 and food at 8, and numbers labels only when there is more than one", () => {
    const many = defaultLayout(profile({ ...bare, "structures.marquees": 10, "food.stalls": 20 }));
    expect(many.filter((e) => e.kind === "marquee").map((e) => e.label)).toEqual(["Marquee 1", "Marquee 2", "Marquee 3", "Marquee 4", "Marquee 5", "Marquee 6"]);
    expect(many.filter((e) => e.kind === "food")).toHaveLength(8);
    const one = defaultLayout(profile({ ...bare, "structures.marquees": 1, "food.stalls": 1 }));
    expect(one.filter((e) => e.kind === "marquee" || e.kind === "food").map((e) => [e.id, e.label])).toEqual([["marquee-0", "Marquee"], ["food-0", "Food"]]);
    expect(ids(defaultLayout(profile({ ...bare, "structures.marquees": null, "food.stalls": null })))).toEqual(ids(defaultLayout(profile(bare))));
  });

  it.each(["free", "byo", "none", null])("adds a licensed area only when alcohol is sold, not %s", (supply) => {
    expect(ids(defaultLayout(profile({ ...bare, "alcohol.supply": supply })))).not.toContain("licensed-0");
    expect(ids(defaultLayout(profile({ ...bare, "alcohol.supply": "sold" })))).toContain("licensed-0");
  });

  it.each([
    ["structures.inflatables", "inflatable-0"], ["structures.mechanicalRides", "ride-0"],
    ["structures.stageOver1m", "stage-0"], ["generators", "generator-0"],
  ])("adds an item when %s is true", (path, id) => {
    expect(ids(defaultLayout(profile({ ...bare, [path]: true })))).toContain(id);
    expect(ids(defaultLayout(profile({ ...bare, [path]: false })))).not.toContain(id);
  });

  it("keeps ids unique and every item on the canvas for the fullest profile", () => {
    const items = defaultLayout(profile(everything));
    expect(new Set(ids(items)).size).toBe(items.length);
    expect(items.filter((e) => !fits(e))).toEqual([]);
  });
});

describe("resolveLayout", () => {
  const p = profile({ ...bare, "structures.marquees": 1, "food.stalls": 3 });
  const layout = defaultLayout(p);

  it("gives the default layout when nothing is saved", () => {
    expect(resolveLayout(p, null)).toEqual({ items: layout });
  });

  it("keeps the saved position and placed flag, but label and size come from the layout", () => {
    const saved = { items: [{ ...find(layout, "food-1"), x: 300, y: 250, label: "Taco truck", w: 400 }, { ...find(layout, "firstaid-0"), placed: false }] };
    const items = resolveLayout(p, saved).items;
    expect(find(items, "food-1")).toEqual({ ...find(layout, "food-1"), x: 300, y: 250 });
    expect(find(items, "firstaid-0").placed).toBe(false);
    expect(ids(items)).toEqual(ids(layout));
  });

  it("ignores a saved item whose kind no longer matches its id", () => {
    const saved = { items: [{ ...find(layout, "food-0"), kind: "stage" as const, x: 300 }] };
    expect(find(resolveLayout(p, saved).items, "food-0")).toEqual(find(layout, "food-0"));
  });

  it("keeps exits the organiser added, once each, after the layout", () => {
    const added = item({ id: "exit-1727330000000", kind: "exit", label: "Exit 3", x: 20, y: 237, w: 64, h: 26 });
    const items = resolveLayout(p, { items: [added, added] }).items;
    expect(items.slice(0, layout.length)).toEqual(layout);
    expect(items.slice(layout.length)).toEqual([added]);
  });

  it("drops saved items the profile no longer implies", () => {
    const saved = { items: [item({ id: "food-5", kind: "food", label: "Food 6" }), item({ id: "stage-0", kind: "stage", label: "Stage" })] };
    expect(resolveLayout(p, saved)).toEqual({ items: layout });
  });

  it("follows profile changes: new items get their default spot and labels renumber", () => {
    const saved = { items: [{ ...find(layout, "marquee-0"), x: 500, y: 300 }] };
    const items = resolveLayout(profile({ ...bare, "structures.marquees": 2, "food.stalls": 3 }), saved).items;
    expect(find(items, "marquee-0")).toMatchObject({ label: "Marquee 1", x: 500, y: 300 });
    expect(find(items, "marquee-1")).toMatchObject({ label: "Marquee 2", placed: true });
  });
});

describe("normaliseSitePlan and validateSitePlan", () => {
  it("rounds positions and pulls every box inside the canvas, placed or not", () => {
    const plan = { items: [
      item({ id: "a", x: -10, y: 12.6 }), item({ id: "b", x: 790, y: 480, placed: false }), item({ id: "c", x: 100.4, y: 200 }),
    ] };
    expect(at(normaliseSitePlan(plan).items)).toEqual([["a", 0, 13, true], ["b", 720, 454, false], ["c", 100, 200, true]]);
    expect(plan.items[0].x).toBe(-10);
  });

  it("keeps a box with a fractional size inside the canvas", () => {
    const [e] = normaliseSitePlan({ items: [item({ x: 900, w: 80.5 })] }).items;
    expect(fits(e)).toBe(true);
  });

  it("passes the default layout for any profile, and any normalised plan of normal-sized boxes", () => {
    expect(validateSitePlan({ items: defaultLayout(profile(everything)) })).toEqual([]);
    expect(validateSitePlan(normaliseSitePlan({ items: [item({ x: -500, y: 9000 }), item({ id: "b", x: 1e6, y: -3 })] }))).toEqual([]);
  });

  it("names a box that does not fit, even after normalising", () => {
    expect(validateSitePlan({ items: [item({ label: "First aid", x: 790 })] })).toEqual(["\"First aid\" does not fit on the 800×500 site plan."]);
    expect(validateSitePlan(normaliseSitePlan({ items: [item({ label: "Big top", w: 900 })] }))).toEqual(["\"Big top\" does not fit on the 800×500 site plan."]);
  });

  it("rejects two items with the same id", () => {
    expect(validateSitePlan({ items: [item(), item({ x: 300 })] })).toEqual(["Two items share the id \"firstaid-0\"."]);
  });
});

describe("siteChecks", () => {
  const placeAll = (items: SiteItem[]) => items.map((e) => ({ ...e, placed: true }));
  const failing = (items: SiteItem[], p: EventProfile) =>
    siteChecks(items, { council: p.councilSlug, requirements: reqs(p) }).filter((c) => !c.pass).map((c) => c.id);

  it.each<[string, EventProfile]>([
    ["the demo fixture", base],
    ["CCC, alcohol sold", profile({ "alcohol.supply": "sold" }, "ccc")],
    ["CCC, no alcohol", profile({ "alcohol.supply": "none" }, "ccc")],
    ["everything, CCC", profile(everything)],
    ["a bare event", profile(bare)],
  ])("default layout for %s: only the assembly point is red, and placing it turns everything green", (_, p) => {
    const items = defaultLayout(p);
    expect(failing(items, p)).toEqual(["assembly"]);
    expect(failing(placeAll(items), p)).toEqual([]);
  });

  it("marks the licensed area as a CCC requirement, cited word for word from lane B's verified checklist", () => {
    const p = profile({ "alcohol.supply": "sold" }, "ccc");
    const licensed = siteChecks(defaultLayout(p), { council: "ccc", requirements: reqs(p) }).find((c) => c.id === "licensed")!;
    expect(licensed).toMatchObject({ label: "Licensed area marked", pass: true, basis: "council", note: null });
    expect(licensed.source).toEqual({ url: cccSpecialLicence.url, quote: SITE_COUNCIL_FACTS[0].sourceQuote, lastChecked: "2026-09-26" });
    const items = cccSpecialLicence.checklists.find((c) => c.documentType === "special_licence_application")!.items;
    expect(items.find((i) => i.id === "site-plan")!.sourceQuote).toBe(licensed.source!.quote);
    expect(cccSpecialLicence.verified).toBe(true);
  });

  it("turns the licensed area red when it is taken off the plan", () => {
    const p = profile({ "alcohol.supply": "sold" }, "ccc");
    const items = placeAll(defaultLayout(p)).map((e) => (e.kind === "licensed" ? { ...e, placed: false } : e));
    expect(failing(items, p)).toEqual(["licensed"]);
  });

  it("checks the licensed area only when a special licence is required", () => {
    const items = placeAll(defaultLayout(profile({ "alcohol.supply": "sold" })));
    expect(siteChecks(items, { council: "ccc", requirements: [] }).map((c) => c.id)).toEqual(["exits", "firstaid", "assembly"]);
  });

  it("labels the licensed area an EvntX check where the council has no verified fact", () => {
    const requirements = [{ documentType: "special_licence_application" as const }];
    const licensed = siteChecks([], { council: "ccc", requirements }, [])[0]; // CCC is the only council: no facts stands in
    expect(licensed).toMatchObject({ id: "licensed", pass: false, basis: "hostready", source: null });
  });

  const fact = SITE_COUNCIL_FACTS[0];
  it.each<[string, SiteCouncilFact]>([
    ["unverified", { ...fact, verified: false }],
    ["with no source URL", { ...fact, sourceUrl: "TODO" }],
    ["never checked", { ...fact, lastChecked: null }],
  ])("never makes a council check from a fact that is %s", (_, f) => {
    const [licensed] = siteChecks([], { council: "ccc", requirements: [{ documentType: "special_licence_application" }] }, [f]);
    expect(licensed).toMatchObject({ basis: "hostready", source: null });
  });

  it("counts only placed exits, and says how many are on the plan", () => {
    const exits = (placed: boolean[]) => placed.map((pl, i) => item({ id: `exit-${i}`, kind: "exit", label: `Exit ${i + 1}`, placed: pl }));
    const check = (items: SiteItem[]) => siteChecks(items, { council: "ccc", requirements: [] }).find((c) => c.id === "exits")!;
    expect(check(exits([true, false]))).toMatchObject({ pass: false, note: "1 on the plan" });
    expect(check(exits([true, true, true]))).toMatchObject({ pass: true, note: "3 on the plan" });
  });

  it("labels exits, first aid and the assembly point as HostReady checks", () => {
    const checks = siteChecks(defaultLayout(base), { council: "ccc", requirements: [] });
    expect(checks.map((c) => [c.id, c.label, c.basis, c.source])).toEqual([
      ["exits", "At least two exits", "hostready", null],
      ["firstaid", "First aid on the plan", "hostready", null],
      ["assembly", "Assembly point placed", "hostready", null],
    ]);
  });
});

it("lib/siteplan imports only ../schemas and its own files, so client components can use it", () => {
  const dir = new URL("../lib/siteplan/", import.meta.url);
  for (const file of readdirSync(dir)) {
    const specs = [...readFileSync(new URL(file, dir), "utf8").matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)].map((m) => m[1]);
    for (const spec of specs) expect(["../schemas", "./layout", "./plan", "./checks"], `${file} imports ${spec}`).toContain(spec);
  }
});

describe("site plan basemap", () => {
  it("SiteLayout is the plan plus a basemap or null, and a saved plan never carries one", () => {
    const basemap = { url: "/site-plan/x.png", attribution: "© OpenStreetMap contributors" };
    expect(SiteLayout.parse({ items: [item()], basemap })).toEqual({ items: [item()], basemap });
    expect(SiteLayout.parse({ items: [], basemap: null }).basemap).toBeNull();
    expect(SiteLayout.safeParse({ items: [] }).success).toBe(false);
    expect(SitePlan.parse({ items: [item()], basemap })).toEqual({ items: [item()] }); // the client can't set the picture
  });

  it("the fixture's map picture is a PNG under public/ in the canvas's shape", () => {
    const { url, attribution } = SiteBasemap.parse(fixture.siteBasemap);
    expect(attribution).not.toBe("");
    const png = readFileSync(new URL(`../public${url}`, import.meta.url));
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)]; // IHDR width and height
    expect(w / h).toBeCloseTo(SITE_CANVAS.w / SITE_CANVAS.h, 3);
  });
});
