"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import type { EventProfile, FollowUpQuestion } from "@/lib/schemas";
import { questionsLabel } from "@/components/format";
import { QUICK_LABEL, quickValue, rolesFor, type RoleKey } from "@/components/people";
import { useFail } from "@/components/toast";
import { Button, ButtonLink, Skeleton, Spinner, cx } from "@/components/ui";

// Step 1, second half: the follow-up questions (each tap saves), then who's doing what (saved on Continue).
// Why each question matters, in plain words. UI copy only; the rules engine decides what actually changes.
const WHY: Record<string, string> = {
  amplifiedSound: "Amplified sound is one of the council permit triggers.",
  roadOrFootpathImpact: "Closures need a traffic management plan, which takes longer to arrange.",
  "structures.largestMarqueeSqm": "Bigger marquees need a building consent check.",
  "structures.mechanicalRides": "Rides need an amusement device permit.",
  "alcohol.supply": "Selling alcohol needs a special licence.",
  "food.cookingOnSite": "Cooking on site changes which food checks apply.",
  openToPublic: "Public events have more council requirements than private ones.",
  peakAttendance: "Crowd size changes the safety plan the council expects.",
};
const CHIP = "press inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 text-base font-medium";
const chip = (on: boolean) => cx(CHIP, on ? "border-primary bg-brand-50 text-foreground ring-1 ring-primary" : "border-neutral-200 bg-background text-foreground hover:border-neutral-300 hover:bg-neutral-50");

export default function QuestionsPage({ params }: PageProps<"/events/[id]/questions">) {
  const { id } = use(params);
  const router = useRouter();
  const fail = useFail();
  const [questions, setQuestions] = useState<FollowUpQuestion[] | null>(null);
  const [profile, setProfile] = useState<EventProfile | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [people, setPeople] = useState<Partial<Record<RoleKey, string>>>({});
  const [later, setLater] = useState<Set<RoleKey>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const load = (r: { profile: EventProfile; questions: FollowUpQuestion[] }) => { setProfile(r.profile); setQuestions(r.questions); };
  useEffect(() => {
    api.getProfile(id).then((r) => {
      load(r);
      setPeople(Object.fromEntries(Object.entries(r.profile.people).map(([k, f]) => [k, f.value ?? ""])));
    }).catch(fail);
  }, [id, fail]);

  async function answer(q: FollowUpQuestion, option: string) {
    const before = answers[q.path];
    setAnswers((a) => ({ ...a, [q.path]: option })); // show it straight away; roll back if the save fails
    setSaving(q.path);
    try { setProfile((await api.answer(id, [{ path: q.path, answer: option }])).profile); } // an answer can change which roles apply
    catch (e) { setAnswers((a) => ({ ...a, [q.path]: before })); fail(e); }
    finally { setSaving(null); }
  }

  const set = (k: RoleKey, v: string) => {
    setPeople((p) => ({ ...p, [k]: v }));
    setLater((l) => { const n = new Set(l); n.delete(k); return n; });
  };

  async function next() {
    setLeaving(true);
    try {
      const edits = roles.flatMap((r) => {
        const v = (people[r.key] ?? "").trim();
        return v !== (profile!.people[r.key].value ?? "") ? [{ path: `people.${r.key}`, value: v || null }] : [];
      });
      if (edits.length) load(await api.editProfile(id, edits));
      await api.requirements(id); // keeps existing drafts
      router.push(`/events/${id}/documents`);
    } catch (e) { fail(e); setLeaving(false); }
  }

  const n = questions?.length ?? 0;
  const done = Object.values(answers).filter(Boolean).length;
  const roles = profile ? rolesFor(profile) : [];
  const named = roles.filter((r) => (people[r.key] ?? "").trim()).length;
  const organiser = (people.organiser ?? "").trim();
  const title = n > 0 ? questionsLabel(n) : "who's doing what";

  return (
    <div className="step-in max-w-[1056px] pb-4">
      <p className="text-[15px] font-semibold text-primary">Almost done</p>
      <h1 className="mt-2 text-4xl font-semibold leading-[1.1] tracking-[-0.01em] text-foreground">{questions ? title.charAt(0).toUpperCase() + title.slice(1) : "A few quick questions"}</h1>
      <p className="mt-3 text-lg text-neutral-600">Your answers decide which documents you need and fill in the names on them. It takes about a minute.</p>

      {(!questions || n > 0) && (
        <ul className="mt-10 border-t border-border" aria-busy={!questions}>
          {questions?.map((q) => (
            <li key={q.path} className="flex flex-col gap-4 border-b border-border py-6 sm:flex-row sm:items-center sm:justify-between sm:gap-10">
              <div className="max-w-xl">
                <p id={`q-${q.path}`} className="text-lg font-semibold text-foreground">{q.question}</p>
                <p className="mt-1 text-[15px] text-neutral-600">{WHY[q.path] ?? "Your answer changes what the council needs."}</p>
              </div>
              <div role="group" aria-labelledby={`q-${q.path}`} className="flex shrink-0 flex-wrap gap-2">
                {q.options.map((o) => (
                  <button key={o} onClick={() => answer(q, o)} aria-pressed={answers[q.path] === o} disabled={saving === q.path}
                    className={cx(chip(answers[q.path] === o), "min-w-[92px] disabled:cursor-wait")}>
                    {saving === q.path && answers[q.path] === o && <Spinner />}{o}
                  </button>
                ))}
              </div>
            </li>
          ))}
          {!questions && Array.from({ length: 3 }, (_, i) => (
            <li key={i} className="flex items-center justify-between border-b border-border py-6" aria-hidden>
              <span className="w-1/2 space-y-2"><Skeleton className="h-5" /><Skeleton className="h-4 w-2/3" /></span>
              <Skeleton className="h-11 w-72" />
            </li>
          ))}
        </ul>
      )}

      {roles.length > 0 && (
        <section aria-labelledby="people" className="mt-12">
          {n > 0 && <h2 id="people" className="text-2xl font-semibold text-foreground">Who&apos;s doing what</h2>}
          <p className={cx("max-w-2xl text-base text-neutral-600", n > 0 && "mt-2")} id={n > 0 ? undefined : "people"}>
            The council wants these people named. We write them into every document so you don&apos;t have to fill gaps later.
            Not sure yet? Tap &ldquo;Not decided yet&rdquo; and we&apos;ll leave a highlighted gap for you.
          </p>
          <ul className="mt-6 border-t border-border">
            {roles.map((r) => {
              const v = people[r.key] ?? "";
              return (
                <li key={r.key} className="grid gap-4 border-b border-border py-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,420px)] sm:gap-10">
                  <div>
                    <label htmlFor={`p-${r.key}`} className="text-lg font-semibold text-foreground">{r.question}</label>
                    <p className="mt-1 text-[15px] text-neutral-600">{r.why}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Goes into: {r.goesInto}</p>
                  </div>
                  <div className="space-y-2">
                    <input id={`p-${r.key}`} value={v} onChange={(e) => set(r.key, e.target.value)} placeholder={r.placeholder}
                      autoComplete={r.key === "organiser" ? "name" : "off"} maxLength={200}
                      className="block min-h-11 w-full rounded-lg border border-neutral-300 bg-background px-3 text-base text-foreground placeholder:text-neutral-400 focus:border-primary focus:outline-none focus:ring-4 focus:ring-brand-100" />
                    <div className="flex flex-wrap gap-2">
                      {r.quick.filter((q) => q !== "same" || organiser).map((q) => {
                        const val = quickValue(q, organiser);
                        return <button key={q} type="button" className={chip(v === val)} aria-pressed={v === val} onClick={() => set(r.key, val)}>{QUICK_LABEL[q]}</button>;
                      })}
                      <button type="button" className={chip(later.has(r.key))} aria-pressed={later.has(r.key)}
                        onClick={() => { setPeople((p) => ({ ...p, [r.key]: "" })); setLater((l) => new Set(l).add(r.key)); }}>
                        Not decided yet
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {questions && n === 0 && roles.length === 0 && <p className="mt-10 border-y border-border py-6 text-lg text-neutral-600">Nothing to ask. Your description covered it.</p>}

      <div className="mt-8 flex flex-wrap items-center gap-6">
        <Button onClick={next} busy={leaving} disabled={!questions} className="min-h-12 px-7 text-[17px]">Continue to documents</Button>
        <ButtonLink href={`/events/${id}/profile`} variant="ghost" className="!text-neutral-700 hover:!bg-neutral-50">Back</ButtonLink>
        {(leaving || n > 0 || roles.length > 0) && (
          <p className="ml-auto text-[15px] text-neutral-600" aria-live="polite">
            {leaving ? "Working out which documents the council needs…" : [n > 0 && `${done} of ${n} answered`, roles.length > 0 && `${named} of ${roles.length} named`].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}
