// Site plan layout: what the profile puts on the canvas, and how a saved plan merges back onto it.
// defaultLayout is components/site-plan.tsx build() moved as-is: same ids, labels, sizes, caps and packing.
import type { EventProfile, SiteItem, SiteItemKind, SitePlan } from "../schemas";

/** The canvas in SVG units. `edge` is the inset of the dashed site boundary. */
export const SITE_CANVAS = { w: 800, h: 500, edge: 20 } as const;
const { w: W, h: H, edge: EDGE } = SITE_CANVAS;

export function defaultLayout(p: EventProfile): SiteItem[] {
  const els: Omit<SiteItem, "x" | "y" | "placed">[] = [];
  const add = (kind: SiteItemKind, label: string, w: number, h: number, n = 1) =>
    Array.from({ length: n }, (_, i) => els.push({ id: `${kind}-${i}`, kind, label: n > 1 ? `${label} ${i + 1}` : label, w, h }));
  if (p.alcohol.supply.value === "sold") add("licensed", "Licensed area", 190, 120);
  add("marquee", "Marquee", 110, 76, Math.min(p.structures.marquees.value ?? 0, 6));
  add("food", "Food", 74, 46, Math.min(p.food.stalls.value ?? 0, 8));
  if (p.structures.inflatables.value) add("inflatable", "Inflatable", 92, 92);
  if (p.structures.mechanicalRides.value) add("ride", "Ride", 96, 70);
  if (p.structures.stageOver1m.value) add("stage", "Stage", 150, 64);
  if (p.generators.value) add("generator", "Generator", 76, 36);
  add("firstaid", "First aid", 80, 46);

  // Shelf-pack everything inside the boundary, then exits on the boundary line.
  let x = EDGE + 28, y = EDGE + 28, row = 0;
  const out: SiteItem[] = els.map((e) => {
    if (x + e.w > W - EDGE - 28) { x = EDGE + 28; y += row + 26; row = 0; }
    const el = { ...e, x, y, placed: true };
    x += e.w + 26; row = Math.max(row, e.h);
    return el;
  });
  out.push({ id: "exit-0", kind: "exit", label: "Exit 1", w: 64, h: 26, x: 150, y: H - EDGE - 13, placed: true });
  out.push({ id: "exit-1", kind: "exit", label: "Exit 2", w: 64, h: 26, x: W - 240, y: EDGE - 13, placed: true });
  out.push({ id: "assembly-0", kind: "assembly", label: "Assembly point", w: 110, h: 110, x: W - 170, y: H - 170, placed: false });
  return out;
}

/**
 * The saved plan merged onto what the profile implies now. Layout items keep their saved position and
 * placed flag (label and size always come from the layout). Exits the organiser added are kept. Saved
 * items the profile no longer implies are dropped. Nothing saved gives the default layout.
 */
export function resolveLayout(p: EventProfile, saved: SitePlan | null): SitePlan {
  const layout = defaultLayout(p);
  if (!saved) return { items: layout };
  const byId = new Map(saved.items.map((s) => [s.id, s]));
  const seen = new Set(layout.map((e) => e.id));
  const items = layout.map((e) => {
    const s = byId.get(e.id);
    return s && s.kind === e.kind ? { ...e, x: s.x, y: s.y, placed: s.placed } : e;
  });
  for (const s of saved.items) {
    if (s.kind !== "exit" || seen.has(s.id)) continue;
    seen.add(s.id);
    items.push(s);
  }
  return { items };
}
