import { cookies } from "next/headers";
import { renderDoc, pdfName } from "@/lib/pdf/pack";
import { DraftDocument, EventProfile } from "@/lib/schemas";
import { MOCK, MOCK_FIXED_COOKIE, fixture, handler, requireOrg, loadDocument, loadPackInfo, mockDocument, HttpError } from "@/lib/api/server";

export const maxDuration = 60;

/** One drafted document as its own PDF, laid out to the council's template. */
export const GET = handler(async (_req, ctx: RouteContext<"/api/documents/[id]/export">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  let pdf: Buffer;
  if (MOCK()) {
    const fixed = id === fixture.fixedDocument.id && (await cookies()).get(MOCK_FIXED_COOKIE)?.value === "1";
    const d = fixed ? fixture.fixedDocument : mockDocument(id);
    if (!d.content) throw new HttpError(409, "Draft the document first");
    const doc = DraftDocument.parse(d.content);
    pdf = await renderDoc({ event: { name: fixture.profile.name.value, profile: EventProfile.parse(fixture.profile) },
      item: { doc, checklist: d.checklistSource } });
    return file(pdf, doc.title);
  }
  const { row, event } = await loadDocument(id, orgId);
  if (!row.content) throw new HttpError(409, "Draft the document first");
  const info = await loadPackInfo(event.councilId, [row]);
  const item = info.docs[0]!;
  pdf = await renderDoc({ event: { name: event.profile?.name.value ?? "Event", council: info.council, profile: event.profile }, item });
  return file(pdf, item.doc.title);
});

const file = (pdf: Buffer, title: string) => new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf",
  "Content-Disposition": `attachment; filename="${pdfName(title)}"` } });
