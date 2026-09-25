import { z } from "zod";
import { db } from "@/lib/supabase/admin";
import { applyAnswers, followUps } from "@/lib/ai/profile";
import { staticRules } from "@/lib/rules";
import { EventProfile, type ProfileResponse } from "@/lib/schemas";
import { MOCK, ok, fixture, handler, parseBody, requireOrg, loadEvent, loadRules, requireProfile, must, HttpError } from "@/lib/api/server";

const Body = z.object({ answers: z.array(z.object({ path: z.string(), answer: z.string() })).min(1).max(10) });

function apply(profile: EventProfile, answers: z.infer<typeof Body>["answers"]) {
  try { return applyAnswers(profile, answers); } catch (e) { throw new HttpError(400, (e as Error).message); }
}

/** Step 2: tap answers merged into the profile. Deterministic, no AI. Returns the same shape as /profile. */
export const POST = handler(async (req, ctx: RouteContext<"/api/events/[id]/answers">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  const { answers } = await parseBody(req, Body);
  if (MOCK()) {
    const profile = apply(EventProfile.parse(fixture.profile), answers);
    return ok({ profile, questions: followUps(profile, staticRules) } satisfies ProfileResponse);
  }
  const ev = await loadEvent(id, orgId);
  const profile = apply(requireProfile(ev), answers);
  must(await db().from("events").update({ profile }).eq("id", id));
  return ok({ profile, questions: followUps(profile, await loadRules(ev.council)) } satisfies ProfileResponse);
});
