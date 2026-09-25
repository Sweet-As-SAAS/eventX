import { db } from "@/lib/supabase/admin";
import { renderPack } from "@/lib/pdf/pack";
import { DraftDocument } from "@/lib/schemas";
import { MOCK, fixture, handler, requireOrg, loadEvent, must } from "@/lib/api/server";

export const maxDuration = 60;

/** One PDF: cover, every drafted document, and a sources appendix. */
export const GET = handler(async (_req, ctx: RouteContext<"/api/events/[id]/export">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  let eventName = fixture.profile.name.value;
  let docs = fixture.documents.flatMap((d) => (d.content ? [DraftDocument.parse(d.content)] : []));
  let sources = [...new Set(fixture.requirements.map((r) => r.sourceUrl))];
  if (!MOCK()) {
    const ev = await loadEvent(id, orgId);
    eventName = ev.profile?.name.value ?? "Event";
    const rows = must(await db().from("documents").select("content").eq("event_id", id).not("content", "is", null));
    docs = rows.map((d: any) => DraftDocument.parse(d.content));
    const reqs = must(await db().from("requirements").select("source_url").eq("event_id", id));
    sources = [...new Set(reqs.map((r: any) => r.source_url).filter(Boolean))] as string[];
  }
  const pdf = await renderPack({ eventName, docs, sources });
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="hostready-pack.pdf"` } });
});
