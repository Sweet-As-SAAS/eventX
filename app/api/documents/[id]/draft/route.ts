import { db } from "@/lib/supabase/admin";
import { draftDocument } from "@/lib/ai/draft";
import { withDemoFallback, isSeeded } from "@/lib/ai/demo";
import { DRAFTED_TYPES, DraftDocument, DocumentType } from "@/lib/schemas";
import { MOCK, MOCK_FIXED_COOKIE, mockReviewCookie, ok, fixture, handler, requireOrg, loadDocument, loadChecklist, requireProfile, must, toEventDocument, mockDocument, mockEditCookie, HttpError } from "@/lib/api/server";

export const maxDuration = 60;

/** Step 5 for one document: draft it from the profile, the council template, its checklist and retrieved council text. */
export const POST = handler(async (_req, ctx: RouteContext<"/api/documents/[id]/draft">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  if (MOCK()) {
    const doc = mockDocument(id);
    if (!DRAFTED_TYPES.has(DocumentType.parse(doc.documentType))) {
      throw new HttpError(409, `EvntX does not draft ${doc.documentType}`);
    }
    const response = ok({ ...doc, status: "drafted", checkResults: null });
    if (id === fixture.fixedDocument.id) response.cookies.delete(MOCK_FIXED_COOKIE);
    response.cookies.delete(mockReviewCookie(id));
    response.cookies.delete(mockEditCookie(id));
    return response;
  }
  const { row, event } = await loadDocument(id, orgId);
  const type = DocumentType.parse(row.document_type);
  if (!DRAFTED_TYPES.has(type)) throw new HttpError(409, `EvntX does not draft ${type}`);
  const profile = requireProfile(event);

  const [template, checklist] = await Promise.all([
    db().from("templates").select("sections").eq("council_id", event.councilId).eq("document_type", type).maybeSingle(),
    loadChecklist(event.councilId, type),
  ]);
  const sections = must(template)?.sections as string[] | undefined;
  if (!sections?.length) throw new HttpError(409, `No council template published for ${type} yet`);
  if (!checklist?.items.length) throw new HttpError(409, `No verified checklist published for ${type} yet`);

  const cached = isSeeded(event) ? fixture.documents.find((d) => d.documentType === type)?.content : null;
  const content = await withDemoFallback(() => draftDocument(profile, type, { sections, checklist: checklist.items }),
    cached ? DraftDocument.parse(cached) : null);

  const updated = must(await db().from("documents").update({ content, check_results: null, status: "drafted", reviewed_at: null,
    updated_at: new Date().toISOString() }).eq("id", id).select("*").single());
  return ok(toEventDocument(updated, checklist?.source ?? null));
});
