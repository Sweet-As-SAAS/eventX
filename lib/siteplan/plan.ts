// Cleaning and checking a site plan the organiser sends back. Run normalise, then validate.
import type { SitePlan } from "../schemas";
import { SITE_CANVAS } from "./layout";

const { w: W, h: H } = SITE_CANVAS;

/** Whole-unit position, clamped so the box sits inside the canvas (the page's drag does the same). */
const fit = (v: number, size: number, max: number) => Math.max(0, Math.min(Math.floor(max - size), Math.round(v)));

/** Rounds every position and pulls every box, placed or not, back inside the canvas. */
export function normaliseSitePlan(plan: SitePlan): SitePlan {
  return { items: plan.items.map((e) => ({ ...e, x: fit(e.x, e.w, W), y: fit(e.y, e.h, H) })) };
}

/** Problems that make a plan unsaveable, in plain words. Empty when the plan is fine. */
export function validateSitePlan(plan: SitePlan): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const e of plan.items) {
    if (ids.has(e.id)) issues.push(`Two items share the id "${e.id}".`);
    ids.add(e.id);
    if (e.x < 0 || e.y < 0 || e.x + e.w > W || e.y + e.h > H) issues.push(`"${e.label}" does not fit on the ${W}×${H} site plan.`);
  }
  return issues;
}
