// Deadline engine. Pure date maths on YYYY-MM-DD strings in UTC, so no timezone or daylight saving bugs.
import type { Deadline, Requirement, DocumentType } from "../schemas";

// Canterbury public holidays (Mondayised). TODO(lane C): verify against employment.govt.nz before demo.
export const CANTERBURY_HOLIDAYS = new Set([
  "2026-10-26", "2026-11-13", "2026-12-25", "2026-12-28",
  "2027-01-01", "2027-01-04", "2027-02-08", "2027-03-26", "2027-03-29",
  "2027-04-26", "2027-06-07", "2027-06-25", "2027-10-25", "2027-11-12",
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

const LIQUOR_SRC = "https://ccc.govt.nz/news-and-events/events/running-an-event/event-resources";
const PERMIT_SRC = "https://ccc.govt.nz/news-and-events/events/running-an-event/event-permits";

export function computeDeadlines(eventDate: string, reqs: Requirement[]): Deadline[] {
  const types = new Set<DocumentType>(reqs.map((r) => r.documentType));
  const out: Deadline[] = [];
  if (types.has("event_permit_application")) {
    out.push({
      documentType: "event_permit_application",
      label: "Lodge event permit application with site plan and health and safety plan",
      legalMinimum: addDays(eventDate, -35),
      recommended: addDays(eventDate, -70),
      basis: "CCC processing starts at five weeks for a low impact event. We aim for ten weeks.",
      sourceUrl: PERMIT_SRC,
    });
  }
  if (types.has("special_licence_application")) {
    const legal = workingDaysBefore(eventDate, 20, { liquor: true });
    out.push({
      documentType: "special_licence_application",
      label: "Lodge special licence application",
      legalMinimum: legal,
      recommended: workingDaysBefore(legal, 10, { liquor: true }),
      basis: "At least 20 working days before the event. 20 Dec to 15 Jan does not count. We aim two weeks earlier.",
      sourceUrl: LIQUOR_SRC,
    });
  }
  if (types.has("traffic_management_plan")) {
    out.push({
      documentType: "traffic_management_plan",
      label: "Submit traffic management plan and road closure request",
      legalMinimum: null,
      recommended: addDays(eventDate, -84),
      basis: "Lead time not yet verified. Treat as 12 weeks until lane B confirms.",
      sourceUrl: null,
    });
  }
  return out.sort((a, b) => a.recommended.localeCompare(b.recommended));
}
