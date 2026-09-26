import { z } from "zod";
import { cookies } from "next/headers";
import { db } from "@/lib/supabase/admin";
import { DraftDocument } from "@/lib/schemas";
import { MOCK, MOCK_FIXED_COOKIE, mockReviewCookie, ok, fixture, handler, parseBody, requireOrg, loadDocument, loadChecklist, must, toEventDocument, mockDocument, mockEdits, withMockEdit, mockEditCookie, packEdit, HttpError } from "@/lib/api/server";

const Body = z.object({ sections: z.array(z.object({ heading: z.string().trim().min(1).max(200), body: z.string().max(8000) })).min(1).max(40) });
const placeholders = (sections: { body: string }[]) => [...new Set(sections.flatMap((s) => s.body.match(/\[[^\[\]\n]+\]/g) ?? []))];

/** The organiser's own edits to a draft, saved as written. The tick clears, and the client re-runs the council check. */
export const POST = handler(async (req, ctx: RouteContext<"/api/documents/[id]/edit">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  const { sections } = await parseBody(req, Body);
  if (MOCK()) {
    const fixed = (await cookies()).get(MOCK_FIXED_COOKIE)?.value === "1";
    const doc = withMockEdit(fixed && id === fixture.fixedDocument.id ? fixture.fixedDocument : mockDocument(id), await mockEdits());
    if (!doc.content) throw new HttpError(409, "Draft the document first");
    // MOCK has no checker, so the checklist result stays as it was. The edit is kept in this browser.
    const content = DraftDocument.parse({ ...doc.content, sections, placeholders: placeholders(sections) });
    const packed = packEdit(content);
    if (!packed) throw new HttpError(413, "That's too much text to keep in the demo. Shorten it a little.");
    const response = ok({ ...doc, content, reviewed: false });
    response.cookies.set(mockEditCookie(id), packed, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 3600 });
    response.cookies.delete(mockReviewCookie(id));
    return response;
  }
  const { row, event } = await loadDocument(id, orgId);
  if (!row.content) throw new HttpError(409, "Draft the document first");
  const content = DraftDocument.parse({ ...row.content, sections, placeholders: placeholders(sections) });
  const updated = must(await db().from("documents").update({ content, check_results: null, status: "drafted", reviewed_at: null,
    updated_at: new Date().toISOString() }).eq("id", id).select("*").single());
  const checklist = await loadChecklist(event.councilId, row.document_type);
  return ok(toEventDocument(updated, checklist?.source ?? null));
});
