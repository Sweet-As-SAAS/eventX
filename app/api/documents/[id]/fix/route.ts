import { z } from "zod";
import { NextResponse } from "next/server";
import { db } from "@/lib/supabase/admin";
import { applyFix, checkDocument } from "@/lib/ai/check";
import { withDemoFallback, isSeeded } from "@/lib/ai/demo";
import { CheckResult, DraftDocument } from "@/lib/schemas";
import { MOCK, MOCK_FIXED_COOKIE, ok, fixture, handler, parseBody, requireOrg, loadDocument, loadChecklist, must, toEventDocument, mockDocument, checkedStatus, HttpError } from "@/lib/api/server";

export const maxDuration = 60;

const Body = z.object({ itemId: z.string() });

/** Applies the suggested fix for one failed checklist item, then re-checks, so red turns green in one click. */
export const POST = handler(async (req, ctx: RouteContext<"/api/documents/[id]/fix">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  const { itemId } = await parseBody(req, Body);
  if (MOCK()) {
    const doc = mockDocument(id);
    const failed = doc.checkResults?.items.find((item) => item.itemId === itemId && !item.pass && item.suggestedFix);
    if (!failed || id !== fixture.fixedDocument.id) throw new HttpError(409, `No suggested fix for item ${itemId}`);
    const response = NextResponse.json(fixture.fixedDocument);
    response.cookies.set(MOCK_FIXED_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 3600 });
    return response;
  }
  const { row, event } = await loadDocument(id, orgId);
  const item = (row.check_results ? CheckResult.parse(row.check_results) : null)?.items.find((i) => i.itemId === itemId);
  if (!item || item.pass || !item.suggestedFix) throw new HttpError(409, `No suggested fix for item ${itemId}`);
  const checklist = await loadChecklist(event.councilId, row.document_type);
  if (!checklist?.items.length) throw new HttpError(409, `No verified checklist for ${row.document_type} yet`);

  const fixed = isSeeded(event) && row.document_type === fixture.fixedDocument.documentType ? fixture.fixedDocument : null;
  const { content, result } = await withDemoFallback(async () => {
    const content = await applyFix(DraftDocument.parse(row.content), item.suggestedFix!);
    return { content, result: await checkDocument(content, checklist.items) };
  }, fixed && { content: DraftDocument.parse(fixed.content), result: CheckResult.parse(fixed.checkResults) });

  const updated = must(await db().from("documents").update({ content, check_results: result, status: checkedStatus(result, checklist.items),
    updated_at: new Date().toISOString() }).eq("id", id).select("*").single());
  return ok(toEventDocument(updated, checklist?.source ?? null));
});
