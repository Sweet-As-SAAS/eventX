"use client";
import { use, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { CouncilSlug, EventSummary } from "@/lib/schemas";
import { DescribeForm } from "@/components/describe-form";
import { fmtDate } from "@/components/format";
import { useFail } from "@/components/toast";

// Screen 1, Describe: one question, nothing else. ?from=<eventId> prefills from a past event ("Run it again").
export default function DescribePage({ searchParams }: PageProps<"/new">) {
  const { from } = use(searchParams);
  const fail = useFail();
  const [initial, setInitial] = useState<{ description: string; council: CouncilSlug } | null>(null);
  const [past, setPast] = useState<EventSummary[]>([]);

  const prefill = (id: string) => api.getEvent(id).then((ev) => setInitial({ description: ev.description, council: ev.council })).catch(fail);

  useEffect(() => {
    api.listEvents().then(setPast).catch(() => {}); // optional shortcut, stays quiet if it fails
    if (typeof from === "string") prefill(from);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6 sm:py-24">
      <h1 className="step-in text-4xl font-medium leading-tight text-foreground sm:text-5xl">What&apos;s your event?</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        Tell us like you&apos;d tell a friend: what, where, when, how many people, and anything like alcohol, food, marquees or rides.
      </p>
      <div className="mt-8">
        <DescribeForm initial={initial} autoFocus />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">Nothing is sent to the council. You lodge it yourself.</p>

      {past.length > 0 && (
        <div className="mt-14">
          <p className="text-sm font-medium text-muted-foreground">Or start from a past event</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {past.map((ev) => (
              <button key={ev.id} type="button" onClick={() => prefill(ev.id)}
                className="press min-h-11 rounded-full border border-neutral-200 px-4 text-base font-medium text-foreground hover:border-brand-300 hover:bg-brand-50">
                {ev.name ?? "Untitled event"}{ev.date && <span className="text-muted-foreground">, {fmtDate(ev.date)}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
