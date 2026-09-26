import { z } from "zod";
import { cookies } from "next/headers";
import { db } from "@/lib/supabase/admin";
import { MOCK, MOCK_FIXED_COOKIE, ok, fixture, handler, parseBody, requireOrg, loadDocument, loadChecklist, must, toEventDocument, mockDocument, withMockChanges, setMockChanges, HttpError } from "@/lib/api/server";

const Body = z.object({ reviewed: z.boolean() });
const RED = "Fix the red checklist items before you tick this one";

/** The organiser's "I've read this draft and checked it". Only a draft with no red checklist items can be ticked. */
export const POST = handler(async (req, ctx: RouteContext<"/api/documents/[id]/review">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  const { reviewed } = await parseBody(req, Body);
  if (MOCK()) {
    const fixed = (await cookies()).get(MOCK_FIXED_COOKIE)?.value === "1";
    const doc = withMockChanges(fixed && id === fixture.fixedDocument.id ? fixture.fixedDocument : mockDocument(id));
    if (reviewed && doc.status !== "ready") throw new HttpError(409, RED);
    setMockChanges(id, { reviewed });
    return ok(withMockChanges(doc));
  }
  const { row, event } = await loadDocument(id, orgId);
  if (reviewed && row.status !== "ready") throw new HttpError(409, RED);
  const updated = must(await db().from("documents").update({ reviewed_at: reviewed ? new Date().toISOString() : null })
    .eq("id", id).select("*").single());
  const checklist = await loadChecklist(event.councilId, row.document_type);
  return ok(toEventDocument(updated, checklist?.source ?? null));
});
