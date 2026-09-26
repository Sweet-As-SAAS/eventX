"use client";
import { use, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ApiError, api } from "@/lib/api/client";
import { nzToday } from "@/lib/deadlines";
import type { Deadline, EventbriteDraft, EventDetail, EventDocument } from "@/lib/schemas";
import { daysBetween, fmtDate, fmtDay } from "@/components/format";
import { Check, Download, External, Lock, Mail, Ticket } from "@/components/icons";
import { useFail, useToast } from "@/components/toast";
import { Button, ButtonA, ButtonLink, Skeleton, SourceLine, Title, cx } from "@/components/ui";

// Screen 5, Deadlines and publish. Dates are shown exactly as /deadlines returns them; the UI only places them on an axis.
export default function DeadlinesPage({ params }: PageProps<"/events/[id]/deadlines">) {
  const { id } = use(params);
  const fail = useFail();
  const toast = useToast();
  const [deadlines, setDeadlines] = useState<Deadline[] | null>(null);
  const [docs, setDocs] = useState<EventDocument[] | null>(null);
  const [ev, setEv] = useState<EventDetail | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<EventbriteDraft | null>(null);
  const [ebError, setEbError] = useState<string | null>(null);
  const [dlError, setDlError] = useState<string | null>(null);
  const started = useRef(false);
  const today = nzToday();

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api.deadlines(id).then(setDeadlines).catch((e) => {
      if (e instanceof ApiError && e.status === 401) return fail(e);
      setDlError(e instanceof Error ? e.message : "Couldn't load your deadlines.");
    });
    api.listDocuments(id).then(setDocs).catch(fail);
    api.getEvent(id).then(setEv).catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function remind() {
    setSending(true);
    try {
      await api.demoReminder();
      setSent(true);
      toast("Reminder sent. Check your inbox.");
    } catch (e) { fail(e); } finally { setSending(false); }
  }

  async function eventbrite() {
    setCreating(true);
    setEbError(null);
    try {
      setDraft(await api.eventbrite(id));
      toast("Eventbrite draft created. It isn't published.");
    } catch (e) {
      // 409: the route's own reason (documents not ready) stays on screen, not only in a toast
      if (e instanceof ApiError && e.status === 409) setEbError(e.message);
      else fail(e);
    } finally { setCreating(false); }
  }

  const eventDate = ev?.profile?.date.value ?? null;
  const left = docs?.filter((d) => d.status !== "ready" && d.status !== "manual").length ?? 0;
  const unlocked = !!docs?.length && left === 0;

  return (
    <div className="space-y-12">
      <Title sub="Each date comes from the council's own rules. For liquor licences, 20 December to 15 January doesn't count as working days.">
        Deadlines and publish
      </Title>

      <section aria-labelledby="timeline" className="space-y-8">
        <h2 id="timeline" className="sr-only">Timeline</h2>
        {deadlines ? (
          <>
            <Axis deadlines={deadlines} today={today} eventDate={eventDate} active={active} />
            <ul className="border-t border-border">
              {deadlines.map((d) => {
                const until = daysBetween(today, d.recommended);
                const late = d.legalMinimum && daysBetween(today, d.legalMinimum) < 0;
                return (
                  <li key={d.documentType} onMouseEnter={() => setActive(d.documentType)} onMouseLeave={() => setActive(null)}
                    className={cx("grid gap-3 border-b border-border py-5 transition-colors duration-150 sm:grid-cols-12 sm:gap-8", active === d.documentType && "bg-brand-50")}>
                    <div className="sm:col-span-4">
                      <p className="text-sm text-muted-foreground">Aim to lodge by</p>
                      <p className="display text-2xl font-medium text-foreground">{fmtDay(d.recommended)}</p>
                      <p className={cx("text-sm font-medium", late ? "text-destructive" : until < 0 ? "text-warning" : "text-neutral-700")}>
                        {late ? "Past the legal minimum" : until < 0 ? "Past our recommended date" : until === 0 ? "Today" : `In ${until} days`}
                      </p>
                    </div>
                    <div className="space-y-1.5 sm:col-span-8">
                      <p className="text-lg font-semibold text-foreground">{d.label}</p>
                      <p className="text-base text-neutral-700">{d.basis}</p>
                      <p className="text-base text-neutral-700">
                        {d.legalMinimum ? <>Legal minimum: <span className="font-semibold text-foreground">{fmtDate(d.legalMinimum)}</span></> : "No legal minimum published. Our recommended date is the one to aim for."}
                      </p>
                      {d.sourceUrl && <SourceLine url={d.sourceUrl} checked={ev?.requirements.find((r) => r.documentType === d.documentType && r.sourceUrl === d.sourceUrl)?.lastChecked ?? null} />}
                    </div>
                  </li>
                );
              })}
            </ul>
            {deadlines.length === 0 && <p className="text-lg text-neutral-700">No deadlines yet. They appear once your event has a date and a document list.</p>}
          </>
        ) : dlError ? (
          <div className="space-y-3">
            <p role="alert" className="text-lg text-neutral-700">{dlError}</p>
            <p className="text-base text-neutral-700">Deadlines need your event date and document list. <Link href={`/events/${id}/profile`} className="font-semibold text-primary underline decoration-brand-200 underline-offset-2">Check your details</Link></p>
          </div>
        ) : (
          <div className="space-y-4" aria-hidden><Skeleton className="h-16" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        )}
      </section>

      <section aria-labelledby="publish">
        <h2 id="publish" className="text-lg font-semibold text-foreground">Lodge, remind, sell tickets</h2>
        <ul className="mt-4 border-t border-border">
          <Row icon={<Download />} title="Your pack as one PDF" body="Every drafted document, ready to review and lodge with the council.">
            <ButtonA href={api.exportUrl(id)} download>Download PDF pack</ButtonA>
          </Row>
          <Row icon={<Mail />} title="Reminders" body="We email you 14 days and 3 days before each deadline, so nothing slips.">
            <Button variant="secondary" busy={sending} onClick={remind}>
              {sending ? "Sending" : sent ? <><Check className="text-success" /> Sent. Send again</> : "Send me the reminder now"}
            </Button>
          </Row>
          <Row icon={unlocked ? <Ticket /> : <Lock />} title="Tickets on Eventbrite"
            body={<span id="eventbrite-why" aria-live="polite">
              {draft ? "Your Eventbrite draft is ready. It is a draft, not published: check it on Eventbrite and publish it yourself."
                : !docs ? "Checking your documents…"
                : creating ? "Creating your Eventbrite draft…"
                : ebError ? <span className="text-destructive">{ebError}</span>
                : unlocked ? "Every document is ready or yours to handle, so tickets can go on sale. This creates a draft on Eventbrite. Nothing is published."
                : <>Locked until every document is ready. {left} still {left === 1 ? "needs" : "need"} work. <Link href={`/events/${id}/documents`} className="font-semibold text-primary underline decoration-brand-200 underline-offset-2">Go to documents</Link></>}
            </span>}>
            {draft ? (
              <ButtonA href={draft.url} target="_blank" rel="noreferrer" variant="secondary"><External /> Open your Eventbrite draft</ButtonA>
            ) : (
              <Button variant="secondary" busy={creating} disabled={!unlocked} aria-describedby="eventbrite-why" onClick={eventbrite}>
                {!unlocked && <Lock />} {creating ? "Creating draft" : "Create Eventbrite draft"}
              </Button>
            )}
          </Row>
        </ul>
      </section>
      <ButtonLink href={`/events/${id}/site-plan`} variant="ghost" className="!text-neutral-700 hover:!bg-neutral-50">Back</ButtonLink>
    </div>
  );
}

function Row({ icon, title, body, children }: { icon: ReactNode; title: string; body: ReactNode; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-4 border-b border-border py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <span className="mt-0.5 text-primary">{icon}</span>
        <div>
          <p className="text-lg font-semibold text-foreground">{title}</p>
          <p className="max-w-prose text-base text-neutral-700">{body}</p>
        </div>
      </div>
      <div className="shrink-0 pl-8 sm:pl-0">{children}</div>
    </li>
  );
}

/** Places the API's dates on an axis from today to the event, with the liquor holiday period shaded. */
function Axis({ deadlines, today, eventDate, active }: { deadlines: Deadline[]; today: string; eventDate: string | null; active: string | null }) {
  const dates = [today, ...(eventDate ? [eventDate] : []), ...deadlines.flatMap((d) => [d.recommended, d.legalMinimum].filter(Boolean) as string[])].sort();
  const start = dates[0], end = dates[dates.length - 1];
  const span = Math.max(daysBetween(start, end), 1);
  const pos = (d: string) => `${(daysBetween(start, d) / span) * 100}%`;
  const clampD = (d: string) => (d < start ? start : d > end ? end : d);

  const periods: [string, string][] = [];
  for (let y = +start.slice(0, 4) - 1; y <= +end.slice(0, 4); y++) {
    const a = clampD(`${y}-12-20`), b = clampD(`${y + 1}-01-15`);
    if (a < b) periods.push([a, b]);
  }
  const months: string[] = [];
  let y = +start.slice(0, 4), m = +start.slice(5, 7) + 1; // first of each month after start
  for (;;) {
    if (m > 12) { y += 1; m = 1; }
    const d = `${y}-${String(m).padStart(2, "0")}-01`;
    if (d > end) break;
    months.push(d);
    m += 1;
  }

  return (
    <div aria-hidden className="overflow-x-clip pb-10 pt-8">
      <div className="relative h-10">
        <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-neutral-200" />
        {periods.map(([a, b]) => (
          // Named in the legend below; an inline label collides with the event-day label on a phone
          <div key={a} className="absolute inset-y-0 rounded-md bg-warning-soft" style={{ left: pos(a), width: `calc(${pos(b)} - ${pos(a)})` }} />
        ))}
        {months.map((m) => (
          <span key={m} className="absolute top-full mt-2 -translate-x-1/2 text-xs text-muted-foreground" style={{ left: pos(m) }}>
            {new Date(`${m}T00:00:00Z`).toLocaleDateString("en-NZ", { timeZone: "UTC", month: "short" })}
          </span>
        ))}
        <Marker at={pos(today)} label="Today" className="bg-foreground" />
        {deadlines.map((d) => (
          <span key={d.documentType}>
            {d.legalMinimum && <span className={cx("absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-destructive bg-background", active === d.documentType && "ring-4 ring-destructive-soft")} style={{ left: pos(d.legalMinimum) }} />}
            <span className={cx("absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary", active === d.documentType && "ring-4 ring-brand-200")} style={{ left: pos(d.recommended) }} />
          </span>
        ))}
        {eventDate && <Marker at={pos(eventDate)} label="Event day" className="bg-primary" />}
      </div>
      <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-neutral-700">
        <span className="flex items-center gap-2"><span className="size-3 rounded-full bg-primary" /> Recommended</span>
        <span className="flex items-center gap-2"><span className="size-3 rounded-full border-2 border-destructive" /> Legal minimum</span>
        {periods.length > 0 && <span className="flex items-center gap-2"><span className="h-3 w-5 rounded-sm bg-warning-soft" /> Doesn&apos;t count for liquor licences</span>}
      </div>
    </div>
  );
}

// Labels near either end hang inwards, so they never push the page wider than a phone.
const Marker = ({ at, label, className }: { at: string; label: string; className: string }) => {
  const pct = parseFloat(at);
  const side = pct < 15 ? "left-0" : pct > 85 ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <span className="absolute inset-y-0 -translate-x-1/2" style={{ left: at }}>
      <span className={cx("absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2", className)} />
      <span className={cx("absolute -top-6 whitespace-nowrap text-xs font-semibold text-foreground", side)}>{label}</span>
    </span>
  );
};
