import { db } from "@/lib/supabase/admin";
import { requiredDocuments } from "@/lib/rules";
import { DRAFTED_TYPES } from "@/lib/schemas";
import { MOCK, ok, fixture, handler, requireOrg, loadEvent, loadRules, requireProfile, must, pruneTypes } from "@/lib/api/server";

/** Step 4: deterministic rules engine. Also keeps one document row per requirement, preserving existing drafts. */
export const POST = handler(async (_req, ctx: RouteContext<"/api/events/[id]/requirements">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  if (MOCK()) return ok(fixture.requirements);
  const ev = await loadEvent(id, orgId);
  const reqs = requiredDocuments(requireProfile(ev), await loadRules(ev.council));
  const types = reqs.map((r) => r.documentType);

  must(await db().from("requirements").delete().eq("event_id", id));
  if (reqs.length) must(await db().from("requirements").insert(reqs.map((r) => ({ event_id: id, rule_id: r.ruleId,
    document_type: r.documentType, reason: r.reason, source_url: r.sourceUrl, last_checked: r.lastChecked }))));

  await pruneTypes("documents", id, types);
  if (reqs.length) must(await db().from("documents").upsert(types.map((t) => ({ event_id: id, document_type: t,
    status: DRAFTED_TYPES.has(t) ? "pending" : "manual" })), { onConflict: "event_id,document_type", ignoreDuplicates: true }));

  return ok(reqs);
});
