import { z } from "zod";
import { cookies } from "next/headers";
import { db } from "@/lib/supabase/admin";
import { createEventbriteDraft, eventbriteDraftUrl } from "@/lib/integrations/eventbrite";
import { withDemoFallback, isSeeded } from "@/lib/ai/demo";
import { Ticket, type EventbriteDraft } from "@/lib/schemas";
import { MOCK, MOCK_FIXED_COOKIE, mockReviewCookie, fixture, ok, handler, parseBody, requireOrg, loadEvent, requireProfile, must, HttpError, documentsReadyForTicketing } from "@/lib/api/server";

export const maxDuration = 60;

const Body = z.object({
  tickets: z.array(Ticket).min(1).max(10).default([{ name: "General admission", priceCents: null }]),
});

const demoDraft = (): EventbriteDraft | null =>
  process.env.EVENTBRITE_DEMO_DRAFT_URL ? { id: "demo", url: process.env.EVENTBRITE_DEMO_DRAFT_URL } : null;

const UNREAD = "Read each document and tick it as checked before tickets go on sale";

/** Creates an Eventbrite DRAFT. Locked until every document is ready or manual: no tickets before the paperwork is in order. */
export const POST = handler(async (req, ctx: RouteContext<"/api/events/[id]/eventbrite">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  const { tickets } = await parseBody(req, Body);
  if (MOCK()) {
    const cookieStore = await cookies();
    if (id !== "demo" || cookieStore.get(MOCK_FIXED_COOKIE)?.value !== "1") {
      throw new HttpError(409, "Every checklist must be green before tickets go on sale");
    }
    if (fixture.documents.some((d) => d.status !== "manual" && cookieStore.get(mockReviewCookie(d.id))?.value !== "1")) throw new HttpError(409, UNREAD);
    return ok(demoDraft() ?? { id: "mock", url: "https://www.eventbrite.com/organizations/events" });
  }
  const ev = await loadEvent(id, orgId);
  const [documents, lists, requirements] = await Promise.all([
    db().from("documents").select("document_type, status, content, check_results, reviewed_at").eq("event_id", id),
    db().from("checklists").select("document_type, items").eq("council_id", ev.council_id).eq("verified", true),
    db().from("requirements").select("document_type").eq("event_id", id),
  ]);
  const docs = must(documents);
  const requiredTypes = new Set(must(requirements).map((r) => r.document_type));
  const checklists = new Map(must(lists).map((list) => [list.document_type, list.items as { id: string }[]]));
  if (!documentsReadyForTicketing(requiredTypes, docs, checklists)) {
    throw new HttpError(409, "Every checklist must be green before tickets go on sale");
  }
  if (docs.some((d) => requiredTypes.has(d.document_type) && d.status !== "manual" && !d.reviewed_at)) throw new HttpError(409, UNREAD);
  const profile = requireProfile(ev);
  if (!profile.name.value || !profile.peakAttendance.value || profile.peakAttendance.value < 1 ||
    !profile.date.value || !profile.startTime.value || !profile.endTime.value) {
    throw new HttpError(409, "Add the event name, date, times and peak attendance before creating an Eventbrite draft");
  }
  if (ev.eventbrite_event_id) {
    if (ev.eventbrite_event_id === "demo") {
      const cached = isSeeded(ev) ? demoDraft() : null;
      if (cached) return ok(cached);
    } else {
      return ok({ id: ev.eventbrite_event_id, url: eventbriteDraftUrl(ev.eventbrite_event_id) } satisfies EventbriteDraft);
    }
  }
  const draft = await withDemoFallback(() => createEventbriteDraft(profile, tickets), isSeeded(ev) ? demoDraft() : null);
  must(await db().from("events").update({ eventbrite_event_id: draft.id, status: "ticketing" }).eq("id", id));
  return ok(draft);
});
