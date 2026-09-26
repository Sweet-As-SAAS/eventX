"use client";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api/client";
import { nzToday } from "@/lib/deadlines";
import type { Deadline, EventDetail, EventDocument } from "@/lib/schemas";
import { Logotype, Mark } from "./brand";
import { STEPS, eventIdFrom, stepOf } from "./event-steps";
import { initials, packNote, useEvents, type EventWithNote } from "./event-status";
import { daysBetween, fmtDay } from "./format";
import { Badge, Calendar, Card, Clipboard, DocLines, Dollar, Home, IdCard, MapIcon, Menu, PanelLeft, Plus } from "./icons";
import { cx } from "./ui";

// Workspace sidebar. On home it lists destinations and your events; inside an event it becomes that event's steps.
// Collapses to an icon rail (remembered per browser). Navigation never animates.
const NAV = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/budget", label: "Budget", icon: Card },
  { href: "/licences", label: "Licences", icon: IdCard },
];
const KEY = "hostready:sidebar";
/** Fire on window after changing a document so the sidebar status catches up. */
export const CHANGED = "hostready:changed";

type Current = { ev: EventDetail; docs: EventDocument[]; deadlines: Deadline[] };

// Collapsed or not lives in localStorage; read it as an external store so the server render stays wide.
const slimSubs = new Set<() => void>();
const readSlim = () => { try { return localStorage.getItem(KEY) === "slim"; } catch { return false; } };
const subscribeSlim = (f: () => void) => { slimSubs.add(f); return () => { slimSubs.delete(f); }; };

export function Sidebar({ name }: { name: string | null }) {
  const path = usePathname();
  const eventId = eventIdFrom(path);
  const [tick, setTick] = useState(0); // bumps when a screen changes an event's status (CHANGED)
  const events = useEvents(`${path}#${tick}`);
  const [loaded, setLoaded] = useState<Current | null>(null);
  const current = loaded && loaded.ev.id === eventId ? loaded : null;
  const slim = useSyncExternalStore(subscribeSlim, readSlim, () => false);
  const [openAt, setOpenAt] = useState<string | null>(null); // the mobile menu, open on this path only
  const open = openAt === path;

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    addEventListener(CHANGED, bump);
    return () => removeEventListener(CHANGED, bump);
  }, []);
  useEffect(() => {
    if (!eventId) return;
    let live = true;
    // Deadlines need a dated profile (409 before that), so ask only once the event has one.
    Promise.all([api.getEvent(eventId), api.listDocuments(eventId)])
      .then(async ([ev, docs]) => ({ ev, docs, deadlines: ev.profile?.date.value ? await api.deadlines(eventId).catch(() => []) : [] }))
      .then((c) => live && setLoaded(c))
      .catch(() => {});
    return () => { live = false; };
  }, [eventId, path, tick]);

  const toggle = () => { try { localStorage.setItem(KEY, slim ? "wide" : "slim"); } catch {} slimSubs.forEach((f) => f()); };
  const ctx = { path, name, events, eventId, current, toggle };

  return (
    <>
      <aside className={cx("sticky top-0 hidden h-dvh shrink-0 border-r border-border bg-neutral-50 lg:block", slim ? "w-[68px]" : "w-[272px]")}>
        {slim ? <Rail {...ctx} /> : <Wide {...ctx} />}
      </aside>
      <div className="flex items-center justify-between border-b border-border bg-neutral-50 px-4 py-2 lg:hidden">
        <Link href="/dashboard" className="flex min-h-11 items-center gap-2.5" aria-label="EvntX home"><Mark size={26} /><Logotype className="text-xl" /></Link>
        <button onClick={() => setOpenAt(open ? null : path)} aria-expanded={open} aria-label="Menu" className="press grid size-11 place-items-center rounded-lg hover:bg-neutral-100"><Menu /></button>
      </div>
      {open && <div className="border-b border-border bg-neutral-50 lg:hidden"><Wide {...ctx} mobile /></div>}
    </>
  );
}

type Ctx = { path: string; name: string | null; events: EventWithNote[] | null; eventId: string | null; current: Current | null; toggle: () => void; mobile?: boolean };

const soonDeadline = (c: Current | null) => !!c?.deadlines.some((d) => daysBetween(nzToday(), d.recommended) <= 14);
// The site plan isn't saved yet, so it flags whenever the event needs one.
const stepFlag = (slug: string, c: Current | null) =>
  slug === "documents" ? !!c && packNote(c.docs).warn
  : slug === "site-plan" ? !!c?.docs.some((d) => d.documentType === "site_plan")
  : slug === "deadlines" ? soonDeadline(c) : false;

const row = (active: boolean) => cx("flex min-h-11 items-center gap-3 rounded-xl px-3 text-base",
  active ? "bg-background font-medium text-foreground shadow-sm" : "text-neutral-700 hover:bg-neutral-100 hover:text-foreground");

/** Expanded sidebar. */
function Wide({ path, name, events, eventId, current, toggle, mobile }: Ctx) {
  const ev = current?.ev.id === eventId ? current : null;
  return (
    <nav aria-label="Workspace" className={cx("flex flex-col px-3.5 pb-4 pt-5", mobile ? "" : "h-full")}>
      {!mobile && (
        <div className="flex items-center justify-between pl-2">
          <Link href="/dashboard" className="press flex min-h-11 items-center gap-2.5 rounded-lg" aria-label="EvntX home">
            <Mark size={26} /><Logotype className="text-xl" />
          </Link>
          <button onClick={toggle} aria-label="Collapse sidebar" title="Collapse sidebar" className="press grid size-11 place-items-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-foreground"><PanelLeft /></button>
        </div>
      )}

      {eventId ? (
        <ul className="mt-5 space-y-1">
          <li><Link href="/dashboard" className={row(false)}>Home</Link></li>
          <li><Link href={`/events/${eventId}/profile`} className={cx(row(true), "font-semibold")}><span className="truncate">{ev?.ev.profile?.name.value ?? "Your event"}</span></Link></li>
          {STEPS.map((s) => {
            const active = stepOf(path) === s.slug;
            const Icon = STEP_ICON[s.slug];
            return (
              <li key={s.slug}>
                <Link href={`/events/${eventId}/${s.slug}`} aria-current={active ? "step" : undefined}
                  className={cx("flex min-h-11 items-center gap-3 rounded-xl px-5 text-base", active ? "bg-background font-semibold text-foreground shadow-sm" : "text-neutral-700 hover:bg-neutral-100 hover:text-foreground")}>
                  <Icon className={active ? "text-primary" : "text-neutral-500"} />
                  {s.label}
                  {stepFlag(s.slug, ev) && <span className="ml-auto size-2 rounded-full bg-warning" aria-label="Needs attention" />}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <>
          <Link href="/new" className="press mt-5 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground hover:bg-brand-600">
            <Plus /> New event
          </Link>
          <ul className="mt-4 space-y-1">
            {NAV.map(({ href, label, icon: Icon }) => (
              <li key={href}><Link href={href} className={row(path === href)}><Icon className="text-neutral-600" /> {label}</Link></li>
            ))}
          </ul>
          {!!events?.length && (
            <div className="mt-7 min-h-0 flex-1 overflow-y-auto">
              <p className="px-3 text-sm font-medium text-neutral-600">Events</p>
              <ul className="mt-2 space-y-0.5">
                {events.map((e) => (
                  <li key={e.id}>
                    <Link href={`/events/${e.id}/${e.note.warn ? "documents" : "profile"}`} className="block rounded-xl px-3 py-2 hover:bg-neutral-100">
                      <span className="block truncate text-base text-foreground">{e.name ?? "Untitled event"}</span>
                      <span className={cx("block text-[13px]", e.note.warn ? "text-warning" : "text-neutral-600")}>
                        {e.date ? `${fmtDay(e.date).replace(",", "")} · ` : ""}{e.note.text}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <div className={cx("mt-auto flex items-center gap-3 border-t border-border px-2 pt-4", mobile && "mt-6")}>
        <Avatar name={name} />
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[15px] font-semibold text-foreground">{shortName(name)}</span>
          <span className="block text-[13px] text-neutral-600">Account and settings</span>
        </span>
      </div>
    </nav>
  );
}

/** Collapsed icon rail. */
function Rail({ path, name, events, eventId, current, toggle }: Ctx) {
  const ev = current?.ev.id === eventId ? current : null;
  const date = ev?.ev.profile?.date.value;
  const d = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
  return (
    <nav aria-label="Workspace" className="flex h-full flex-col items-center gap-2 py-5">
      <Link href="/dashboard" aria-label="EvntX home" className="press grid size-11 place-items-center rounded-lg"><Mark size={26} /></Link>
      <Tile label="Expand sidebar" onClick={toggle}><PanelLeft /></Tile>

      {eventId ? (
        <>
          <Labelled label="Home" href="/dashboard" className="mt-2"><Home /></Labelled>
          <Link href={`/events/${eventId}/profile`} title={ev?.ev.profile?.name.value ?? "Your event"} aria-label={ev?.ev.profile?.name.value ?? "Your event"}
            className="press my-1 flex w-[60px] flex-col items-center gap-1 rounded-xl bg-background py-2 shadow-sm">
            <span className="grid w-9 overflow-hidden rounded-md border border-neutral-200 text-center">
              <span className="bg-primary text-[9px] font-semibold leading-[14px] text-primary-foreground">{d?.toLocaleDateString("en-NZ", { timeZone: "UTC", month: "short" }) ?? "Date"}</span>
              <span className="text-sm font-semibold leading-5 text-foreground">{d?.getUTCDate() ?? "?"}</span>
            </span>
            <span className="text-[11px] font-semibold text-foreground">{initials(ev?.ev.profile?.name.value)}</span>
          </Link>
          {STEPS.map((s) => {
            const Icon = STEP_ICON[s.slug];
            return (
              <Labelled key={s.slug} label={s.label} href={`/events/${eventId}/${s.slug}`} active={stepOf(path) === s.slug} flag={stepFlag(s.slug, ev)}>
                <Icon />
              </Labelled>
            );
          })}
          <span className="my-1.5 h-px w-9 bg-border" />
          <Labelled label="Budget" href="/budget"><Dollar /></Labelled>
          <Labelled label="Licences" href="/licences"><Badge /></Labelled>
        </>
      ) : (
        <>
          <Link href="/new" aria-label="New event" title="New event" className="press mt-3 grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground hover:bg-brand-600"><Plus /></Link>
          {NAV.map(({ href, label, icon: Icon }) => <Tile key={href} label={label} href={href} active={path === href}><Icon /></Tile>)}
          {!!events?.length && <span className="my-2 h-px w-9 bg-border" />}
          {events?.map((e) => (
            <Tile key={e.id} label={`${e.name ?? "Untitled event"}, ${e.note.text}`} href={`/events/${e.id}/${e.note.warn ? "documents" : "profile"}`}>
              <span className="text-sm font-semibold text-foreground">{initials(e.name)}</span>
            </Tile>
          ))}
        </>
      )}

      <span className="mt-auto"><Avatar name={name} /></span>
    </nav>
  );
}

const STEP_ICON: Record<string, typeof Home> = { profile: Clipboard, documents: DocLines, "site-plan": MapIcon, deadlines: Calendar };

/** Rail item inside an event: icon over a small label, amber dot when the step needs you. */
function Labelled({ label, href, active, flag, className, children }: { label: string; href: string; active?: boolean; flag?: boolean; className?: string; children: ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} aria-label={flag ? `${label}, needs attention` : label}
      className={cx("press flex w-[60px] flex-col items-center gap-0.5 rounded-xl pb-1.5 pt-2 text-[10.5px] leading-tight",
        active ? "bg-background font-semibold text-foreground shadow-sm" : "text-neutral-600 hover:bg-neutral-100 hover:text-foreground", className)}>
      <span className={cx("relative", active && "text-primary")}>
        {children}
        {flag && <span className="absolute -right-1 -top-0.5 size-2 rounded-full bg-warning ring-2 ring-neutral-50" aria-hidden />}
      </span>
      {label}
    </Link>
  );
}

function Tile({ label, href, onClick, active, className, children }: { label: string; href?: string; onClick?: () => void; active?: boolean; className?: string; children: ReactNode }) {
  const cls = cx("press grid size-11 place-items-center rounded-xl", active ? "bg-background text-foreground shadow-sm" : "text-neutral-600 hover:bg-neutral-100 hover:text-foreground", className);
  return href
    ? <Link href={href} aria-label={label} title={label} aria-current={active ? "page" : undefined} className={cls}>{children}</Link>
    : <button onClick={onClick} aria-label={label} title={label} className={cls}>{children}</button>;
}

const shortName = (n: string | null) => {
  if (!n) return "Your account";
  const [first, last] = n.split(/\s+/);
  return last ? `${first} ${last[0]}.` : first;
};

const Avatar = ({ name }: { name: string | null }) => (
  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-neutral-100 text-[13px] font-semibold text-neutral-800" aria-hidden>{name ? initials(name) : "?"}</span>
);
