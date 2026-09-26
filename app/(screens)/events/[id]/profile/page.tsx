"use client";
import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import type { Classification, EventDetail, EventProfile, FollowUpQuestion } from "@/lib/schemas";
import { COUNCIL_LABEL, fmtTime, questionsLabel } from "@/components/format";
import { field, findPhrases, keyFacts } from "@/components/profile-fields";
import { MarkedText } from "@/components/marked-text";
import { useFail } from "@/components/toast";
import { Button, Skeleton, Spinner, cx } from "@/components/ui";
import { Pencil, Pin } from "@/components/icons";

// Step 1, Details: your event as we understood it, every part editable, then the quick questions (their own page).
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
const FACTS = ["People", "Alcohol", "Food", "Setup"];

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
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const started = useRef(false); // dev mode runs effects twice; never pay for two AI calls

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const detail = await api.getEvent(id);
        setEv(detail);
        setCls(detail.classification);
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
    if (questions?.length) return router.push(`/events/${id}/questions`);
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
  const edit = (key: string) => ({ editing: editing === key, open: () => setEditing(key), form: <EditForm inputs={GROUPS[key]} profile={p} busy={saving} onSave={save} onCancel={() => setEditing(null)} /> });
  const d = p.date.value && /^\d{4}-\d{2}-\d{2}$/.test(p.date.value) ? new Date(`${p.date.value}T00:00:00Z`) : null;
  const fmt = (o: Intl.DateTimeFormatOptions) => d?.toLocaleDateString("en-NZ", { timeZone: "UTC", ...o });
  const when = [fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" })?.replace(",", ""),
    p.startTime.value && p.endTime.value && `${fmtTime(p.startTime.value)} to ${fmtTime(p.endTime.value)}`].filter(Boolean).join(", ");
  const facts = keyFacts(p);
  const land = p.venue.councilLand.value;
  const n = questions?.length ?? 0;

  const name = edit("name"), whenE = edit("when"), whereE = edit("where"), landE = edit("land");

  return (
    <div className="step-in max-w-[1100px] pb-4">
      <p className="text-sm font-semibold uppercase tracking-[0.04em] text-primary">Step 1 of 4 · Check it looks right</p>
      {name.editing ? <div className="mt-3 max-w-md">{name.form}</div> : (
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-5xl font-semibold leading-[1.05] tracking-[-0.025em] text-foreground sm:text-[3.25rem]">{p.name.value ?? "Your event"}</h1>
          <EditButton label="Edit the event name" onClick={name.open} />
        </div>
      )}

      <div className="mt-7 flex flex-wrap items-start gap-x-16 gap-y-6">
        {whenE.editing ? <div className="w-full max-w-md">{whenE.form}</div> : (
          <div className="flex items-center gap-4">
            <span className="grid w-14 shrink-0 overflow-hidden rounded-lg border border-neutral-200 bg-background text-center shadow-sm">
              <span className="bg-primary text-sm font-semibold leading-6 text-primary-foreground">{fmt({ month: "short" }) ?? "Date"}</span>
              <span className="text-2xl font-medium leading-9 text-foreground">{fmt({ day: "numeric" }) ?? "?"}</span>
            </span>
            <span>
              <span className="block text-[15px] text-neutral-600">When</span>
              <span className="block text-lg font-semibold text-foreground">{when || "Not set yet"}</span>
            </span>
            <EditButton label="Edit when" onClick={whenE.open} className="ml-6" />
          </div>
        )}
        {whereE.editing ? <div className="w-full max-w-md">{whereE.form}</div> : (
          <div className="flex items-center gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-brand-50 text-primary"><Pin width={22} height={22} /></span>
            <span>
              <span className="block text-[15px] text-neutral-600">Where</span>
              <span className="block text-lg font-semibold text-foreground">{p.venue.name.value ?? "Not set yet"}</span>
            </span>
            <EditButton label="Edit where" onClick={whereE.open} className="ml-6" />
          </div>
        )}
      </div>

      {landE.editing ? <div className="mt-6 max-w-md">{landE.form}</div> : (
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[15px]">
          {cls && cls.category !== "unclear" && <span className="rounded-full border border-neutral-300 px-3 py-1 font-medium text-foreground">Likely a {cls.category} event</span>}
          <span className="text-neutral-600">
            {COUNCIL_LABEL[ev.council]}{land === true ? " land" : land === false ? ", not council land" : ""}{p.venue.councilLand.source === "inferred" && " (our guess)"}
          </span>
          <button onClick={landE.open} className="font-semibold text-primary hover:underline">Change</button>
        </div>
      )}

      <dl className="mt-12 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
        {FACTS.map((label) => {
          const f = facts.find((x) => x.label === label);
          const e = edit(label);
          return (
            <div key={label} className="border-t border-neutral-800 pt-5">
              <div className="flex items-center justify-between gap-2">
                <dt className={cx("text-[15px]", f?.guess ? "text-warning" : "text-neutral-600")}>{label}{f?.guess && " · our guess"}</dt>
                {!e.editing && <EditButton label={`Edit ${label.toLowerCase()}`} onClick={e.open} />}
              </div>
              <dd className="mt-2">{e.editing ? e.form : <span className="text-[22px] leading-snug text-foreground">{f?.value ?? "Not set yet"}</span>}</dd>
            </div>
          );
        })}
      </dl>

      <section aria-labelledby="told" className="mt-9 grid gap-4 border-t border-border pt-8 sm:grid-cols-[190px_1fr]">
        <h2 id="told" className="pt-1 text-sm font-semibold uppercase tracking-[0.04em] text-neutral-600">What you told us</h2>
        <div>
          <p className="max-w-[650px] text-lg leading-[1.75] text-foreground"><MarkedText text={ev.description} phrases={findPhrases(ev.description, p)} /></p>
          <p className="mt-4 flex flex-wrap gap-x-5 text-[15px] text-neutral-600">
            Highlights show what we used.
            <Link href={`/new?from=${id}`} className="font-semibold text-primary hover:underline">Change description</Link>
          </p>
        </div>
      </section>

      <div className="mt-10 flex flex-wrap items-center gap-5">
        <Button onClick={confirm} busy={leaving} disabled={!questions} className="min-h-12 px-7 text-[17px]">Looks right</Button>
        <p className="text-base text-neutral-600">{!questions ? "" : n ? `Next, ${questionsLabel(n)}.` : "Next, your documents."}</p>
      </div>
    </div>
  );
}

function EditButton({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button onClick={onClick} aria-label={label} title={label}
      className={cx("press grid size-9 shrink-0 place-items-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-foreground", className)}>
      <Pencil width={17} height={17} />
    </button>
  );
}

const ALCOHOL_OPTIONS = [["sold", "Sold"], ["free", "Given away"], ["byo", "BYO"], ["none", "No alcohol"]];
const box = "block min-h-10 w-full rounded-lg border border-neutral-300 bg-background px-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-4 focus:ring-brand-100";

/** Small inline form for one part of the event. Empty means "not set". */
function EditForm({ inputs, profile, busy, onSave, onCancel }: {
  inputs: Input[]; profile: EventProfile; busy: boolean;
  onSave: (edits: { path: string; value: string | number | boolean | null }[]) => void; onCancel: () => void;
}) {
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    onSave(inputs.map(({ path, kind }) => {
      if (kind === "bool") return { path, value: form.get(path) === "on" };
      const raw = String(form.get(path) ?? "").trim();
      return { path, value: raw === "" ? null : kind === "number" ? Number(raw) : raw };
    }));
  }
  return (
    <form onSubmit={submit} className="arrive space-y-3 rounded-xl border border-neutral-200 bg-background p-4 shadow-sm">
      {inputs.map(({ path, label, kind }, i) => {
        const v = field(profile, path).value as string | number | boolean | null;
        if (kind === "bool") {
          return (
            <label key={path} className="flex min-h-9 items-center gap-2.5 text-base text-foreground">
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
      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" busy={busy} className="min-h-10 px-4 text-[15px]">Save</Button>
        <Button type="button" variant="ghost" onClick={onCancel} className="min-h-10 px-3 text-[15px] !text-neutral-700 hover:!bg-neutral-50">Cancel</Button>
      </div>
    </form>
  );
}

