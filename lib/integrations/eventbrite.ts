// Eventbrite REST v3. Creates a DRAFT only. Never publish from the demo.
import type { EventProfile, Ticket } from "../schemas";

const API = "https://www.eventbriteapi.com/v3";
const headers = () => ({ Authorization: `Bearer ${process.env.EVENTBRITE_TOKEN}`, "Content-Type": "application/json" });

const nzFmt = new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

/** NZ offset from UTC in ms at instant t (+12h or +13h). */
function nzOffsetAt(t: number): number {
  const p = Object.fromEntries(nzFmt.formatToParts(t).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - t;
}

/** Converts a local NZ date and time to UTC ISO without hardcoding +12/+13. */
export function nzLocalToUtc(date: string, time: string): string {
  const naive = Date.parse(`${date}T${time}:00Z`);
  // Second pass re-reads the offset at the corrected instant, so the day daylight saving changes is right too.
  const utc = naive - nzOffsetAt(naive - nzOffsetAt(naive));
  return new Date(utc).toISOString().replace(".000", "");
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${API}${path}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Eventbrite ${path} failed (${res.status}): ${JSON.stringify(json)}`);
  return json;
}

export async function createEventbriteDraft(profile: EventProfile, tickets: Ticket[]) {
  const date = profile.date.value, start = profile.startTime.value, end = profile.endTime.value;
  if (!date || !start || !end) throw new Error("The event needs a date, start time and end time before it can go on Eventbrite");
  const capacity = profile.peakAttendance.value ?? 100;
  const ev = await post(`/organizations/${process.env.EVENTBRITE_ORG_ID}/events/`, { event: {
    name: { html: profile.name.value ?? "Event" },
    start: { timezone: "Pacific/Auckland", utc: nzLocalToUtc(date, start) },
    end: { timezone: "Pacific/Auckland", utc: nzLocalToUtc(date, end) },
    currency: "NZD",
    capacity,
  } });
  for (const t of tickets) {
    await post(`/events/${ev.id}/ticket_classes/`, { ticket_class: t.priceCents
      ? { name: t.name, free: false, cost: `NZD,${t.priceCents}`, quantity_total: capacity }
      : { name: t.name, free: true, quantity_total: capacity } });
  }
  return { id: String(ev.id), url: `https://www.eventbrite.com/myevent?eid=${ev.id}` };
}
