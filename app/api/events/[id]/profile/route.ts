import { db } from "@/lib/supabase/admin";
import { buildProfile, followUps } from "@/lib/ai/profile";
import { withDemoFallback, isSeeded } from "@/lib/ai/demo";
import { nzToday } from "@/lib/deadlines";
import { EventProfile, type ProfileResponse } from "@/lib/schemas";
import { MOCK, ok, fixture, handler, requireOrg, loadEvent, loadRules, requireProfile, must } from "@/lib/api/server";

export const maxDuration = 60;

/** Steps 1 and 2: AI profile from the description, then rule-driven follow-up questions. */
export const POST = handler(async (_req, ctx: RouteContext<"/api/events/[id]/profile">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  if (MOCK()) return ok({ profile: fixture.profile, questions: fixture.questions });
  const ev = await loadEvent(id, orgId);
  const profile = await withDemoFallback(() => buildProfile(ev.description, ev.council, nzToday()),
    isSeeded(ev) ? EventProfile.parse(fixture.profile) : null);
  const questions = followUps(profile, await loadRules(ev.council));
  must(await db().from("events").update({ profile }).eq("id", id));
  return ok({ profile, questions } satisfies ProfileResponse);
});

/** The saved profile and its open follow-up questions. No AI, so revisiting Details or Questions is instant. */
export const GET = handler(async (_req, ctx: RouteContext<"/api/events/[id]/profile">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  if (MOCK()) return ok({ profile: fixture.profile, questions: fixture.questions });
  const ev = await loadEvent(id, orgId);
  const profile = requireProfile(ev);
  return ok({ profile, questions: followUps(profile, await loadRules(ev.council)) } satisfies ProfileResponse);
});
