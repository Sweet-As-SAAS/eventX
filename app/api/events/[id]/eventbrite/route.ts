import { z } from "zod";
import { db } from "@/lib/supabase/admin";
import { createEventbriteDraft } from "@/lib/integrations/eventbrite";
import { withDemoFallback } from "@/lib/ai/demo";
import { Ticket, type EventbriteDraft } from "@/lib/schemas";
import { MOCK, ok, handler, parseBody, requireOrg, loadEvent, requireProfile, must, HttpError } from "@/lib/api/server";

export const maxDuration = 60;

const Body = z.object({
  tickets: z.array(Ticket).min(1).max(10).default([{ name: "General admission", priceCents: null }]),
});

const demoDraft = (): EventbriteDraft | null =>
  process.env.EVENTBRITE_DEMO_DRAFT_URL ? { id: "demo", url: process.env.EVENTBRITE_DEMO_DRAFT_URL } : null;

/** Creates an Eventbrite DRAFT. Locked until every document is ready or manual: no tickets before the paperwork is in order. */
export const POST = handler(async (req, ctx: RouteContext<"/api/events/[id]/eventbrite">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  const { tickets } = await parseBody(req, Body);
  if (MOCK()) return ok(demoDraft() ?? { id: "mock", url: "https://www.eventbrite.com/organizations/events" });
  const ev = await loadEvent(id, orgId);
  const docs = must(await db().from("documents").select("status").eq("event_id", id));
  if (!docs.length || docs.some((d: any) => d.status !== "ready" && d.status !== "manual")) {
    throw new HttpError(409, "Every checklist must be green before tickets go on sale");
  }
  const draft = await withDemoFallback(() => createEventbriteDraft(requireProfile(ev), tickets), demoDraft());
  must(await db().from("events").update({ eventbrite_event_id: draft.id, status: "ticketing" }).eq("id", id));
  return ok(draft);
});
