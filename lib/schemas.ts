// HostReady shared contract. Every AI output, API response and fixture parses against these.
// Owner: lane A. FROZEN after the kickoff review: change only after a message in the team channel,
// and update fixtures/demo-event.json in the same commit (tests/contract.test.ts enforces it).
// OpenAI structured outputs need every key present, so optional values are .nullable(), never .optional().
// Browser-safe: this file must never import server code.
import { z } from "zod";

// Christchurch City Council is the only council (audit decision, 26 Sep 2026). Kept as an enum so adding one later is data.
export const CouncilSlug = z.enum(["ccc"]);
export type CouncilSlug = z.infer<typeof CouncilSlug>;

export const FieldSource = z.enum(["stated", "inferred", "answered"]);

const f = <T extends z.ZodType>(t: T) =>
  z.object({ value: t.nullable(), source: FieldSource.nullable() });

// ---------- AI outputs ----------

export const EventProfile = z.object({
  name: f(z.string()),
  councilSlug: CouncilSlug,
  date: f(z.string().describe("YYYY-MM-DD")),
  startTime: f(z.string().describe("HH:mm 24h")),
  endTime: f(z.string().describe("HH:mm 24h")),
  venue: z.object({ name: f(z.string()), councilLand: f(z.boolean()) }),
  openToPublic: f(z.boolean()),
  peakAttendance: f(z.number().int()),
  childrenAttending: f(z.boolean()),
  alcohol: z.object({
    supply: f(z.enum(["sold", "free", "byo", "none"])),
    area: f(z.string()),
  }),
  food: z.object({ stalls: f(z.number().int()), cookingOnSite: f(z.boolean()) }),
  structures: z.object({
    marquees: f(z.number().int()),
    largestMarqueeSqm: f(z.number()),
    stageOver1m: f(z.boolean()),
    inflatables: f(z.boolean()),
    mechanicalRides: f(z.boolean()),
  }),
  generators: f(z.boolean()),
  amplifiedSound: f(z.boolean()),
  roadOrFootpathImpact: f(z.boolean()),
  vehicleAccess: f(z.boolean()),
  missing: z.array(z.string()).describe("Dot paths of fields the description did not settle"),
});
export type EventProfile = z.infer<typeof EventProfile>;

export const FollowUpQuestion = z.object({
  path: z.string(),
  question: z.string(),
  options: z.array(z.string()),
});
export type FollowUpQuestion = z.infer<typeof FollowUpQuestion>;

export const Classification = z.object({
  category: z.enum(["community", "commercial", "unclear"]),
  reasoning: z.string(),
  howToPresent: z.string().nullable(),
  citedChunkIds: z.array(z.string()),
});
export type Classification = z.infer<typeof Classification>;

export const DocumentType = z.enum([
  "event_permit_application",
  "site_plan",
  "health_safety_plan",
  "hazard_register",
  "waste_management_confirmation",
  "special_licence_application",
  "host_responsibility_policy",
  "alcohol_management_plan",
  "food_licence_check",
  "traffic_management_plan",
  "building_consent_exemption",
  "amusement_device_permit",
]);
export type DocumentType = z.infer<typeof DocumentType>;

/** Types HostReady drafts with AI (PRD F6). Every other required document is "manual". */
export const DRAFTED_TYPES: ReadonlySet<DocumentType> = new Set<DocumentType>([
  "health_safety_plan",
  "hazard_register",
  "waste_management_confirmation",
  "special_licence_application",
  "host_responsibility_policy",
  "alcohol_management_plan",
]);

export const DraftDocument = z.object({
  documentType: DocumentType,
  title: z.string(),
  sections: z.array(z.object({ heading: z.string(), body: z.string() })),
  placeholders: z.array(z.string()).describe("Every [PLACEHOLDER] left for the organiser"),
  citedChunkIds: z.array(z.string()),
});
export type DraftDocument = z.infer<typeof DraftDocument>;

export const CheckResult = z.object({
  items: z.array(
    z.object({
      itemId: z.string(),
      text: z.string(),
      pass: z.boolean(),
      evidence: z.string().describe("Quote from the draft, or empty if missing"),
      suggestedFix: z.string().nullable(),
    }),
  ),
});
export type CheckResult = z.infer<typeof CheckResult>;

// ---------- Deterministic outputs (rules engine, deadline engine) ----------

export const Requirement = z.object({
  documentType: DocumentType,
  reason: z.string(),
  ruleId: z.string(),
  sourceUrl: z.string(),
  lastChecked: z.string().nullable().describe("YYYY-MM-DD the rule was last checked against its source"),
});
export type Requirement = z.infer<typeof Requirement>;

export const Deadline = z.object({
  documentType: DocumentType,
  label: z.string(),
  legalMinimum: z.string().nullable(),
  recommended: z.string(),
  basis: z.string(),
  sourceUrl: z.string().nullable(),
});
export type Deadline = z.infer<typeof Deadline>;

// ---------- API responses ----------

export const ProfileResponse = z.object({ profile: EventProfile, questions: z.array(FollowUpQuestion) });
export type ProfileResponse = z.infer<typeof ProfileResponse>;

/**
 * pending: waiting to be drafted · drafted: drafted, not checked · needs_fix: a checklist item failed
 * ready: every checklist item passes · manual: HostReady does not draft it (official form, site plan screen, food licence)
 */
export const DocumentStatus = z.enum(["pending", "drafted", "needs_fix", "ready", "manual"]);
export type DocumentStatus = z.infer<typeof DocumentStatus>;

export const EventDocument = z.object({
  id: z.string(),
  documentType: DocumentType,
  status: DocumentStatus,
  content: DraftDocument.nullable(),
  checkResults: CheckResult.nullable(),
  checklistSource: z.object({ url: z.string(), lastChecked: z.string().nullable() }).nullable(),
});
export type EventDocument = z.infer<typeof EventDocument>;

export const EventDetail = z.object({
  id: z.string(),
  council: CouncilSlug,
  description: z.string(),
  status: z.string(),
  profile: EventProfile.nullable(),
  classification: Classification.nullable(),
  requirements: z.array(Requirement),
  eventbriteEventId: z.string().nullable(),
  createdAt: z.string(),
});
export type EventDetail = z.infer<typeof EventDetail>;

export const EventSummary = z.object({
  id: z.string(),
  name: z.string().nullable(),
  council: CouncilSlug,
  date: z.string().nullable(),
  status: z.string(),
  eventbriteEventId: z.string().nullable(),
  createdAt: z.string(),
});
export type EventSummary = z.infer<typeof EventSummary>;

export const Licence = z.object({
  id: z.string(),
  type: z.string(),
  holderName: z.string().nullable(),
  expiresOn: z.string(),
});
export type Licence = z.infer<typeof Licence>;

export const Ticket = z.object({ name: z.string().min(1), priceCents: z.number().int().positive().nullable() });
export type Ticket = z.infer<typeof Ticket>;

export const EventbriteDraft = z.object({ id: z.string(), url: z.string() });
export type EventbriteDraft = z.infer<typeof EventbriteDraft>;
