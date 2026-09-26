import { cookies } from "next/headers";
import { db } from "@/lib/supabase/admin";
import { renderDoc, pdfName } from "@/lib/pdf/pack";
import { OFFICIAL_FORM, officialForm } from "@/lib/pdf/official";
import { nzToday } from "@/lib/deadlines";
import { DraftDocument, EventProfile, type DocumentType, type Licence } from "@/lib/schemas";
import { MOCK, MOCK_FIXED_COOKIE, fixture, handler, requireOrg, loadDocument, loadPackInfo, mockDocument, withMockChanges, must, HttpError } from "@/lib/api/server";

export const maxDuration = 60;

/** One drafted document as its own PDF. The special licence is the council's own form, filled in. ?view=1 opens it in the browser. */
export const GET = handler(async (req, ctx: RouteContext<"/api/documents/[id]/export">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  const view = new URL(req.url).searchParams.get("view") === "1";
  if (MOCK()) {
    const fixed = id === fixture.fixedDocument.id && (await cookies()).get(MOCK_FIXED_COOKIE)?.value === "1";
    const d = withMockChanges(fixed ? fixture.fixedDocument : mockDocument(id));
    if (!d.content) throw new HttpError(409, "Draft the document first");
    const doc = DraftDocument.parse(d.content);
    const profile = EventProfile.parse(fixture.profile);
    const form = await officialForm(doc.documentType, profile, doc, fixture.licences, nzToday());
    if (form) return file(form, `${profile.name.value} ${OFFICIAL_FORM[doc.documentType]}`, view);
    const pdf = await renderDoc({ event: { name: fixture.profile.name.value, profile }, item: { doc, checklist: d.checklistSource ?? null } });
    return file(pdf, doc.title, view);
  }
  const { row, event } = await loadDocument(id, orgId);
  if (!row.content) throw new HttpError(409, "Draft the document first");
  if (OFFICIAL_FORM[row.document_type as DocumentType] && event.profile) {
    const rows = must(await db().from("licences").select("*").eq("org_id", orgId));
    const licences = rows.map((l: any): Licence => ({ id: l.id, type: l.type, holderName: l.holder_name, expiresOn: l.expires_on }));
    const form = await officialForm(row.document_type, event.profile, DraftDocument.parse(row.content), licences, nzToday());
    if (form) return file(form, `${event.profile.name.value ?? "Event"} ${OFFICIAL_FORM[row.document_type as DocumentType]}`, view);
  }
  const info = await loadPackInfo(event.councilId, [row]);
  const item = info.docs[0]!;
  const pdf = await renderDoc({ event: { name: event.profile?.name.value ?? "Event", council: info.council, profile: event.profile }, item });
  return file(pdf, item.doc.title, view);
});

const file = (pdf: Uint8Array, title: string, view = false) => new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf",
  "Content-Disposition": `${view ? "inline" : "attachment"}; filename="${pdfName(title)}"` } });
