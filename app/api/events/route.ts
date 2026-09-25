import { z } from "zod";
import { db } from "@/lib/supabase/admin";
import { CouncilSlug, type EventSummary } from "@/lib/schemas";
import { MOCK, MOCK_FIXED_COOKIE, ok, fixture, handler, parseBody, requireOrg, must, HttpError } from "@/lib/api/server";

/** Dashboard list, newest first. */
export const GET = handler(async () => {
  const orgId = await requireOrg();
  if (MOCK()) {
    const demo: EventSummary = { id: "demo", name: fixture.profile.name.value, council: CouncilSlug.parse(fixture.profile.councilSlug),
      date: fixture.profile.date.value, status: "draft", eventbriteEventId: null, createdAt: "2026-09-26T09:00:00Z" };
    return ok([demo]);
  }
  const rows = must(await db().from("events").select("id, profile, status, eventbrite_event_id, created_at, councils(slug)")
    .eq("org_id", orgId).order("created_at", { ascending: false }));
  return ok(rows.map((e: any): EventSummary => ({ id: e.id, name: e.profile?.name?.value ?? null, council: e.councils.slug,
    date: e.profile?.date?.value ?? null, status: e.status, eventbriteEventId: e.eventbrite_event_id, createdAt: e.created_at })));
});

const Body = z.object({ council: CouncilSlug, description: z.string().trim().min(10).max(2000) });

/** Step 0: save the description. The profile is built by POST /api/events/:id/profile. */
export const POST = handler(async (req) => {
  const orgId = await requireOrg();
  const body = await parseBody(req, Body);
  if (MOCK()) {
    const response = ok({ id: "demo" });
    response.cookies.delete(MOCK_FIXED_COOKIE);
    return response;
  }
  const council = must(await db().from("councils").select("id").eq("slug", body.council).maybeSingle());
  if (!council) throw new HttpError(500, `Council ${body.council} missing, run the migration`);
  const row = must(await db().from("events").insert({ org_id: orgId, council_id: council.id, description: body.description }).select("id").single());
  return ok({ id: row.id });
});
