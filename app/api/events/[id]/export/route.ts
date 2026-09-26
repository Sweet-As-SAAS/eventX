import { db } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { renderPack, pdfName, type PackDoc, type PackEvent, type PackSource } from "@/lib/pdf/pack";
import { appendPdf, fillSpecialLicence } from "@/lib/pdf/special-licence";
import { nzToday } from "@/lib/deadlines";
import { DraftDocument, EventProfile, type Licence } from "@/lib/schemas";
import { MOCK, MOCK_FIXED_COOKIE, fixture, handler, requireOrg, loadEvent, loadPackInfo, must, withMockChanges } from "@/lib/api/server";

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
  const fixed = MOCK() && (await cookies()).get(MOCK_FIXED_COOKIE)?.value === "1";
  let event: PackEvent = { name: fixture.profile.name.value, profile: EventProfile.parse(fixture.profile) };
  let docs: PackDoc[] = fixture.documents.flatMap((d) => {
    const content = withMockChanges(fixed && d.id === fixture.fixedDocument.id ? fixture.fixedDocument : d).content;
    return content ? [{ doc: DraftDocument.parse(content), checklist: d.checklistSource }] : [];
  });
  let licences: Licence[] = fixture.licences;
  let sources = uniqueSources([
    ...fixture.requirements.map((r) => ({ url: r.sourceUrl, lastChecked: r.lastChecked })),
    ...fixture.documents.flatMap((d) => d.checklistSource ? [d.checklistSource] : []),
  ]);
  if (!MOCK()) {
    const ev = await loadEvent(id, orgId);
    const [documentRows, requirementRows, checklistRows] = await Promise.all([
      db().from("documents").select("document_type, content").eq("event_id", id),
      db().from("requirements").select("source_url, last_checked").eq("event_id", id),
      db().from("checklists").select("document_type, source_url, last_checked")
        .eq("council_id", ev.council_id).eq("verified", true),
    ]);
    const rows = must(documentRows);
    licences = must(await db().from("licences").select("*").eq("org_id", orgId))
      .map((l: any): Licence => ({ id: l.id, type: l.type, holderName: l.holder_name, expiresOn: l.expires_on }));
    const info = await loadPackInfo(ev.council_id, rows);
    event = { name: ev.profile?.name.value ?? "Event", council: info.council, profile: ev.profile };
    docs = info.docs;
    const documentTypes = new Set(rows.map((d: any) => d.document_type));
    sources = uniqueSources([
      ...must(requirementRows).map((r: any) => ({ url: r.source_url, lastChecked: r.last_checked })),
      ...must(checklistRows).filter((c: any) => documentTypes.has(c.document_type))
        .map((c: any) => ({ url: c.source_url, lastChecked: c.last_checked })),
    ]);
  }
  // The special licence goes in as the council's own form, filled in, after the other documents.
  const licence = docs.find((d) => d.doc.documentType === "special_licence_application");
  let pdf: Uint8Array = await renderPack({ event, docs: docs.filter((d) => d !== licence), sources });
  if (licence && event.profile) pdf = await appendPdf(pdf, await fillSpecialLicence(event.profile, licence.doc, licences, nzToday(), true));
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${pdfName(`${event.name} council pack`)}"` } });
});
