"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api/client";
import { nzToday } from "@/lib/deadlines";
import type { Licence } from "@/lib/schemas";
import { DescribeForm } from "./describe-form";
import { useEvents } from "./event-status";
import { daysBetween } from "./format";
import { Skeleton, cx } from "./ui";

const chip = "press inline-flex min-h-11 items-center rounded-full px-4 text-[15px]";

export function Home({ name }: { name: string | null }) {
  const events = useEvents();
  const [licences, setLicences] = useState<Licence[] | null>(null);
  const today = nzToday();
  useEffect(() => {
    api.licences().then((l) => setLicences([...l].sort((a, b) => a.expiresOn.localeCompare(b.expiresOn)))).catch(() => setLicences([]));
  }, []);

  const upcoming = events?.filter((e) => !e.date || e.date >= today) ?? [];
  const first = name?.split(/\s+/)[0];

  return (
    <div className="flex min-h-[calc(100dvh-3.75rem)] flex-col items-center justify-center px-4 py-16 text-center sm:px-8 lg:min-h-dvh">
      <h1 className="step-in text-4xl font-semibold leading-[1.05] tracking-[-0.025em] text-foreground sm:text-6xl">
        {first ? `Hi ${first}, what are you planning?` : "What are you planning?"}
      </h1>
      <div className="mt-8 w-full max-w-[704px] text-left"><DescribeForm pill /></div>
      <ul className="mt-8 flex max-w-5xl flex-wrap justify-center gap-2.5" aria-label="Where things stand">
        {upcoming.map((e) => (
          <li key={e.id}>
            <Link href={`/events/${e.id}/${e.note.warn ? "documents" : "profile"}`} className={cx(chip, "bg-neutral-100 hover:bg-neutral-200/70")}>
              <span className="font-semibold text-foreground">{e.name ?? "Untitled event"}</span>
              <span className="ml-1.5 text-neutral-600">· {e.note.text}</span>
            </Link>
          </li>
        ))}
        {licences?.map((l) => {
          const left = daysBetween(today, l.expiresOn);
          const soon = left < 90;
          return (
            <li key={l.id}>
              <Link href="/licences" className={cx(chip, soon ? "bg-warning-soft font-medium text-warning hover:brightness-[0.97]" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200/70")}>
                {l.type}, {left < 0 ? "expired" : `${left} ${left === 1 ? "day" : "days"} left`}
              </Link>
            </li>
          );
        })}
        {(!events || !licences) && <li aria-hidden className="flex gap-2.5"><Skeleton className="h-10 w-52 !rounded-full" /><Skeleton className="h-10 w-44 !rounded-full" /></li>}
      </ul>
    </div>
  );
}
