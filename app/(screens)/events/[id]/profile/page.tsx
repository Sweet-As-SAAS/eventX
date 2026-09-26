"use client";
import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import type { Classification, EventDetail, EventProfile, FollowUpQuestion } from "@/lib/schemas";
import { COUNCIL_LABEL, questionsLabel } from "@/components/format";
import { field, keyFacts } from "@/components/profile-fields";
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
  const facts = keyFacts(p).filter((f) => f.label !== "Event");
  const land = p.venue.councilLand.value;
  facts.push({ label: "Council", value: `${COUNCIL_LABEL[ev.council]}${land === true ? " land" : land === false ? ", not council land" : ""}`, guess: p.venue.councilLand.source === "inferred" });
  const n = questions?.length ?? 0;

  return (
    <div className="step-in max-w-2xl pb-4">
      <p className="text-[15px] font-medium text-primary">Step 1 of 4</p>
      <h1 className="mt-1 text-4xl font-semibold tracking-[-0.02em] text-foreground sm:text-5xl">{p.name.value ?? "Your event"}</h1>
      <p className="mt-3 text-lg text-neutral-600">
        Here's what we picked up{cls && cls.category !== "unclear" ? `. It looks like a ${cls.category} event` : ""}. Check it, then answer a few questions so we can fill in your forms.
      </p>

      <ClassificationNote cls={cls} failed={clsFailed} />

      {editing ? (
        <div className="mt-8"><EditForm inputs={Object.values(GROUPS).flat()} profile={p} busy={saving} onSave={save} onCancel={() => setEditing(null)} /></div>
      ) : (
        <dl className="mt-8 divide-y divide-border border-y border-border">
          {facts.map((f) => (
            <div key={f.label} className="grid gap-1 py-3.5 sm:grid-cols-[140px_1fr] sm:gap-6">
              <dt className="text-[15px] text-neutral-600">{f.label}</dt>
              <dd className="text-base text-foreground">
                {f.value}{f.guess && <span className="ml-2 text-sm text-warning">our guess</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {!editing && (
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button onClick={confirm} busy={leaving} disabled={!questions} className="min-h-12 px-7 text-[17px]">
            {!questions ? "Looks right" : n ? `Looks right, ${questionsLabel(n)} next` : peopleToAsk(p).length ? "Looks right, who's doing what next" : "Looks right, go to documents"}
          </Button>
          <Button variant="ghost" onClick={() => setEditing("all")} className="min-h-12 px-4 text-[17px]">Edit details</Button>
          <Link href={`/new?from=${id}`} className="ml-auto text-[15px] font-medium text-neutral-600 hover:text-foreground hover:underline">Change description</Link>
        </div>
      )}
    </div>
  );
}

/** F14: community or commercial, always "likely", with the AI's reasoning. We hold no verified fee, so the fee always says so. */
function ClassificationNote({ cls, failed }: { cls: Classification | null; failed: boolean }) {
  const fee = <p className="mt-2 text-[15px] text-neutral-700"><span className="font-semibold text-foreground">Council fee: </span>varies, check with council.</p>;
  if (!cls) {
    return (
      <section aria-live="polite" className="mt-6 max-w-[650px] rounded-xl bg-neutral-50 px-5 py-4">
        {failed
          ? <p className="text-[15px] text-neutral-700">We couldn&apos;t tell yet whether the council will see this as a community or commercial event. Ask them when you apply.</p>
          : <p role="status" className="flex items-center gap-2 text-[15px] font-medium text-primary"><Spinner /> Checking whether it&apos;s a community or commercial event…</p>}
        {fee}
      </section>
    );
  }
  return (
    <section aria-labelledby="cls" className="mt-6 max-w-[650px] rounded-xl bg-neutral-50 px-5 py-4">
      <h2 id="cls" className="text-[17px] font-semibold text-foreground">
        {cls.category === "unclear" ? "Community or commercial: not clear yet" : `Likely a ${cls.category} event`}
      </h2>
      <p className="mt-1 text-[15px] text-neutral-700">{cls.reasoning}</p>
      {cls.howToPresent && <p className="mt-2 text-[15px] text-neutral-700"><span className="font-semibold text-foreground">When you apply: </span>{cls.howToPresent}</p>}
      {fee}
      <p className="mt-2 text-sm text-muted-foreground">The council makes the final call on this.</p>
    </section>
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
    onSave(inputs.map(({ path, kind }) => {
      if (kind === "bool") return { path, value: form.get(path) === "on" };
      const raw = String(form.get(path) ?? "").trim();
      return { path, value: raw === "" ? null : kind === "number" ? Number(raw) : raw };
    }));
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

