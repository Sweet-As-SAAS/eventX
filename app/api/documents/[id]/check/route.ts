import { db } from "@/lib/supabase/admin";
import { checkDocument } from "@/lib/ai/check";
import { withDemoFallback, isSeeded } from "@/lib/ai/demo";
import { CheckResult, DraftDocument } from "@/lib/schemas";
import { MOCK, ok, fixture, handler, requireOrg, loadDocument, loadChecklist, must, toEventDocument, mockDocument, checkedStatus, HttpError } from "@/lib/api/server";

export const maxDuration = 60;

/** Step 6: check a draft against the council's verified checklist, item by item. */
export const POST = handler(async (_req, ctx: RouteContext<"/api/documents/[id]/check">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  if (MOCK()) return ok(mockDocument(id));
  const { row, event } = await loadDocument(id, orgId);
  if (!row.content) throw new HttpError(409, "Draft the document first");
  const checklist = await loadChecklist(event.councilId, row.document_type);
  if (!checklist?.items.length) throw new HttpError(409, `No verified checklist for ${row.document_type} yet`);

  const cached = isSeeded(event) ? fixture.documents.find((d) => d.documentType === row.document_type)?.checkResults : null;
  const result = await withDemoFallback(() => checkDocument(DraftDocument.parse(row.content), checklist.items),
    cached ? CheckResult.parse(cached) : null);

  const updated = must(await db().from("documents").update({ check_results: result, status: checkedStatus(result),
    updated_at: new Date().toISOString() }).eq("id", id).select("*").single());
  return ok(toEventDocument(updated, checklist.source));
});
