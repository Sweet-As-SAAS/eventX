import { EventProfile, SiteBasemap, SitePlan, type SiteLayout } from "@/lib/schemas";
import { normaliseSitePlan, resolveLayout, validateSitePlan } from "@/lib/siteplan";
import { isSeeded } from "@/lib/ai/demo";
import { MOCK, ok, fixture, handler, parseBody, requireOrg, loadEvent, requireProfile, HttpError } from "@/lib/api/server";

/** The saved plan, or null. A stored plan that no longer parses counts as nothing saved, so the page still opens. */
const stored = (value: unknown) => {
  const r = SitePlan.safeParse(value);
  return r.success ? r.data : null;
};

/** The demo venue's map picture (a static file). Other events have none yet and get the plain canvas. */
const demoBasemap = () => SiteBasemap.parse(fixture.siteBasemap);
const basemapFor = (ev: { description: string; council: string }) => (isSeeded(ev) ? demoBasemap() : null);

/** The site plan layout: the saved plan merged onto what the profile implies now. No AI, no network. */
export const GET = handler(async (_req, ctx: RouteContext<"/api/events/[id]/site-plan">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  if (MOCK()) return ok({ ...resolveLayout(EventProfile.parse(fixture.profile), null), basemap: demoBasemap() } satisfies SiteLayout);
  const ev = await loadEvent(id, orgId);
  return ok({ ...resolveLayout(requireProfile(ev), stored(ev.site_plan)), basemap: basemapFor(ev) } satisfies SiteLayout);
});

/** Replaces the whole plan. Cleans it (whole units, every box inside the canvas), refuses what can't be saved, returns the layout. */
export const POST = handler(async (req, ctx: RouteContext<"/api/events/[id]/site-plan">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  const plan = normaliseSitePlan(await parseBody(req, SitePlan));
  const issues = validateSitePlan(plan);
  if (issues.length) throw new HttpError(400, issues.join(" "));
  if (MOCK()) return ok({ ...resolveLayout(EventProfile.parse(fixture.profile), plan), basemap: demoBasemap() } satisfies SiteLayout);
  const ev = await loadEvent(id, orgId);
  const profile = requireProfile(ev);
  // Step 4 (migration 0003) saves `plan` to events.site_plan here. Until then the plan is checked and echoed, not stored.
  return ok({ ...resolveLayout(profile, plan), basemap: basemapFor(ev) } satisfies SiteLayout);
});
