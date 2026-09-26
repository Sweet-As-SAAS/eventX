"use client";
import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import type { Classification, EventDetail, EventProfile, FollowUpQuestion } from "@/lib/schemas";
import { COUNCIL_LABEL, questionsLabel } from "@/components/format";
import { field, findPhrases, keyFacts } from "@/components/profile-fields";
import { MarkedText } from "@/components/marked-text";
import { Calendar, Food, Glass, People, Pin, Tent } from "@/components/icons";
import { peopleToAsk } from "@/components/people";
import { useFail } from "@/components/toast";
import { Button, Skeleton, Spinner } from "@/components/ui";

// Step 1, Details: a short summary of the event as we understood it, one edit form, then the quick questions (their own page).
// ?new=1 means fresh from Describe: read the event (AI) first.
type Kind = "text" | "number" | "date" | "time" | "bool" | "alcohol";
type Input = { path: string; label: string; kind: Kind };
const GROUPS: Record<string, Input[]> = {
  name: [{ path: "name", label: "Event name", kind: "text" }],
  when: [{ path: "date", label: "Date", kind: "date" }, { path: "startTime", label: "Starts", kind: "time" }, { path: "endTime", label: "Finishes", kind: "time" }],
  where: [{ path: "venue.name", label: "Venue", kind: "text" }],
  land: [{ path: "venue.councilLand", label: "It's on council land", kind: "bool" }],
  People: [{ path: "peakAttendance", label: "People at the busiest time", kind: "number" }, { path: "childrenAttending", label: "Children coming", kind: "bool" }],
  Alcohol: [{ path: "alcohol.supply", label: "Alcohol", kind: "alcohol" }, { path: "alcohol.area", label: "Where it's served", kind: "text" }],
  Food: [{ path: "food.stalls", label: "Food stalls", kind: "number" }, { path: "food.cookingOnSite", label: "Cooking on site", kind: "bool" }],
  Setup: [
    { path: "structures.marquees", label: "Marquees", kind: "number" },
    { path: "structures.largestMarqueeSqm", label: "Largest marquee, sqm", kind: "number" },
    { path: "structures.stageOver1m", label: "Stage over 1 metre high", kind: "bool" },
    { path: "structures.inflatables", label: "Inflatables", kind: "bool" },
    { path: "structures.mechanicalRides", label: "Mechanical rides", kind: "bool" },
    { path: "generators", label: "Generators", kind: "bool" },
    { path: "amplifiedSound", label: "Amplified sound", kind: "bool" },
    { path: "roadOrFootpathImpact", label: "Roads or footpaths affected", kind: "bool" },
  ],
};

export default function ProfilePage({ params, searchParams }: PageProps<"/events/[id]/profile">) {
  const { id } = use(params);
  const fresh = use(searchParams).new === "1";
  const router = useRouter();
  const pathname = usePathname();
  const fail = useFail();

  const [ev, setEv] = useState<EventDetail | null>(null);
  const [profile, setProfile] = useState<EventProfile | null>(null);
  const [questions, setQuestions] = useState<FollowUpQuestion[] | null>(null);
  const [cls, setCls] = useState<Classification | null>(null);
  const [clsFailed, setClsFailed] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); // "all" while the edit form is open
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [typed, setTyped] = useState(false); // "See what you typed" open
  const started = useRef(false); // dev mode runs effects twice; never pay for two AI calls

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const detail = await api.getEvent(id);
        setEv(detail);
        setCls(detail.classification);
        if (!detail.classification) api.classify(id).then(setCls).catch(() => setClsFailed(true)); // optional: the flow goes on without it
        const r = detail.profile && !fresh ? await api.getProfile(id) : await api.buildProfile(id);
        if (!detail.classification || fresh) api.classify(id).then(setCls).catch(() => {});
        setProfile(r.profile);
        setQuestions(r.questions);
        if (fresh) router.replace(pathname, { scroll: false });
      } catch (e) { fail(e); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function save(edits: { path: string; value: string | number | boolean | null }[]) {
    setSaving(true);
    try {
      const r = await api.editProfile(id, edits);
      setProfile(r.profile);
      setQuestions(r.questions);
      setEditing(null);
    } catch (e) { fail(e); } finally { setSaving(false); }
  }

  async function confirm() {
    if (questions?.length || (profile && peopleToAsk(profile).length)) return router.push(`/events/${id}/questions`);
    setLeaving(true);
    try { await api.requirements(id); router.push(`/events/${id}/documents`); } // keeps existing drafts
    catch (e) { fail(e); setLeaving(false); }
  }

  if (!profile || !ev) {
    return (
      <div className="max-w-2xl py-4 sm:py-8">
        <p role="status" className="step-in flex items-center gap-3 text-xl font-medium text-primary"><Spinner /> Reading your event…</p>
        <p className="mt-3 text-lg text-neutral-600">Picking out what the council cares about. This takes a few seconds.</p>
        <div className="mt-10 space-y-3" aria-hidden>{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
      </div>
    );
  }

  const p = profile;
  const facts = keyFacts(p);
  const fact = (label: string) => facts.find((f) => f.label === label);
  const land = p.venue.councilLand.value;
  const venue = p.venue.name.value;
  const n = questions?.length ?? 0;
  const rows: { label: string; icon: typeof Calendar; value?: string; sub?: string; guess?: boolean }[] = [
    { label: "When", icon: Calendar, ...fact("When") },
    { label: "People", icon: People, ...fact("People") },
    { label: "Where", icon: Pin, value: venue ?? undefined, guess: fact("Where")?.guess,
      sub: `${COUNCIL_LABEL[ev.council]}${land === true ? " land" : land === false ? ", not council land" : ""}` },
    { label: "Alcohol", icon: Glass, ...fact("Alcohol") },
    { label: "Food", icon: Food, ...fact("Food") },
    { label: "Setup", icon: Tent, ...fact("Setup") },
  ];

  return (
    <div className="step-in max-w-[1120px] pb-4">
      <p className="text-[13px] font-semibold uppercase tracking-[0.04em] text-primary">Step 1 of 4 · Check it looks right</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-[-0.025em] text-foreground sm:text-5xl">{p.name.value ?? "Your event"}</h1>
      <ClassChip cls={cls} failed={clsFailed} />

      {editing ? (
        <div className="mt-8 max-w-3xl"><EditForm inputs={Object.values(GROUPS).flat()} profile={p} busy={saving} onSave={save} onCancel={() => setEditing(null)} /></div>
      ) : (
        <>
          <div className="mt-9 grid gap-10 lg:grid-cols-[1fr_360px] lg:gap-14">
            <dl className="grid content-start gap-x-10 gap-y-8 sm:grid-cols-2">
              {rows.map(({ label, icon: Icon, value, sub, guess }) => (
                <div key={label} className="flex gap-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-neutral-50 text-primary"><Icon width={20} height={20} /></span>
                  <div className="min-w-0">
                    <dt className="text-[15px] text-neutral-600">{label}</dt>
                    <dd className="mt-0.5 text-lg font-semibold leading-snug text-foreground">
                      {value ?? <span className="font-normal text-neutral-500">Not set yet</span>}
                      {guess && <span className="ml-2 align-middle text-sm font-medium text-warning">our guess</span>}
                    </dd>
                    {sub && <dd className="mt-1 text-[15px] text-neutral-600">{sub}</dd>}
                  </div>
                </div>
              ))}
            </dl>
            <VenueMap eventId={id} venue={venue} />
          </div>

          <WhyNote cls={cls} failed={clsFailed} />

          <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-border pt-8">
            <Button onClick={confirm} busy={leaving} disabled={!questions} className="min-h-12 px-7 text-[17px]">Looks right</Button>
            <Button variant="secondary" onClick={() => setEditing("all")} className="min-h-12 border-neutral-800 px-5 text-[17px]">Edit details</Button>
            <p className="text-[15px] text-neutral-600" aria-live="polite">
              {leaving ? "Working out which documents the council needs…" : !questions ? "" : n ? `Next, ${questionsLabel(n)}.` : peopleToAsk(p).length ? "Next, who's doing what." : "Next, your documents."}
            </p>
            <button onClick={() => setTyped((t) => !t)} aria-expanded={typed}
              className="press ml-auto inline-flex min-h-11 items-center rounded-lg px-2 text-[15px] font-semibold text-primary hover:underline">
              {typed ? "Hide what you typed" : "See what you typed"}
            </button>
          </div>
          {typed && (
            <section aria-label="What you typed" className="arrive mt-4 max-w-[720px] rounded-2xl bg-neutral-50 px-6 py-5">
              <p className="text-lg leading-[1.7] text-foreground"><MarkedText text={ev.description} phrases={findPhrases(ev.description, p)} /></p>
              <p className="mt-3 flex flex-wrap items-center gap-x-5 text-[15px] text-neutral-600">
                Highlights show what we used.
                <Link href={`/new?from=${id}`} className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline">Change description</Link>
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}

const clsTitle = (c: Classification) => c.category === "unclear" ? "Community or commercial: not clear yet" : `Likely a ${c.category} event`;

/** F14 headline: the "likely" call as a chip under the event name. */
function ClassChip({ cls, failed }: { cls: Classification | null; failed: boolean }) {
  const text = cls ? clsTitle(cls) : failed ? "Community or commercial: ask the council" : null;
  return (
    <p aria-live="polite" className="mt-4 inline-flex min-h-8 items-center gap-2 rounded-full border border-neutral-300 bg-background px-3.5 text-sm font-semibold text-foreground">
      {text ?? <><Spinner /> Checking community or commercial…</>}
    </p>
  );
}

/** F14 reasoning: why we think so, how to put it to the council, and that we hold no verified fee. */
function WhyNote({ cls, failed }: { cls: Classification | null; failed: boolean }) {
  if (!cls && !failed) return null;
  return (
    <section aria-labelledby="why" className="mt-12 grid gap-x-10 gap-y-3 rounded-2xl bg-neutral-50 px-6 py-6 sm:grid-cols-[220px_1fr] sm:px-8">
      <h2 id="why" className="text-lg font-semibold text-foreground">
        {!cls ? "Community or commercial" : cls.category === "unclear" ? "Why it's not clear yet" : `Why we think it's ${cls.category}`}
      </h2>
      <div className="max-w-[640px] space-y-3 text-base leading-relaxed text-neutral-700">
        <p>{cls ? cls.reasoning : "We couldn't work it out from your description. Ask the council when you apply."}</p>
        {cls?.howToPresent && <p><span className="font-semibold text-foreground">When you apply: </span>{cls.howToPresent}</p>}
        <p><span className="font-semibold text-foreground">Council fee: </span>varies, check with the council. They make the final call on community or commercial.</p>
      </div>
    </section>
  );
}

/** The venue at a glance: the real map where we have one (Hagley Park), otherwise a drawn stand-in. */
function VenueMap({ eventId, venue }: { eventId: string; venue: string | null }) {
  const [basemap, setBasemap] = useState<string | null>(null);
  useEffect(() => { api.sitePlan(eventId).then((l) => setBasemap(l.basemap?.url ?? null)).catch(() => {}); }, [eventId]);
  const maps = venue && `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue}, Christchurch`)}`;
  return (
    <figure className="self-start">
      <div className="relative aspect-[36/22] overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50">
        {basemap
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={basemap} alt={`Map of ${venue ?? "the venue"}`} className="size-full object-cover" />
          : (
            <svg viewBox="0 0 360 220" className="size-full" aria-hidden>
              <path d="M0 55h360M0 205h360M36 0v220M305 0v220" stroke="var(--background)" strokeWidth="10" />
              <rect x="70" y="30" width="200" height="110" rx="14" fill="#d9ecd0" />
              <path d="M0 160c60-25 110 25 180 5s120-30 180-10v25c-60-20-110-10-180 10S60 165 0 190Z" fill="var(--brand-100)" />
            </svg>
          )}
        <span className="absolute left-1/2 top-[40%] -translate-x-1/2 -translate-y-full text-primary drop-shadow-sm" aria-hidden>
          <svg width="30" height="38" viewBox="0 0 30 38"><path d="M15 37S2 23.5 2 14a13 13 0 0 1 26 0c0 9.5-13 23-13 23Z" fill="currentColor" /><circle cx="15" cy="14" r="5" fill="var(--background)" /></svg>
        </span>
      </div>
      <figcaption className="mt-3 flex items-baseline justify-between gap-3">
        <span className="font-semibold text-foreground">{venue ?? "Venue not set yet"}</span>
        {maps && <a href={maps} target="_blank" rel="noreferrer" className="text-[15px] font-semibold text-primary hover:underline">Open in Google Maps</a>}
      </figcaption>
    </figure>
  );
}

const ALCOHOL_OPTIONS = [["sold", "Sold"], ["free", "Given away"], ["byo", "BYO"], ["none", "No alcohol"]];
const box = "block min-h-11 w-full rounded-lg border border-neutral-300 bg-background px-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-4 focus:ring-brand-100";

/** One form for every detail. Empty means "not set". */
function EditForm({ inputs, profile, busy, onSave, onCancel }: {
  inputs: Input[]; profile: EventProfile; busy: boolean;
  onSave: (edits: { path: string; value: string | number | boolean | null }[]) => void; onCancel: () => void;
}) {
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    // Only what changed, so untouched fields keep their "our guess" or "stated" source.
    const edits = inputs.map(({ path, kind }) => {
      if (kind === "bool") return { path, value: form.get(path) === "on" };
      const raw = String(form.get(path) ?? "").trim();
      return { path, value: raw === "" ? null : kind === "number" ? Number(raw) : raw };
    }).filter(({ path, value }) => value !== (field(profile, path).value ?? (typeof value === "boolean" ? false : null)));
    if (edits.length) onSave(edits); else onCancel();
  }
  return (
    <form onSubmit={submit} className="arrive grid gap-x-5 gap-y-3 rounded-xl border border-neutral-200 bg-background p-5 sm:grid-cols-2">
      {inputs.map(({ path, label, kind }, i) => {
        const v = field(profile, path).value as string | number | boolean | null;
        if (kind === "bool") {
          return (
            <label key={path} className="flex min-h-11 items-center gap-2.5 text-base text-foreground">
              <input type="checkbox" name={path} defaultChecked={v === true} className="size-4 accent-[var(--primary)]" /> {label}
            </label>
          );
        }
        return (
          <label key={path} className="block">
            <span className="mb-1 block text-sm font-medium text-neutral-700">{label}</span>
            {kind === "alcohol" ? (
              <select name={path} defaultValue={(v as string) ?? ""} className={box}>
                <option value="">Not sure</option>
                {ALCOHOL_OPTIONS.map(([val, text]) => <option key={val} value={val}>{text}</option>)}
              </select>
            ) : (
              <input name={path} type={kind} defaultValue={v === null ? "" : String(v)} autoFocus={i === 0}
                min={kind === "number" ? 0 : undefined} step={kind === "number" ? 1 : undefined} className={box} />
            )}
          </label>
        );
      })}
      <div className="col-span-full flex items-center gap-2 pt-2">
        <Button type="submit" busy={busy} className="min-h-10 px-4 text-[15px]">Save</Button>
        <Button type="button" variant="ghost" onClick={onCancel} className="min-h-10 px-3 text-[15px] !text-neutral-700 hover:!bg-neutral-50">Cancel</Button>
      </div>
    </form>
  );
}

