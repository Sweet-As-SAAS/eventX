// Typed browser client for every API route. Screens call only these, never fetch() directly.
// Responses are parsed against lib/schemas.ts, so a contract drift fails loudly in dev instead of rendering garbage.
import { z } from "zod";
import {
  Classification, Deadline, EventbriteDraft, EventDetail, EventDocument, EventSummary, Licence,
  ProfileResponse, Requirement, type CouncilSlug, type Ticket,
} from "../schemas";

export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function call<T extends z.ZodType>(schema: T, path: string, body?: unknown): Promise<z.infer<T>> {
  const res = await fetch(path, body === undefined ? undefined : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.error ?? res.statusText);
  return schema.parse(json);
}

const Id = z.object({ id: z.string() });

export const api = {
  listEvents: () => call(z.array(EventSummary), "/api/events"),
  createEvent: (body: { council: CouncilSlug; description: string }) => call(Id, "/api/events", body),
  getEvent: (id: string) => call(EventDetail, `/api/events/${id}`),

  /** Steps 1 and 2: AI profile plus follow-up questions. Takes a few seconds. */
  buildProfile: (id: string) => call(ProfileResponse, `/api/events/${id}/profile`, {}),
  getProfile: (id: string) => call(ProfileResponse, `/api/events/${id}/profile`),
  editProfile: (id: string, edits: { path: string; value: string | number | boolean | null }[]) => call(ProfileResponse, `/api/events/${id}/edit`, { edits }),
  answer: (id: string, answers: { path: string; answer: string }[]) => call(ProfileResponse, `/api/events/${id}/answers`, { answers }),
  classify: (id: string) => call(Classification, `/api/events/${id}/classify`, {}),
  /** Step 4: rules engine. Also creates one document row per requirement. */
  requirements: (id: string) => call(z.array(Requirement), `/api/events/${id}/requirements`, {}),

  listDocuments: (id: string) => call(z.array(EventDocument), `/api/events/${id}/documents`),
  /** Step 5 for one document. Fire one per pending document in parallel so each card flips as it lands. */
  draft: (documentId: string) => call(EventDocument, `/api/documents/${documentId}/draft`, {}),
  check: (documentId: string) => call(EventDocument, `/api/documents/${documentId}/check`, {}),
  /** Applies the suggested fix for one checklist item and re-checks, so red turns green in one call. */
  fix: (documentId: string, itemId: string) => call(EventDocument, `/api/documents/${documentId}/fix`, { itemId }),

  deadlines: (id: string) => call(z.array(Deadline), `/api/events/${id}/deadlines`),
  /** Use as an <a href download>, not fetch. */
  exportUrl: (id: string) => `/api/events/${id}/export`,
  /** 409 until every document is ready or manual. */
  eventbrite: (id: string, tickets?: Ticket[]) => call(EventbriteDraft, `/api/events/${id}/eventbrite`, { tickets }),

  licences: () => call(z.array(Licence), "/api/licences"),
  demoReminder: () => call(z.object({ ok: z.literal(true) }), "/api/demo/reminder", {}),
};
