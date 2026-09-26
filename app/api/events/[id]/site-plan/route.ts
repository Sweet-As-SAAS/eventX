import { EventProfile, SiteBasemap, SitePlan, type SiteLayout } from "@/lib/schemas";
import { normaliseSitePlan, resolveLayout, validateSitePlan } from "@/lib/siteplan";
import { isSeeded } from "@/lib/ai/demo";
import { db } from "@/lib/supabase/admin";
import { MOCK, ok, fixture, handler, parseBody, requireOrg, loadEvent, requireProfile, must, HttpError } from "@/lib/api/server";

/** The saved plan, or null. A stored plan that no longer parses counts as nothing saved, so the page still opens. */
const stored = (value: unknown) => {
  const r = SitePlan.safeParse(value);
  return r.success ? r.data : null;
};

/** The demo venue's map picture (a static file of Hagley Park), so any Hagley Park event gets it. Other venues get the plain canvas. */
const demoBasemap = () => SiteBasemap.parse(fixture.siteBasemap);
const basemapFor = (ev: { description: string; council: string }, profile: EventProfile) =>
  isSeeded(ev) || /hagley/i.test(profile.venue.name.value ?? "") ? demoBasemap() : null;

// ponytail: MOCK keeps the plan in server memory, so it resets on restart. Fine for the demo.
let mockPlan: SitePlan | null = null;

/** The site plan layout: the saved plan merged onto what the profile implies now. No AI, no network. */
export const GET = handler(async (_req, ctx: RouteContext<"/api/events/[id]/site-plan">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  if (MOCK()) return ok({ ...resolveLayout(EventProfile.parse(fixture.profile), mockPlan), basemap: demoBasemap() } satisfies SiteLayout);
  const ev = await loadEvent(id, orgId);
  const profile = requireProfile(ev);
  return ok({ ...resolveLayout(profile, stored(ev.site_plan)), basemap: basemapFor(ev, profile) } satisfies SiteLayout);
});

/** Replaces the whole plan. Cleans it (whole units, every box inside the canvas), refuses what can't be saved, returns the layout. */
export const POST = handler(async (req, ctx: RouteContext<"/api/events/[id]/site-plan">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  const plan = normaliseSitePlan(await parseBody(req, SitePlan));
  const issues = validateSitePlan(plan);
  if (issues.length) throw new HttpError(400, issues.join(" "));
  if (MOCK()) {
    mockPlan = plan;
    return ok({ ...resolveLayout(EventProfile.parse(fixture.profile), plan), basemap: demoBasemap() } satisfies SiteLayout);
  }
  const ev = await loadEvent(id, orgId);
  const profile = requireProfile(ev);
  must(await db().from("events").update({ site_plan: plan }).eq("id", id)); // column from migration 0004
  return ok({ ...resolveLayout(profile, plan), basemap: basemapFor(ev, profile) } satisfies SiteLayout);
});
