import { z } from "zod";
import { db } from "@/lib/supabase/admin";
import { applyFix, checkDocument } from "@/lib/ai/check";
import { withDemoFallback, isSeeded } from "@/lib/ai/demo";
import { CheckResult, DraftDocument } from "@/lib/schemas";
import { MOCK, ok, fixture, handler, parseBody, requireOrg, loadDocument, loadChecklist, must, toEventDocument, mockDocument, checkedStatus, HttpError } from "@/lib/api/server";

export const maxDuration = 60;

const Body = z.object({ itemId: z.string() });

/** Applies the suggested fix for one failed checklist item, then re-checks, so red turns green in one click. */
export const POST = handler(async (req, ctx: RouteContext<"/api/documents/[id]/fix">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  const { itemId } = await parseBody(req, Body);
  if (MOCK()) return ok(id === fixture.fixedDocument.id ? fixture.fixedDocument : mockDocument(id));
  const { row, event } = await loadDocument(id, orgId);
  const item = (row.check_results ? CheckResult.parse(row.check_results) : null)?.items.find((i) => i.itemId === itemId);
  if (!item?.suggestedFix) throw new HttpError(409, `No suggested fix for item ${itemId}`);
  const checklist = await loadChecklist(event.councilId, row.document_type);

  const fixed = isSeeded(event) && row.document_type === fixture.fixedDocument.documentType ? fixture.fixedDocument : null;
  const { content, result } = await withDemoFallback(async () => {
    const content = await applyFix(DraftDocument.parse(row.content), item.suggestedFix!);
    return { content, result: await checkDocument(content, checklist?.items ?? []) };
  }, fixed && { content: DraftDocument.parse(fixed.content), result: CheckResult.parse(fixed.checkResults) });

  const updated = must(await db().from("documents").update({ content, check_results: result, status: checkedStatus(result),
    updated_at: new Date().toISOString() }).eq("id", id).select("*").single());
  return ok(toEventDocument(updated, checklist?.source ?? null));
});
