import { db } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { MOCK, MOCK_FIXED_COOKIE, ok, fixture, handler, requireOrg, loadEvent, must, toEventDocument } from "@/lib/api/server";

/** Every document the event needs, with status, draft and check results. Drafting is per document: POST /api/documents/:id/draft. */
export const GET = handler(async (_req, ctx: RouteContext<"/api/events/[id]/documents">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  if (MOCK()) {
    const fixed = (await cookies()).get(MOCK_FIXED_COOKIE)?.value === "1";
    return ok(fixture.documents.map((d) => fixed && d.id === fixture.fixedDocument.id ? fixture.fixedDocument : d));
  }
  const ev = await loadEvent(id, orgId);
  const [docs, lists] = await Promise.all([
    db().from("documents").select("*").eq("event_id", id).order("document_type"),
    db().from("checklists").select("document_type, source_url, last_checked").eq("council_id", ev.council_id).eq("verified", true),
  ]);
  const sources = new Map(must(lists).map((c: any) => [c.document_type, { url: c.source_url ?? "", lastChecked: c.last_checked }]));
  return ok(must(docs).map((d: any) => toEventDocument(d, sources.get(d.document_type) ?? null)));
});
