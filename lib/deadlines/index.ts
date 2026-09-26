// Deadline engine. Pure date maths on YYYY-MM-DD strings in UTC, so no timezone or daylight saving bugs.
import type { Deadline, Requirement, DocumentType, CouncilSlug } from "../schemas";

// Observed Canterbury public holidays, verified against Employment NZ's 2026/2027 table on 26 Sep 2026.
// https://www.employment.govt.nz/leave-and-holidays/public-holidays/public-holidays-and-anniversary-dates
export const CANTERBURY_HOLIDAYS = new Set([
  "2026-01-01", "2026-01-02", "2026-02-06", "2026-04-03", "2026-04-06",
  "2026-04-27", "2026-06-01", "2026-07-10",
  "2026-10-26", "2026-11-13", "2026-12-25", "2026-12-28",
  "2027-01-01", "2027-01-04", "2027-02-08", "2027-03-26", "2027-03-29",
  "2027-04-26", "2027-06-07", "2027-06-25", "2027-10-25", "2027-11-12",
  "2027-12-27", "2027-12-28",
]);

const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
const toStr = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return toStr(d); };

/** Today's date in New Zealand as YYYY-MM-DD. new Date().toISOString() is UTC, which is yesterday every NZ morning. */
export const nzToday = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });

/** 20 December to 15 January inclusive does not count as working days for alcohol licensing. */
export function inLiquorHolidayPeriod(s: string): boolean {
  const md = s.slice(5);
  return md >= "12-20" || md <= "01-15";
}

export function isWorkingDay(s: string, opts: { liquor?: boolean } = {}): boolean {
  const dow = toDate(s).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  if (CANTERBURY_HOLIDAYS.has(s)) return false;
  if (opts.liquor && inLiquorHolidayPeriod(s)) return false;
  return true;
}

/** Latest date that still leaves `n` working days before the event (event day itself not counted). */
export function workingDaysBefore(eventDate: string, n: number, opts: { liquor?: boolean } = {}): string {
  let d = eventDate;
  let count = 0;
  while (count < n) {
    d = addDays(d, -1);
    if (isWorkingDay(d, opts)) count++;
  }
  return d;
}

const PERMIT_FORM = "https://ccc.tfaforms.net/177";
const CONDITIONS_SRC = "https://ccc.govt.nz/news-and-events/events/running-an-event/conditions-for-events-on-public-land";
const TRAFFIC_SRC = "https://ccc.govt.nz/assets/Documents/Transport/Working-on-our-roads/TMP/Road-closure-for-events-3-tier.pdf";
const AMP_SRC = "https://ccc.govt.nz/assets/Documents/Consents-and-Licences/business-licences-and-consents/Alcohol/SpecialLicence.pdf";
const WAIMAKARIRI_LIQUOR_SRC = "https://www.waimakariri.govt.nz/council/news-and-information/2025/10/secure-your-special-alcohol-licence-for-the-festive-season";

/** CCC's assessed road-closure tiers. The event profile lacks road hierarchy and business-impact fields, so do not guess a tier. */
export type TrafficImpact = "small" | "medium" | "large";
const TRAFFIC_DAYS: Record<TrafficImpact, number> = { small: 30, medium: 60, large: 120 };

export function computeDeadlines(
  eventDate: string, reqs: Requirement[], council: CouncilSlug = "ccc", trafficImpact?: TrafficImpact,
): Deadline[] {
  const types = new Set<DocumentType>(reqs.map((r) => r.documentType));
  const out: Deadline[] = [];
  if (council === "ccc" && types.has("event_permit_application")) {
    out.push({
      documentType: "event_permit_application",
      label: "Lodge event permit application with site plan and health and safety plan",
      legalMinimum: addDays(eventDate, -35),
      recommended: addDays(eventDate, -70),
      basis: "CCC processing starts at five weeks for a low impact event. We aim for ten weeks.",
      sourceUrl: PERMIT_FORM,
    });
  }
  if (council === "ccc") {
    for (const [documentType, label] of [
      ["site_plan", "Provide site plan to CCC"],
      ["health_safety_plan", "Provide health and safety plan to CCC"],
    ] as const) {
      if (types.has(documentType)) out.push({
        documentType, label,
        legalMinimum: addDays(eventDate, -42),
        recommended: addDays(eventDate, -42),
        basis: "CCC's conditions for events on public land require this plan at least six weeks before the event.",
        sourceUrl: CONDITIONS_SRC,
      });
    }
    if (types.has("traffic_management_plan")) {
      const days = trafficImpact ? TRAFFIC_DAYS[trafficImpact] : null;
      out.push({
        documentType: "traffic_management_plan",
        label: trafficImpact ? "Submit traffic management plan and road closure application" : "Confirm traffic management and road closure impact with CCC",
        legalMinimum: days == null ? null : addDays(eventDate, -days),
        recommended: addDays(eventDate, -Math.max(days ?? 120, 84)),
        basis: days == null
          ? "CCC's assessed road-closure tiers need 30, 60 or 120 calendar days. Road impact is unclassified, so plan for 120 days and confirm the tier with CCC."
          : `CCC's ${trafficImpact} road-closure tier needs ${days} calendar days. Its public-land conditions also say 60–84 days for full closures; plan at least 84 days for small or medium tiers.`,
        sourceUrl: TRAFFIC_SRC,
      });
    }
  }
  if (types.has("special_licence_application")) {
    const legal = workingDaysBefore(eventDate, 20, { liquor: true });
    const recommended = workingDaysBefore(legal, 10, { liquor: true });
    out.push({
      documentType: "special_licence_application",
      label: "Lodge special licence application",
      legalMinimum: legal,
      recommended,
      basis: "At least 20 working days before the event. 20 Dec to 15 Jan does not count. We aim two weeks earlier.",
      sourceUrl: council === "ccc" ? PERMIT_FORM : WAIMAKARIRI_LIQUOR_SRC,
    });
    if (council === "ccc" && types.has("alcohol_management_plan")) out.push({
      documentType: "alcohol_management_plan",
      label: "Attach alcohol management plan to special licence application",
      legalMinimum: legal,
      recommended,
      basis: "The alcohol management plan is an attachment to the special licence application, so it shares that lodgement date.",
      sourceUrl: AMP_SRC,
    });
  }
  return out.sort((a, b) => a.recommended.localeCompare(b.recommended));
}
