// Route-handler helpers. Server only: imports the service-role client.
import { NextResponse } from "next/server";
import { z } from "zod";
import type { PostgrestSingleResponse } from "@supabase/supabase-js";
import fixture from "../../fixtures/demo-event.json";
import { db } from "../supabase/admin";
import { supabaseServer } from "../supabase/server";
import { staticRules, type Rule } from "../rules";
import {
  EventProfile, CheckResult, DraftDocument,
  type CouncilSlug, type EventDocument, type Requirement,
} from "../schemas";

export { fixture };
/** MOCK=1: every route returns fixture data in the exact shape of the real response. No keys needed. */
export const MOCK = () => process.env.MOCK === "1";
export const ok = (data: unknown) => NextResponse.json(data);

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
  // ponytail: two first requests at the same moment can create two orgs; add unique(user_id) + upsert if it ever bites
  const org = must(await db().from("organisations").insert({ name: user.email ?? "Guest organisation" }).select("id").single());
  must(await db().from("memberships").insert({ org_id: org.id, user_id: user.id }));
  return org.id;
}

/** An event the caller's org owns, or 404. */
export async function loadEvent(id: string, orgId: string) {
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

/** The verified checklist for a document type, with its source for the "checked on" label. */
export async function loadChecklist(councilId: string, documentType: string) {
  const row = must(await db().from("checklists").select("items, source_url, last_checked")
    .eq("council_id", councilId).eq("document_type", documentType).eq("verified", true).maybeSingle());
  return row
    ? { items: row.items as { id: string; text: string }[], source: { url: row.source_url ?? "", lastChecked: row.last_checked } }
    : null;
}

export const checkedStatus = (r: CheckResult) => (r.items.length > 0 && r.items.every((i) => i.pass) ? "ready" : "needs_fix");

/** Deletes an event's rows of `table` whose document_type is no longer required. */
export async function pruneTypes(table: "documents" | "deadlines", eventId: string, keep: string[]) {
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
  checklistSource,
});

/** MOCK lookup for the document routes. */
export function mockDocument(id: string) {
  const doc = fixture.documents.find((d) => d.id === id);
  if (!doc) throw new HttpError(404, `Document ${id} not found in the fixture`);
  return doc;
}
