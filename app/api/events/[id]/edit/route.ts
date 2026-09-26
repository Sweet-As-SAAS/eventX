import { z } from "zod";
import { db } from "@/lib/supabase/admin";
import { followUps } from "@/lib/ai/profile";
import { staticRules } from "@/lib/rules";
import { EventProfile, type ProfileResponse } from "@/lib/schemas";
import { MOCK, ok, fixture, handler, parseBody, requireOrg, loadEvent, loadRules, requireProfile, must, HttpError } from "@/lib/api/server";

const Body = z.object({
  edits: z.array(z.object({ path: z.string().regex(/^[a-zA-Z.]+$/), value: z.union([z.string(), z.number(), z.boolean(), z.null()]) })).min(1).max(30),
});

/** Organiser corrections from the Details page. Deterministic, no AI; the schema rejects wrong types. */
function apply(profile: EventProfile, edits: z.infer<typeof Body>["edits"]) {
  const next: any = structuredClone(profile);
  for (const { path, value } of edits) {
    const keys = path.split(".");
    const parent = keys.slice(0, -1).reduce((o, k) => o?.[k], next);
    const leaf = parent?.[keys.at(-1)!];
    if (!leaf || typeof leaf !== "object" || !("value" in leaf)) throw new HttpError(400, `Can't edit ${path}`);
    parent[keys.at(-1)!] = { value, source: "answered" };
    next.missing = next.missing.filter((m: string) => m !== path);
  }
  const r = EventProfile.safeParse(next);
  if (!r.success) throw new HttpError(400, z.prettifyError(r.error));
  return r.data;
}

export const POST = handler(async (req, ctx: RouteContext<"/api/events/[id]/edit">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  const { edits } = await parseBody(req, Body);
  if (MOCK()) {
    const profile = apply(EventProfile.parse(fixture.profile), edits);
    return ok({ profile, questions: followUps(profile, staticRules) } satisfies ProfileResponse);
  }
  const ev = await loadEvent(id, orgId);
  const profile = apply(requireProfile(ev), edits);
  must(await db().from("events").update({ profile }).eq("id", id));
  return ok({ profile, questions: followUps(profile, await loadRules(ev.council)) } satisfies ProfileResponse);
});
