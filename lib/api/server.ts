// Route-handler helpers. Server only: imports the service-role client.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { z } from "zod";
import type { PostgrestSingleResponse } from "@supabase/supabase-js";
import fixture from "../../fixtures/demo-event.json";
import { db } from "../supabase/admin";
import { supabaseServer } from "../supabase/server";
import { staticRules, type Rule } from "../rules";
import {
  EventProfile, CheckResult, DraftDocument,
  type CouncilSlug, type EventDocument, type Requirement, type SitePlan,
} from "../schemas";

export { fixture };

/** MOCK=1: past events for the dashboard and sidebar. Each opens as the demo event under its own name and date, all documents ready. */
export const MOCK_PAST = [
  { id: "past-carols", name: "Papanui Community Carols", date: "2025-12-13" },
  { id: "past-sumner", name: "Sumner Seaside Market", date: "2026-02-08" },
  { id: "past-rfc", name: "Riccarton RFC Fundraiser", date: "2026-03-14" },
  { id: "past-kites", name: "New Brighton Kite Day", date: "2026-04-12" },
  { id: "past-lanterns", name: "Lyttelton Winter Lantern Walk", date: "2026-06-20" },
];
export const mockPast = (id: string) => MOCK_PAST.find((e) => e.id === id);
/** MOCK=1: every route returns fixture data in the exact shape of the real response. No keys needed. */
export const MOCK = () => process.env.MOCK === "1";
export const MOCK_FIXED_COOKIE = "evntx_demo_fixed";
/** MOCK: set when this browser submits the demo prompt, so the demo event only lists after that. */
export const MOCK_STARTED_COOKIE = "evntx_demo_started";
export const mockReviewCookie = (id: string) => `evntx_demo_review_${id}`;
export const ok = (data: unknown) => NextResponse.json(data);
/** The demo's instant answers wait this long (DEMO_PAUSE_MS, default 1 s) so the audience sees the AI step happen. */
export const demoPause = () => {
  const ms = Number(process.env.DEMO_PAUSE_MS ?? 1000);
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
};

export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

/** Wraps a route so every thrown error becomes JSON `{ error }` with a status, never an HTML 500. */
export function handler<C>(fn: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status >= 500) console.error(e);
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });
    }
  };
}

export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  const r = schema.safeParse(await req.json().catch(() => ({})));
  if (!r.success) throw new HttpError(400, z.prettifyError(r.error));
  return r.data;
}

/** Returns data from a Supabase result, or throws its error. */
export function must<T>(res: PostgrestSingleResponse<T>): T {
  if (res.error) throw new HttpError(500, res.error.message);
  return res.data;
}

/** The caller's organisation id. First sign-in creates the organisation. MOCK returns the demo org. */
export async function requireOrg(): Promise<string> {
  if (MOCK()) return "demo-org";
  const { data: { user } } = await (await supabaseServer()).auth.getUser();
  if (!user) throw new HttpError(401, "Sign in first");
  const member = must(await db().from("memberships").select("org_id").eq("user_id", user.id).limit(1).maybeSingle());
  if (member) return member.org_id;
  const org = must(await db().from("organisations").insert({ name: user.email ?? "Guest organisation" }).select("id").single());
  const membership = await db().from("memberships").insert({ org_id: org.id, user_id: user.id });
  if (!membership.error) return org.id;
  // Another first request may have won the race. Remove this request's unused organisation.
  must(await db().from("organisations").delete().eq("id", org.id));
  if (membership.error.code === "23505") {
    const existing = must(await db().from("memberships").select("org_id").eq("user_id", user.id).single());
    return existing.org_id;
  }
  throw new HttpError(500, membership.error.message);
}

// Route [id] params are Postgres uuids. Anything else is a 404, not a 500 from an invalid uuid cast.
const RowId = z.guid();

/** An event the caller's org owns, or 404. */
export async function loadEvent(id: string, orgId: string) {
  if (!RowId.safeParse(id).success) throw new HttpError(404, `Event ${id} not found`);
  const row = must(await db().from("events").select("*, councils(slug)").eq("id", id).eq("org_id", orgId).maybeSingle());
  if (!row) throw new HttpError(404, `Event ${id} not found`);
  return {
    ...row,
    council: row.councils.slug as CouncilSlug,
    profile: row.profile ? EventProfile.parse(row.profile) : null,
  };
}

/** A document whose event the caller's org owns, or 404. */
export async function loadDocument(id: string, orgId: string) {
  if (!RowId.safeParse(id).success) throw new HttpError(404, `Document ${id} not found`);
  const row = must(await db().from("documents")
    .select("*, events!inner(org_id, council_id, description, profile, councils(slug))")
    .eq("id", id).eq("events.org_id", orgId).maybeSingle());
  if (!row) throw new HttpError(404, `Document ${id} not found`);
  const ev = row.events;
  return {
    row,
    event: { councilId: ev.council_id as string, council: ev.councils.slug as CouncilSlug, description: ev.description as string,
      profile: ev.profile ? EventProfile.parse(ev.profile) : null },
  };
}

export function requireProfile(ev: { profile: EventProfile | null }): EventProfile {
  if (!ev.profile) throw new HttpError(409, "Build the event profile first");
  return ev.profile;
}

/** Verified rules for one council. Rules published to Supabase override the static set by id. */
export async function loadRules(council: CouncilSlug): Promise<Rule[]> {
  const rows = must(await db().from("rules")
    .select("id, condition, outcome, source_url, source_quote, last_checked, councils!inner(slug)")
    .eq("verified", true).eq("councils.slug", council));
  const fromDb: Rule[] = rows.map((r: any) => ({ id: r.id, council, condition: r.condition, outcome: r.outcome,
    sourceUrl: r.source_url, sourceQuote: r.source_quote, lastChecked: r.last_checked, verified: true }));
  const ids = new Set(fromDb.map((r) => r.id));
  return [...staticRules.filter((r) => r.council === council && !ids.has(r.id)), ...fromDb];
}

type ChecklistItem = { id: string; text: string; sourceQuote?: string };

/** A checklist row's source: link, checked date and the council's wording per item. */
export const checklistSource = (row: { items: unknown; source_url: string | null; last_checked: string | null }) => ({
  url: row.source_url ?? "",
  lastChecked: row.last_checked,
  quotes: (row.items as ChecklistItem[]).flatMap((i) => (i.sourceQuote ? [{ itemId: i.id, quote: i.sourceQuote }] : [])),
});

/** The verified checklist for a document type, with its source for the "checked on" label. */
export async function loadChecklist(councilId: string, documentType: string) {
  const row = must(await db().from("checklists").select("items, source_url, last_checked")
    .eq("council_id", councilId).eq("document_type", documentType).eq("verified", true).maybeSingle());
  return row ? { items: row.items as ChecklistItem[], source: checklistSource(row) } : null;
}

/** A check is complete only when it covers every item in the verified council checklist exactly once. */
export function checklistCovered(r: CheckResult, checklist: readonly { id: string }[]): boolean {
  if (!checklist.length) return false;
  const expected = new Set(checklist.map((item) => item.id));
  const returned = new Set(r.items.map((item) => item.itemId));
  return expected.size === checklist.length && returned.size === r.items.length &&
    returned.size === expected.size && [...expected].every((id) => returned.has(id));
}

export function checkedStatus(r: CheckResult, checklist: readonly { id: string }[]): "ready" | "needs_fix" {
  if (!checklist.length) throw new HttpError(409, "No verified checklist is available");
  if (!checklistCovered(r, checklist)) {
    throw new HttpError(502, "The document check did not cover every council checklist item. Try checking it again.");
  }
  return r.items.every((item) => item.pass) ? "ready" : "needs_fix";
}

/** Ticketing needs exactly the required documents, with a complete passing check for every drafted type. */
export function documentsReadyForTicketing(
  requiredTypes: ReadonlySet<string>,
  docs: readonly { document_type: string; status: string; content: unknown; check_results: unknown }[],
  checklists: ReadonlyMap<string, readonly { id: string }[]>,
): boolean {
  if (!requiredTypes.size || docs.length !== requiredTypes.size) return false;
  return docs.every((doc) => {
    if (!requiredTypes.has(doc.document_type)) return false;
    if (doc.status === "manual") return true;
    if (doc.status !== "ready" || !doc.content) return false;
    const result = CheckResult.safeParse(doc.check_results);
    return result.success && checklistCovered(result.data, checklists.get(doc.document_type) ?? []) &&
      result.data.items.every((item) => item.pass);
  });
}

/** Deletes an event's rows of `table` whose document_type is no longer required. */
export async function pruneTypes(table: "requirements" | "documents" | "deadlines", eventId: string, keep: string[]) {
  const q = db().from(table).delete().eq("event_id", eventId);
  must(await (keep.length ? q.not("document_type", "in", `(${keep.join(",")})`) : q));
}

export const toRequirement = (r: any): Requirement => ({
  documentType: r.document_type, reason: r.reason, ruleId: r.rule_id, sourceUrl: r.source_url ?? "", lastChecked: r.last_checked,
});

export const toEventDocument = (d: any, checklistSource: EventDocument["checklistSource"] = null): EventDocument => ({
  id: d.id,
  documentType: d.document_type,
  status: d.status,
  content: d.content ? DraftDocument.parse(d.content) : null,
  checkResults: d.check_results ? CheckResult.parse(d.check_results) : null,
  reviewed: !!d.reviewed_at,
  checklistSource,
});

// MOCK draft edits live in the visitor's own browser (a compressed cookie per document), like the review ticks:
// any Vercel function can read them, and one visitor's demo never shows up for another.
export const mockEditCookie = (id: string) => `evntx_demo_edit_${id}`;
const EDIT_LIMIT = 3800; // bytes; browsers keep about 4 KB per cookie
/** Cookie value for an edited draft, or null when it's too long to keep. */
export const packEdit = (content: DraftDocument) => {
  const v = deflateRawSync(JSON.stringify(content)).toString("base64url");
  return v.length <= EDIT_LIMIT ? v : null;
};
/** This browser's MOCK draft edits, by document id. */
export async function mockEdits(): Promise<Record<string, DraftDocument>> {
  const jar = await cookies();
  const out: Record<string, DraftDocument> = {};
  for (const d of fixture.documents) {
    const v = jar.get(mockEditCookie(d.id))?.value;
    if (!v) continue;
    try { out[d.id] = DraftDocument.parse(JSON.parse(inflateRawSync(Buffer.from(v, "base64url")).toString())); } catch { /* stale or bad cookie: ignore */ }
  }
  return out;
}
/** A fixture document with this browser's edit, if any. */
export const withMockEdit = <T extends { id: string; content: unknown }>(d: T, edits: Record<string, DraftDocument>) =>
  edits[d.id] ? { ...d, content: edits[d.id] } : d;
/** The saved MOCK site plan (null: the default layout). The canvas isn't on screen any more. */
export const mockSitePlan: { plan: SitePlan | null } = { plan: null };
export const resetMock = () => { mockSitePlan.plan = null; };

/** MOCK lookup for the document routes. */
export function mockDocument(id: string) {
  const doc = fixture.documents.find((d) => d.id === id);
  if (!doc) throw new HttpError(404, `Document ${id} not found in the fixture`);
  return doc;
}

/** What a council-format PDF needs per document: the council's name, its template source and checklist source. */
export async function loadPackInfo(councilId: string, rows: readonly { document_type: string; content: unknown }[]) {
  const [council, templates, lists] = await Promise.all([
    db().from("councils").select("name").eq("id", councilId).single(),
    db().from("templates").select("document_type, source_url").eq("council_id", councilId),
    db().from("checklists").select("document_type, source_url, last_checked").eq("council_id", councilId).eq("verified", true),
  ]);
  const templateUrl = new Map(must(templates).map((t: any) => [t.document_type, t.source_url as string | null]));
  const checklist = new Map(must(lists).map((c: any) => [c.document_type, { url: c.source_url ?? "", lastChecked: c.last_checked }]));
  return {
    council: must(council).name as string,
    docs: rows.flatMap((d) => d.content ? [{ doc: DraftDocument.parse(d.content), templateUrl: templateUrl.get(d.document_type) ?? null,
      checklist: checklist.get(d.document_type) ?? null }] : []),
  };
}
