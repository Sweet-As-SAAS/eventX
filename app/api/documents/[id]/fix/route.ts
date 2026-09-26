import { z } from "zod";
import { NextResponse } from "next/server";
import { db } from "@/lib/supabase/admin";
import { applyFix, checkDocument } from "@/lib/ai/check";
import { withDemoFallback, isSeeded } from "@/lib/ai/demo";
import { CheckResult, DraftDocument } from "@/lib/schemas";
import { MOCK, MOCK_FIXED_COOKIE, ok, fixture, handler, parseBody, requireOrg, loadDocument, loadChecklist, must, toEventDocument, mockDocument, checkedStatus, HttpError } from "@/lib/api/server";

export const maxDuration = 60;

// text: the organiser's own answer (a name, a provider, a menu) for facts HostReady must never invent.
const Body = z.object({ itemId: z.string(), text: z.string().trim().min(1).max(1500).optional() });

/** Applies the suggested fix (or the organiser's own answer) for one failed checklist item, then re-checks. */
export const POST = handler(async (req, ctx: RouteContext<"/api/documents/[id]/fix">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  const { itemId, text } = await parseBody(req, Body);
  if (MOCK()) {
    const doc = mockDocument(id);
    const failed = doc.checkResults?.items.find((item) => item.itemId === itemId && !item.pass);
    if (!failed || id !== fixture.fixedDocument.id) throw new HttpError(409, `No suggested fix for item ${itemId}`);
    const response = NextResponse.json(fixture.fixedDocument);
    response.cookies.set(MOCK_FIXED_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 3600 });
    return response;
  }
  const { row, event } = await loadDocument(id, orgId);
  const item = (row.check_results ? CheckResult.parse(row.check_results) : null)?.items.find((i) => i.itemId === itemId);
  if (!item || item.pass) throw new HttpError(409, `Item ${itemId} has nothing to fix`);
  const checklist = await loadChecklist(event.councilId, row.document_type);
  if (!checklist?.items.length) throw new HttpError(409, `No verified checklist for ${row.document_type} yet`);

  // No suggestion (the checker sometimes returns none): ask for text that satisfies the item from the draft's own facts.
  const instruction = text
    ? `Satisfy this council checklist item: ${item.text}\n${item.suggestedFix ? `Suggested text: ${item.suggestedFix}\n` : ""}` +
      `The organiser supplied these facts. Use them verbatim, replacing any matching [PLACEHOLDER]:\n${text}`
    : item.suggestedFix ??
      `Add ready-to-lodge text so the document clearly satisfies this council checklist item: ${item.text}\n` +
      "Use only facts already in the document. Where a fact is unknown, keep a descriptive [PLACEHOLDER].";
  // The cached demo fix ignores the organiser's words, so it only stands in for the one-click fix.
  const fixed = !text && isSeeded(event) && row.document_type === fixture.fixedDocument.documentType ? fixture.fixedDocument : null;
  const { content, result } = await withDemoFallback(async () => {
    const content = await applyFix(DraftDocument.parse(row.content), instruction, text);
    return { content, result: await checkDocument(content, checklist.items) };
  }, fixed && { content: DraftDocument.parse(fixed.content), result: CheckResult.parse(fixed.checkResults) });

  const updated = must(await db().from("documents").update({ content, check_results: result, status: checkedStatus(result, checklist.items),
    updated_at: new Date().toISOString() }).eq("id", id).select("*").single());
  return ok(toEventDocument(updated, checklist?.source ?? null));
});
