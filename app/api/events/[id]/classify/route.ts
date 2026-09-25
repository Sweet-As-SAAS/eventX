import { db } from "@/lib/supabase/admin";
import { classify } from "@/lib/ai/classify";
import { withDemoFallback, isSeeded } from "@/lib/ai/demo";
import { Classification } from "@/lib/schemas";
import { MOCK, ok, fixture, handler, requireOrg, loadEvent, requireProfile, must } from "@/lib/api/server";

export const maxDuration = 60;

/** Step 3: likely community or commercial classification, reasoned from retrieved council text. */
export const POST = handler(async (_req, ctx: RouteContext<"/api/events/[id]/classify">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  if (MOCK()) return ok(fixture.classification);
  const ev = await loadEvent(id, orgId);
  const result = await withDemoFallback(() => classify(requireProfile(ev)),
    isSeeded(ev) ? Classification.parse(fixture.classification) : null);
  must(await db().from("events").update({ classification: result }).eq("id", id));
  return ok(result);
});
