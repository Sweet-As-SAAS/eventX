"use client";
import { use, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ApiError, api } from "@/lib/api/client";
import { nzToday } from "@/lib/deadlines";
import { feesFor, feeTotal, type FeeLine } from "@/lib/rules/fees";
import type { Deadline, DocumentType, EventbriteDraft, EventDetail, EventDocument } from "@/lib/schemas";
import { DOC_LABEL, daysBetween, fmtDate } from "@/components/format";
import { ArrowLeft, Download, External, Lock } from "@/components/icons";
import { useFail, useToast } from "@/components/toast";
import { Button, ButtonA, Skeleton, SourceLine, cx } from "@/components/ui";

// Screen 5, When to lodge. Dates are shown exactly as /deadlines returns them; the UI only places them on a month.
const SHORT: Partial<Record<DocumentType, string>> = {
  event_permit_application: "Lodge permit", special_licence_application: "Lodge licence", alcohol_management_plan: "Alcohol plan",
  site_plan: "Site plan", health_safety_plan: "Safety plan", traffic_management_plan: "Traffic plan", building_consent_exemption: "Marquee exemption",
};
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const money = (n: number) => `$${n.toLocaleString("en-NZ", { maximumFractionDigits: 2 })}`;
const utc = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
// Liquor licence working days skip 20 December to 15 January.
const liquorBreak = (d: string) => { const md = d.slice(5); return md >= "12-20" || md <= "01-15"; };

export default function DeadlinesPage({ params }: PageProps<"/events/[id]/deadlines">) {
  const { id } = use(params);
  const fail = useFail();
  const toast = useToast();
  const [deadlines, setDeadlines] = useState<Deadline[] | null>(null);
  const [docs, setDocs] = useState<EventDocument[] | null>(null);
  const [ev, setEv] = useState<EventDetail | null>(null);
  const [month, setMonth] = useState<string | null>(null); // "YYYY-MM"
  const [picked, setPicked] = useState<string | null>(null); // a date with deadlines, shown under the calendar
  const [reminders, setReminders] = useState(true);
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<EventbriteDraft | null>(null);
  const [ebError, setEbError] = useState<string | null>(null);
  const [dlError, setDlError] = useState<string | null>(null);
  const [allFees, setAllFees] = useState(false);
  const started = useRef(false);
  const today = nzToday();

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api.deadlines(id).then((d) => {
      setDeadlines(d);
      // Open on the next date to lodge (or the first one, for a past event).
      const next = [...d].sort((a, b) => a.recommended.localeCompare(b.recommended)).find((x) => x.recommended >= today) ?? d[0];
      if (next) { setMonth(next.recommended.slice(0, 7)); setPicked(next.recommended); }
      else setMonth(today.slice(0, 7));
    }).catch((e) => {
      if (e instanceof ApiError && e.status === 401) return fail(e);
      setDlError(e instanceof Error ? e.message : "Couldn't load your deadlines.");
    });
    api.listDocuments(id).then(setDocs).catch(fail);
    api.getEvent(id).then(setEv).catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function toggleReminders() {
    if (reminders) { setReminders(false); return; }
    setSending(true);
    try {
      await api.demoReminder();
      setReminders(true);
      toast("Reminders on. We've emailed you the first one.");
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
  const done = docs?.filter((d) => d.status === "manual" || (d.status === "ready" && d.reviewed)).length ?? 0;
  const fixes = docs?.filter((d) => d.status === "needs_fix").length ?? 0;
  const unlocked = !!docs?.length && done === docs.length;
  const fees = ev?.profile ? feesFor(ev.profile, [...new Set(ev.requirements.map((r) => r.documentType))], ev.classification?.category ?? "unclear")
    .filter((l) => !(l.min === 0 && l.max === 0)) : null;

  return (
    <div className="step-in pb-4">
      <p className="text-[13px] font-semibold uppercase tracking-[0.04em] text-primary">Step 4 of 4</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-[-0.025em] text-foreground">When to lodge</h1>

      <div className="mt-8 grid gap-12 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          {deadlines && month ? (
            <MonthView month={month} setMonth={setMonth} deadlines={deadlines} today={today} eventDate={eventDate} picked={picked} setPicked={setPicked} />
          ) : dlError ? (
            <div className="space-y-3">
              <p role="alert" className="text-lg text-neutral-700">{dlError}</p>
              <p className="text-base text-neutral-700">Deadlines need your event date and document list. <Link href={`/events/${id}/profile`} className="font-semibold text-primary underline decoration-brand-200 underline-offset-2">Check your details</Link></p>
            </div>
          ) : <Skeleton className="h-[420px]" />}

          {picked && deadlines && <Picked date={picked} deadlines={deadlines.filter((d) => d.recommended === picked)} today={today} ev={ev} />}

          {fees && fees.length > 0 && <Costs lines={fees} all={allFees} onAll={() => setAllFees(true)} />}
        </div>

        <aside className="space-y-0 lg:pt-[68px]">
          <Side title="Your pack as one PDF"
            body={docs ? `${docs.length} documents in the order council wants them${fixes ? `, ${fixes} still ${fixes === 1 ? "needs" : "need"} a fix` : ""}` : "Checking your documents…"}>
            <ButtonA href={api.exportUrl(id)} download className="mt-4 w-full"><Download /> Download PDF pack</ButtonA>
          </Side>
          <Side title="Reminders" body="We email you 14 and 3 days before each date"
            action={
              <button role="switch" aria-checked={reminders} aria-label="Email reminders" onClick={toggleReminders} disabled={sending}
                className={cx("press relative h-7 w-12 shrink-0 rounded-full transition-colors duration-150 disabled:opacity-60", reminders ? "bg-primary" : "bg-neutral-300")}>
                <span className={cx("absolute top-1 size-5 rounded-full bg-background shadow-sm transition-[left] duration-150", reminders ? "left-6" : "left-1")} />
              </button>
            } />
          <Side title="Tickets on Eventbrite"
            body={<span id="eventbrite-why" aria-live="polite">
              {draft ? "Your draft is ready. It isn't published: check it on Eventbrite and publish it yourself."
                : ebError ? <span className="text-destructive">{ebError}</span>
                : !docs ? "Checking your documents…"
                : unlocked ? "Every document is ready, so tickets can go on sale. This creates a draft. Nothing is published."
                : <>Unlocks when you&apos;ve checked every document, {done} of {docs.length} done. <Link href={`/events/${id}/documents`} className="font-semibold text-primary hover:underline">Go to documents</Link></>}
            </span>}>
            {draft ? (
              <ButtonA href={draft.url} target="_blank" rel="noreferrer" variant="secondary" className="mt-4 w-full"><External /> Open your Eventbrite draft</ButtonA>
            ) : (
              <Button variant="secondary" busy={creating} disabled={!unlocked} aria-describedby="eventbrite-why" onClick={eventbrite} className="mt-4 w-full disabled:bg-neutral-50">
                {!unlocked && <Lock />} {creating ? "Creating draft" : "Create Eventbrite draft"}
              </Button>
            )}
          </Side>
        </aside>
      </div>
    </div>
  );
}

function Side({ title, body, action, children }: { title: string; body: ReactNode; action?: ReactNode; children?: ReactNode }) {
  return (
    <section className="border-t border-border py-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[17px] font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-[15px] text-neutral-600">{body}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** One month, Monday first. Blue: aim to lodge. Red outline: legal minimum. Amber: doesn't count for liquor licences. */
function MonthView({ month, setMonth, deadlines, today, eventDate, picked, setPicked }: {
  month: string; setMonth: (m: string) => void; deadlines: Deadline[]; today: string; eventDate: string | null;
  picked: string | null; setPicked: (d: string) => void;
}) {
  const first = utc(`${month}-01`);
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const shift = (n: number) => setMonth(iso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + n, 1))).slice(0, 7));
  const title = first.toLocaleDateString("en-NZ", { timeZone: "UTC", month: "long", year: "numeric" });
  const hasBreak = Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`).some(liquorBreak);

  return (
    <section aria-labelledby="month">
      <div className="flex items-center justify-between">
        <h2 id="month" className="text-2xl font-semibold text-foreground" aria-live="polite">{title}</h2>
        <div className="flex gap-2">
          <button onClick={() => shift(-1)} aria-label="Previous month" className="press grid size-11 place-items-center rounded-lg border border-neutral-200 hover:bg-neutral-50"><ArrowLeft width={18} height={18} /></button>
          <button onClick={() => shift(1)} aria-label="Next month" className="press grid size-11 place-items-center rounded-lg border border-neutral-200 hover:bg-neutral-50"><ArrowLeft width={18} height={18} className="rotate-180" /></button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1 sm:gap-1.5">
        {DAYS.map((d) => <span key={d} className="px-1 pb-1 text-[13px] font-medium text-neutral-600 sm:px-2">{d}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`x${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, "0")}`;
          const lodge = deadlines.filter((d) => d.recommended === date);
          const legal = deadlines.some((d) => d.legalMinimum === date);
          const weekend = (lead + i) % 7 >= 5;
          const isEvent = date === eventDate;
          const label = lodge.length ? `${SHORT[lodge[0].documentType] ?? DOC_LABEL[lodge[0].documentType]}${lodge.length > 1 ? ` +${lodge.length - 1}` : ""}` : isEvent ? "Event day" : null;
          const cls = cx("flex min-h-12 flex-col items-start rounded-md p-1.5 text-left text-[13px] font-medium sm:min-h-[60px] sm:p-2.5",
            lodge.length ? "bg-primary text-primary-foreground" : isEvent ? "bg-foreground text-background" : liquorBreak(date) ? "bg-warning-soft text-foreground" : weekend ? "bg-neutral-50 text-foreground" : "text-foreground",
            legal && "ring-2 ring-inset ring-destructive", picked === date && lodge.length > 0 && "outline outline-2 outline-offset-2 outline-primary",
            date === today && lodge.length === 0 && "underline decoration-2 underline-offset-4");
          const inner = <>{i + 1}{label && <span className="mt-0.5 hidden text-[12px] font-semibold leading-tight sm:block">{label}</span>}</>;
          return lodge.length
            ? <button key={date} onClick={() => setPicked(date)} aria-label={`${fmtDate(date)}: ${lodge.map((d) => d.label).join("; ")}`} className={cx("press", cls)}>{inner}</button>
            : <span key={date} className={cls} aria-label={legal ? `${fmtDate(date)}: legal minimum` : isEvent ? `${fmtDate(date)}: event day` : undefined}>{inner}</span>;
        })}
      </div>
      <p className="mt-3 text-sm text-neutral-600">
        Blue is when to lodge. Red outline is the legal minimum.{hasBreak && " Shaded days don't count for liquor licences."} Tap a blue day for why.
      </p>
    </section>
  );
}

/** Why this date: the API's own label, basis, legal minimum and council source. */
function Picked({ date, deadlines, today, ev }: { date: string; deadlines: Deadline[]; today: string; ev: EventDetail | null }) {
  const until = daysBetween(today, date);
  return (
    <section aria-live="polite" className="mt-5 rounded-2xl bg-neutral-50 px-5 py-4">
      <p className="text-[15px] font-semibold text-primary">{fmtDate(date)} · {until < 0 ? "past" : until === 0 ? "today" : `in ${until} days`}</p>
      <ul className="mt-2 space-y-3">
        {deadlines.map((d) => (
          <li key={d.documentType}>
            <p className="font-semibold text-foreground">{d.label}</p>
            <p className="text-[15px] text-neutral-700">{d.basis} {d.legalMinimum && <>Legal minimum: <span className="font-semibold text-foreground">{fmtDate(d.legalMinimum)}</span>.</>}</p>
            {d.sourceUrl && <SourceLine url={d.sourceUrl} checked={ev?.requirements.find((r) => r.documentType === d.documentType && r.sourceUrl === d.sourceUrl)?.lastChecked ?? null} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

const amount = (l: FeeLine) => l.min == null ? null : l.min === l.max ? money(l.min) : `${money(l.min)} to ${money(l.max!)}`;

/** What lodging costs, from the council fee schedules. Unverified fees say "check with council". */
function Costs({ lines, all, onAll }: { lines: FeeLine[]; all: boolean; onAll: () => void }) {
  const t = feeTotal(lines);
  const total = t.min === t.max ? money(t.min) : `${money(t.min)} to ${money(t.max)}`;
  const shown = all ? lines : lines.slice(0, 3);
  const source = lines.find((l) => l.sourceUrl)?.sourceUrl;
  return (
    <section aria-labelledby="costs" className="mt-8 border-t border-border pt-5">
      <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
        <h2 id="costs" className="text-xl font-semibold text-foreground">Licence costs</h2>
        <p className="text-right text-lg font-semibold text-foreground sm:text-xl">{t.min || t.max ? total : ""}{t.unknown ? `${t.min || t.max ? " + " : ""}council fee` : ""}</p>
      </div>
      <ul>
        {shown.map((l) => (
          <li key={l.documentType} className="flex items-center justify-between gap-4 border-b border-border py-3">
            <span className="min-w-0">
              <span className="block text-base text-foreground">{DOC_LABEL[l.documentType]}</span>
              <span className="block text-sm text-neutral-600">{l.note}</span>
            </span>
            {amount(l) ? <span className="shrink-0 font-semibold text-foreground">{amount(l)}</span> : <span className="shrink-0 text-sm text-neutral-600">Varies, check with council</span>}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-sm">
        {!all && lines.length > 3 ? <button onClick={onAll} className="press inline-flex min-h-11 items-center font-semibold text-primary hover:underline">View all {lines.length}</button> : <span />}
        <span className="text-neutral-600">Including GST.{source && <> <a href={source} target="_blank" rel="noreferrer" className="font-semibold text-primary underline underline-offset-2">Council fee list</a></>}</span>
      </div>
    </section>
  );
}
