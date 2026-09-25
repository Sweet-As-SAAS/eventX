import { db } from "@/lib/supabase/admin";
import { computeDeadlines } from "@/lib/deadlines";
import { MOCK, ok, fixture, handler, requireOrg, loadEvent, requireProfile, must, pruneTypes, toRequirement, HttpError } from "@/lib/api/server";

/** Step 7: dated deadlines from the rules, in working days. Stored so the reminder cron can find them. */
export const GET = handler(async (_req, ctx: RouteContext<"/api/events/[id]/deadlines">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  if (MOCK()) return ok(fixture.deadlines);
  const ev = await loadEvent(id, orgId);
  const date = requireProfile(ev).date.value;
  if (!date) throw new HttpError(409, "The event needs a date first");
  const reqs = must(await db().from("requirements").select("*").eq("event_id", id)).map(toRequirement);
  const deadlines = computeDeadlines(date, reqs);

  // Upsert keeps reminded_14_at / reminded_3_at, so reopening this screen never re-sends a reminder.
  await pruneTypes("deadlines", id, deadlines.map((d) => d.documentType));
  if (deadlines.length) must(await db().from("deadlines").upsert(deadlines.map((d) => ({ event_id: id, document_type: d.documentType,
    label: d.label, legal_minimum: d.legalMinimum, recommended: d.recommended })), { onConflict: "event_id,document_type" }));
  return ok(deadlines);
});
