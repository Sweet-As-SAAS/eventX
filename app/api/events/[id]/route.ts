import { db } from "@/lib/supabase/admin";
import type { EventDetail } from "@/lib/schemas";
import { MOCK, ok, fixture, handler, requireOrg, loadEvent, must, toRequirement } from "@/lib/api/server";

/** Everything a screen needs to rebuild itself after a refresh. */
export const GET = handler(async (_req, ctx: RouteContext<"/api/events/[id]">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  if (MOCK()) {
    return ok({ id, council: fixture.profile.councilSlug, description: fixture.description, status: "draft", profile: fixture.profile,
      classification: fixture.classification, requirements: fixture.requirements, eventbriteEventId: null, createdAt: "2026-09-26T09:00:00Z" });
  }
  const ev = await loadEvent(id, orgId);
  const reqs = must(await db().from("requirements").select("*").eq("event_id", id));
  const detail: EventDetail = { id: ev.id, council: ev.council, description: ev.description, status: ev.status, profile: ev.profile,
    classification: ev.classification, requirements: reqs.map(toRequirement), eventbriteEventId: ev.eventbrite_event_id, createdAt: ev.created_at };
  return ok(detail);
});
