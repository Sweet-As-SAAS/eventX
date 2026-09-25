import { db } from "@/lib/supabase/admin";
import { MOCK, ok, fixture, handler, requireOrg, loadEvent, must, toEventDocument } from "@/lib/api/server";

/** Every document the event needs, with status, draft and check results. Drafting is per document: POST /api/documents/:id/draft. */
export const GET = handler(async (_req, ctx: RouteContext<"/api/events/[id]/documents">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  if (MOCK()) return ok(fixture.documents);
  const ev = await loadEvent(id, orgId);
  const [docs, lists] = await Promise.all([
    db().from("documents").select("*").eq("event_id", id).order("document_type"),
    db().from("checklists").select("document_type, source_url, last_checked").eq("council_id", ev.council_id).eq("verified", true),
  ]);
  const sources = new Map(must(lists).map((c: any) => [c.document_type, { url: c.source_url ?? "", lastChecked: c.last_checked }]));
  return ok(must(docs).map((d: any) => toEventDocument(d, sources.get(d.document_type) ?? null)));
});
