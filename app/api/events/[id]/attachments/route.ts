import { db } from "@/lib/supabase/admin";
import type { Attachment, SiteReview } from "@/lib/schemas";
import { MOCK, ok, handler, requireOrg, loadEvent, mockUploads, HttpError } from "@/lib/api/server";

// Photos and PDFs the organiser adds with their description (a site plan, a menu, a map). Private: stored under
// uploads/<event id>/ in the knowledge-base bucket, served back only through this route.
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = /^(image\/(png|jpeg|webp|gif|heic)|application\/pdf)$/;
const BUCKET = "kb";
const safeName = (name: string) => name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
/** MOCK: the review the AI gives the demo site plan picture, ready in advance. */
const DEMO_REVIEW: SiteReview = {
  issue: "Emergency assembly point may be poorly located",
  detail: "The designated meet-up zone is positioned within a high-traffic area and close to the audience evacuation route.",
  fix: "Relocate the emergency meet-up zone to a clear area near the event perimeter, away from the stage, bar, kids zone, and main pedestrian exit routes.",
  from: { left: 34.2, top: 32.4, width: 8.6, height: 13.6 },
  to: { left: 15.8, top: 40.6, width: 7.8, height: 10.6 },
  toLabel: "Open lawn just outside the west edge",
};
/** MOCK: the demo event's site plan picture is ready before anything is uploaded. */
const DEMO_PHOTO: Attachment = { name: "Hagley Summer Sounds site plan.png", type: "image/png", url: "/demo/hagley-summer-sounds-site-plan.png", review: DEMO_REVIEW };

/** The event's attachments, or with ?file=<name> that file's bytes. */
export const GET = handler(async (req, ctx: RouteContext<"/api/events/[id]/attachments">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  const file = new URL(req.url).searchParams.get("file");
  const url = (name: string) => `/api/events/${id}/attachments?file=${encodeURIComponent(name)}`;
  if (MOCK()) {
    const list = mockUploads.get(id) ?? [];
    if (file) {
      const f = list.find((x) => x.name === file);
      if (!f) throw new HttpError(404, "No such file");
      return new Response(new Uint8Array(f.data), { headers: { "Content-Type": f.type } });
    }
    // The first picture gets the demo review, so attaching the demo site plan in the first prompt shows it too.
    const first = list.find((f) => f.type.startsWith("image/"));
    return ok(list.length ? list.map((f): Attachment => ({ name: f.name, type: f.type, url: url(f.name), review: f === first ? DEMO_REVIEW : null })) : [DEMO_PHOTO]);
  }
  await loadEvent(id, orgId);
  const store = db().storage.from(BUCKET);
  if (file) {
    const { data, error } = await store.download(`uploads/${id}/${safeName(file)}`);
    if (error || !data) throw new HttpError(404, "No such file");
    return new Response(data, { headers: { "Content-Type": data.type || "application/octet-stream" } });
  }
  const { data, error } = await store.list(`uploads/${id}`);
  if (error) throw new HttpError(500, error.message);
  return ok((data ?? []).map((o): Attachment => ({ name: o.name, type: o.metadata?.mimetype ?? "application/octet-stream", url: url(o.name), review: null })));
});

/** One file per request (multipart, field "file"). */
export const POST = handler(async (req, ctx: RouteContext<"/api/events/[id]/attachments">) => {
  const orgId = await requireOrg();
  const { id } = await ctx.params;
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Attach a file");
  if (!ALLOWED.test(file.type)) throw new HttpError(400, "Only photos and PDFs can be attached");
  if (file.size > MAX_BYTES) throw new HttpError(400, "Files can be up to 10 MB");
  const name = safeName(file.name);
  const data = Buffer.from(await file.arrayBuffer());
  if (MOCK()) {
    // ponytail: MOCK keeps uploads in server memory; they reset on restart or a new MOCK event.
    mockUploads.set(id, [...(mockUploads.get(id) ?? []).filter((f) => f.name !== name), { name, type: file.type, data }]);
    return ok({ name, type: file.type, url: `/api/events/${id}/attachments?file=${encodeURIComponent(name)}`, review: null } satisfies Attachment);
  }
  await loadEvent(id, orgId);
  const { error } = await db().storage.from(BUCKET).upload(`uploads/${id}/${name}`, data, { contentType: file.type, upsert: true });
  if (error) throw new HttpError(500, error.message);
  return ok({ name, type: file.type, url: `/api/events/${id}/attachments?file=${encodeURIComponent(name)}`, review: null } satisfies Attachment);
});
