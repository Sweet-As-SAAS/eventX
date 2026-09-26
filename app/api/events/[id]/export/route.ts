import { db } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { renderPack, type PackSource } from "@/lib/pdf/pack";
import { DraftDocument } from "@/lib/schemas";
import { MOCK, MOCK_FIXED_COOKIE, fixture, handler, requireOrg, loadEvent, must } from "@/lib/api/server";

export const maxDuration = 60;

function uniqueSources(refs: PackSource[]): PackSource[] {
  const byUrl = new Map<string, PackSource>();
  for (const ref of refs) {
    if (!ref.url) continue;
    const previous = byUrl.get(ref.url);
    if (!previous || (ref.lastChecked ?? "") > (previous.lastChecked ?? "")) byUrl.set(ref.url, ref);
  }
  return [...byUrl.values()];
}

/** One PDF: cover, every drafted document, and a sources appendix. */
export const GET = handler(async (_req, ctx: RouteContext<"/api/events/[id]/export">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  let eventName = fixture.profile.name.value;
  let docs = fixture.documents.flatMap((d) => (d.content ? [DraftDocument.parse(d.content)] : []));
  let sources = uniqueSources([
    ...fixture.requirements.map((r) => ({ url: r.sourceUrl, lastChecked: r.lastChecked })),
    ...fixture.documents.flatMap((d) => d.checklistSource ? [d.checklistSource] : []),
  ]);
  if (MOCK() && (await cookies()).get(MOCK_FIXED_COOKIE)?.value === "1") {
    docs = fixture.documents.flatMap((d) => {
      const content = d.id === fixture.fixedDocument.id ? fixture.fixedDocument.content : d.content;
      return content ? [DraftDocument.parse(content)] : [];
    });
  } else if (!MOCK()) {
    const ev = await loadEvent(id, orgId);
    eventName = ev.profile?.name.value ?? "Event";
    const [documentRows, requirementRows, checklistRows] = await Promise.all([
      db().from("documents").select("document_type, content").eq("event_id", id),
      db().from("requirements").select("source_url, last_checked").eq("event_id", id),
      db().from("checklists").select("document_type, source_url, last_checked")
        .eq("council_id", ev.council_id).eq("verified", true),
    ]);
    const rows = must(documentRows);
    docs = rows.flatMap((d: any) => d.content ? [DraftDocument.parse(d.content)] : []);
    const documentTypes = new Set(rows.map((d: any) => d.document_type));
    sources = uniqueSources([
      ...must(requirementRows).map((r: any) => ({ url: r.source_url, lastChecked: r.last_checked })),
      ...must(checklistRows).filter((c: any) => documentTypes.has(c.document_type))
        .map((c: any) => ({ url: c.source_url, lastChecked: c.last_checked })),
    ]);
  }
  const pdf = await renderPack({ eventName, docs, sources });
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="hostready-pack.pdf"` } });
});
