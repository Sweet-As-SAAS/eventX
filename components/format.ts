// Display-only helpers. Dates arrive as YYYY-MM-DD from the API; we format them, never compute deadlines.
import type { CouncilSlug, DocumentStatus, DocumentType } from "@/lib/schemas";

export const DOC_LABEL: Record<DocumentType, string> = {
  event_permit_application: "Event permit application",
  site_plan: "Site plan",
  health_safety_plan: "Health and safety plan",
  hazard_register: "Hazard register",
  waste_management_confirmation: "Waste management confirmation",
  special_licence_application: "Special licence application",
  host_responsibility_policy: "Host responsibility policy",
  alcohol_management_plan: "Alcohol management plan",
  food_licence_check: "Food licence check",
  traffic_management_plan: "Traffic management plan",
  building_consent_exemption: "Building consent exemption",
  amusement_device_permit: "Amusement device permit",
};

export const COUNCIL_LABEL: Record<CouncilSlug, string> = {
  ccc: "Christchurch City Council",
};

export const STATUS_LABEL: Record<DocumentStatus, string> = {
  pending: "Drafting",
  drafted: "Checking",
  needs_fix: "Needs a fix",
  ready: "Ready",
  manual: "You handle this",
};

const utc = (s: string) => new Date(`${s}T00:00:00Z`);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** "14 Mar 2027" */
export const fmtDate = (s: string) => !isDate(s) ? s :
  utc(s).toLocaleDateString("en-NZ", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

/** "Sun 14 Mar" */
export const fmtDay = (s: string) => !isDate(s) ? s :
  utc(s).toLocaleDateString("en-NZ", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });

/** Calendar days from a to b, for "in 42 days" labels only. */
export const daysBetween = (a: string, b: string) => Math.round((utc(b).getTime() - utc(a).getTime()) / 86_400_000);

/** "14:00" -> "2pm", "12:30" -> "12:30pm" */
export function fmtTime(t: string) {
  if (!/^\d{1,2}:\d{2}$/.test(t)) return t;
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, "0")}${suffix}` : `${h12}${suffix}`;
}

/** "https://ccc.govt.nz/.../event-permits" -> "CCC event permits" */
export function sourceName(url: string) {
  try {
    const u = new URL(url);
    const who = u.hostname.includes("ccc.govt.nz") ? "CCC" : u.hostname.replace(/^www\./, "");
    const page = u.pathname.split("/").filter(Boolean).pop()?.replace(/[-_]/g, " ");
    return page ? `${who} ${page}` : who;
  } catch {
    return "council source";
  }
}

const NUM = ["no", "one", "two", "three", "four", "five", "six"];
/** "three quick questions" */
export const questionsLabel = (n: number) => `${NUM[n] ?? n} quick ${n === 1 ? "question" : "questions"}`;
