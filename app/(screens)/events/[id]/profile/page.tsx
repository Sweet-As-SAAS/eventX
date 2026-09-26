"use client";
import { use, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import type { Classification, CouncilSlug, EventDetail, EventProfile, FollowUpQuestion } from "@/lib/schemas";
import { COUNCIL_LABEL, fmtTime } from "@/components/format";
import { keyFacts } from "@/components/profile-fields";
import { useFail } from "@/components/toast";
import { Button, Skeleton, Spinner, cx } from "@/components/ui";
import { Check, Pin } from "@/components/icons";

// Step 1, Details, as a guided flow (TurboTax-style): your event at a glance, one question per screen, then on to documents.
// ?new=1 means fresh from Describe: read the event (AI) and get the follow-up questions.
type Step = { kind: "facts" } | { kind: "question"; q: FollowUpQuestion };

export default function ProfilePage({ params, searchParams }: PageProps<"/events/[id]/profile">) {
  const { id } = use(params);
  const fresh = use(searchParams).new === "1";
  const router = useRouter();
  const pathname = usePathname();
  const fail = useFail();

  const [ev, setEv] = useState<EventDetail | null>(null);
  const [profile, setProfile] = useState<EventProfile | null>(null);
  const [asked, setAsked] = useState<FollowUpQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [cls, setCls] = useState<Classification | null>(null);
  const [at, setAt] = useState(0);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [busy, setBusy] = useState<string | null>(null);
  const started = useRef(false); // dev mode runs effects twice; never pay for two AI calls

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const detail = await api.getEvent(id);
        setEv(detail);
        setCls(detail.classification);
        if (!detail.classification) api.classify(id).then(setCls).catch(() => {});
        if (detail.profile && !fresh) return setProfile(detail.profile);
        const r = await api.buildProfile(id);
        setProfile(r.profile);
        setAsked(r.questions);
        if (fresh) router.replace(pathname, { scroll: false });
      } catch (e) { fail(e); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const steps: Step[] = [{ kind: "facts" }, ...asked.map((q) => ({ kind: "question" as const, q }))];
  const step = steps[Math.min(at, steps.length - 1)];

  // Past the last screen: settle the document list (keeps existing drafts), then open Documents.
  async function go(n: number) {
    if (n < steps.length) { setDir(n < at ? "back" : "fwd"); setAt(n); window.scrollTo({ top: 0 }); return; }
    setBusy("done");
    try { await api.requirements(id); router.push(`/events/${id}/documents`); }
    catch (e) { fail(e); setBusy(null); }
  }

  async function answer(q: FollowUpQuestion, option: string) {
    if (answers[q.path] === option) return go(at + 1); // already saved, just move on
    setBusy(option);
    try {
      const r = await api.answer(id, [{ path: q.path, answer: option }]);
      setProfile(r.profile);
      setAnswers((a) => ({ ...a, [q.path]: option }));
      setBusy(null);
      go(at + 1);
    } catch (e) { fail(e); setBusy(null); }
  }

  if (!profile) {
    return (
      <Centered>
        <p role="status" className="step-in flex items-center gap-3 text-xl font-medium text-primary"><Spinner /> Reading your event…</p>
        <p className="mt-3 text-lg text-muted-foreground">Picking out what the council cares about. This takes a few seconds.</p>
        <div className="mt-10 space-y-3" aria-hidden>{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
      </Centered>
    );
  }

  if (step.kind === "facts") {
    return <EventPoster key="poster" profile={profile} council={ev?.council} cls={cls} onConfirm={() => go(1)} busy={busy === "done"} hasQuestions={steps.length > 1} />;
  }

  return (
    <Centered>
      <div className="mb-10 flex items-center gap-4">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100" aria-hidden>
          <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${((at + 1) / steps.length) * 100}%` }} />
        </div>
        <span className="text-sm tabular-nums text-muted-foreground">{Math.min(at, steps.length - 1) + 1} of {steps.length}</span>
      </div>

      <div key={at} data-dir={dir} className="step-in">
        {step.kind === "question" && (
          <>
            <p className="text-base font-medium text-primary">One quick question</p>
            <h1 className="mt-2 text-3xl font-medium leading-tight text-foreground sm:text-4xl">{step.q.question}</h1>
            <p className="mt-2 text-lg text-muted-foreground">Your answer changes what the council needs.</p>
            <div className="mt-8 grid gap-3" role="group" aria-label={step.q.question}>
              {step.q.options.map((o) => {
                const chosen = answers[step.q.path] === o;
                return (
                  <button key={o} onClick={() => answer(step.q, o)} disabled={!!busy}
                    className={cx("press flex min-h-16 items-center justify-between gap-4 rounded-xl border-2 px-5 text-left text-lg font-semibold disabled:cursor-wait",
                      chosen ? "border-primary bg-brand-50 text-foreground" : "border-neutral-200 text-foreground hover:border-brand-300 hover:bg-brand-50")}>
                    {o}
                    {busy === o ? <Spinner /> : chosen ? <Check className="text-primary" /> : null}
                  </button>
                );
              })}
            </div>
            <Nav back={() => go(at - 1)}>{busy === "done" && <p role="status" className="flex items-center gap-2 text-base text-neutral-600"><Spinner /> Opening your documents…</p>}</Nav>
          </>
        )}

      </div>
    </Centered>
  );
}

const Centered = ({ children }: { children: ReactNode }) => <div className="mx-auto max-w-2xl py-4 sm:py-8">{children}</div>;

function Nav({ back, children }: { back?: () => void; children?: ReactNode }) {
  return (
    <div className="mt-10 flex items-center justify-between gap-4">
      {back ? <Button variant="ghost" onClick={back}>Back</Button> : <span />}
      {children}
    </div>
  );
}

/** Step 1 as an event page (Luma-style details): name big on top, date and place, then the rest in a row. */
function EventPoster({ profile: p, council, cls, onConfirm, busy, hasQuestions }: {
  profile: EventProfile; council?: CouncilSlug; cls: Classification | null; onConfirm: () => void; busy: boolean; hasQuestions: boolean;
}) {
  const facts = keyFacts(p).filter((f) => !["Event", "When", "Where"].includes(f.label));
  const d = p.date.value && /^\d{4}-\d{2}-\d{2}$/.test(p.date.value) ? new Date(`${p.date.value}T00:00:00Z`) : null;
  const fmt = (o: Intl.DateTimeFormatOptions) => d?.toLocaleDateString("en-NZ", { timeZone: "UTC", ...o });
  const hours = p.startTime.value && p.endTime.value ? `${fmtTime(p.startTime.value)} to ${fmtTime(p.endTime.value)}` : "Times not set yet";
  const guess = (f: { source: string | null }) => f.source === "inferred";
  return (
    <div className="step-in max-w-[1100px] pb-4">
      <section className="rounded-[28px] bg-brand-50 px-6 py-10 sm:px-11 sm:py-12">
        <p className="text-base text-neutral-600">Here&apos;s your event. Check it looks right.</p>
        <h1 className="mt-2 max-w-4xl text-5xl font-semibold leading-[1.02] tracking-[-0.03em] text-foreground sm:text-[4rem]">{p.name.value ?? "Your event"}</h1>
        <div className="mt-6 flex flex-wrap gap-x-14 gap-y-5">
          <div className="flex items-center gap-3.5">
            <span className="grid w-14 shrink-0 overflow-hidden rounded-lg bg-background text-center shadow-sm">
              <span className="bg-primary text-xs font-semibold leading-5 text-primary-foreground">{fmt({ month: "short" }) ?? "Date"}</span>
              <span className="text-xl font-semibold leading-9 text-foreground">{fmt({ day: "numeric" }) ?? "?"}</span>
            </span>
            <span>
              <span className="block text-lg font-semibold leading-snug text-foreground">{fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" }) ?? "Date not set yet"}</span>
              <span className="block text-base text-neutral-600">{hours}</span>
            </span>
          </div>
          <div className="flex items-center gap-3.5">
            <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-background text-primary shadow-sm"><Pin width={22} height={22} /></span>
            <span>
              <span className="block text-lg font-semibold leading-snug text-foreground">{p.venue.name.value ?? "Venue not set yet"}</span>
              <span className="block text-base text-neutral-600">
                {council ? COUNCIL_LABEL[council] : ""}{p.venue.councilLand.value ? ", council land" : ""}{guess(p.venue.councilLand) && " (our guess)"}
              </span>
            </span>
          </div>
        </div>
        {cls && cls.category !== "unclear" && <p className="mt-6 inline-flex rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-800">Likely a {cls.category} event</p>}
      </section>

      <section aria-label="Event details" className="mt-7">
        <dl className="grid gap-x-8 gap-y-8 border-b border-border pb-7 sm:grid-cols-2 lg:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label} className="border-t border-neutral-800 pt-5">
              <dt className={cx("text-sm", f.guess ? "text-warning" : "text-neutral-600")}>{f.label}{f.guess && " · our guess"}</dt>
              <dd className="mt-1 text-[22px] leading-snug text-foreground">{f.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex flex-wrap items-center gap-5">
          <Button onClick={onConfirm} busy={busy} className="min-h-12 px-7 text-[17px]">Looks right</Button>
          <p className="text-base text-neutral-600">{hasQuestions ? "Next, a quick question." : "Next, your documents."}</p>
        </div>
      </section>
    </div>
  );
}
