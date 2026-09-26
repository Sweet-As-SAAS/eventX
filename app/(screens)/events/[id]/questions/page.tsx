"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import type { FollowUpQuestion } from "@/lib/schemas";
import { questionsLabel } from "@/components/format";
import { useFail } from "@/components/toast";
import { Button, ButtonLink, Skeleton, Spinner, cx } from "@/components/ui";

// Step 1, second half: every follow-up question on one page. Each tap saves; answering is optional.
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

export default function QuestionsPage({ params }: PageProps<"/events/[id]/questions">) {
  const { id } = use(params);
  const router = useRouter();
  const fail = useFail();
  const [questions, setQuestions] = useState<FollowUpQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => { api.getProfile(id).then((r) => setQuestions(r.questions)).catch(fail); }, [id, fail]);

  async function answer(q: FollowUpQuestion, option: string) {
    const before = answers[q.path];
    setAnswers((a) => ({ ...a, [q.path]: option })); // show it straight away; roll back if the save fails
    setSaving(q.path);
    try { await api.answer(id, [{ path: q.path, answer: option }]); }
    catch (e) { setAnswers((a) => ({ ...a, [q.path]: before })); fail(e); }
    finally { setSaving(null); }
  }

  async function next() {
    setLeaving(true);
    try { await api.requirements(id); router.push(`/events/${id}/documents`); } // keeps existing drafts
    catch (e) { fail(e); setLeaving(false); }
  }

  const n = questions?.length ?? 0;
  const done = Object.values(answers).filter(Boolean).length;
  const title = questionsLabel(n);

  return (
    <div className="step-in max-w-[1056px] pb-4">
      <p className="text-[15px] font-semibold text-primary">Almost done</p>
      <h1 className="mt-2 text-4xl font-semibold leading-[1.1] tracking-[-0.01em] text-foreground">{questions ? title.charAt(0).toUpperCase() + title.slice(1) : "A few quick questions"}</h1>
      <p className="mt-3 text-lg text-neutral-600">Your answers decide which documents you need. It takes about a minute.</p>

      <ul className="mt-10 border-t border-border" aria-busy={!questions}>
        {questions?.map((q) => (
          <li key={q.path} className="flex flex-col gap-4 border-b border-border py-6 sm:flex-row sm:items-center sm:justify-between sm:gap-10">
            <div className="max-w-xl">
              <p id={`q-${q.path}`} className="text-lg font-semibold text-foreground">{q.question}</p>
              <p className="mt-1 text-[15px] text-neutral-600">{WHY[q.path] ?? "Your answer changes what the council needs."}</p>
            </div>
            <div role="group" aria-labelledby={`q-${q.path}`} className="flex shrink-0 flex-wrap gap-2">
              {q.options.map((o) => {
                const chosen = answers[q.path] === o;
                return (
                  <button key={o} onClick={() => answer(q, o)} aria-pressed={chosen} disabled={saving === q.path}
                    className={cx("press inline-flex min-h-11 min-w-[92px] items-center justify-center gap-2 rounded-lg border px-4 text-base font-medium disabled:cursor-wait",
                      chosen ? "border-primary bg-brand-50 text-foreground ring-1 ring-primary" : "border-neutral-200 bg-background text-foreground hover:border-neutral-300 hover:bg-neutral-50")}>
                    {saving === q.path && chosen && <Spinner />}{o}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
        {!questions && Array.from({ length: 3 }, (_, i) => (
          <li key={i} className="flex items-center justify-between border-b border-border py-6" aria-hidden>
            <span className="w-1/2 space-y-2"><Skeleton className="h-5" /><Skeleton className="h-4 w-2/3" /></span>
            <Skeleton className="h-11 w-72" />
          </li>
        ))}
        {questions?.length === 0 && <li className="border-b border-border py-6 text-lg text-neutral-600">Nothing to ask. Your description covered it.</li>}
      </ul>

      <div className="mt-8 flex flex-wrap items-center gap-6">
        <Button onClick={next} busy={leaving} disabled={!questions} className="min-h-12 px-7 text-[17px]">Continue to documents</Button>
        <ButtonLink href={`/events/${id}/profile`} variant="ghost" className="!text-neutral-700 hover:!bg-neutral-50">Back</ButtonLink>
        <p className="ml-auto text-[15px] text-neutral-600" aria-live="polite">{leaving ? "Working out which documents the council needs…" : n > 0 ? `${done} of ${n} answered. Each answer saves as you tap.` : ""}</p>
      </div>
    </div>
  );
}
