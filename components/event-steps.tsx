"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api/client";
import { Check, Share } from "./icons";
import { useToast } from "./toast";

// A real sequence, so it is numbered: details, documents, site plan, deadlines.
// `done` is the reassurance shown on the next step, once this one is behind you.
export const STEPS = [
  { slug: "profile", label: "Details", done: "Your event details are saved. Change them any time from Details." },
  { slug: "documents", label: "Documents", done: "Your documents are saved. Come back to them whenever you like." },
  { slug: "site-plan", label: "Site plan", done: "Site plan done. Last step: your dates, the PDF pack and tickets." },
  { slug: "deadlines", label: "Deadlines", done: "" },
];

export const eventIdFrom = (path: string) => path.match(/^\/events\/([^/]+)/)?.[1] ?? null;

/** Which step a page belongs to. Questions are the second half of Details. */
export const stepOf = (path: string) => { const last = path.split("/").pop() ?? ""; return last === "questions" ? "profile" : last; };

/** Breadcrumb down to the step, "Step n of 4", and Share. Navigation never animates (Emil). */
export function EventTopBar({ id }: { id: string }) {
  const path = usePathname();
  const toast = useToast();
  const [name, setName] = useState<string | null>(null);
  useEffect(() => { api.getEvent(id).then((ev) => setName(ev.profile?.name.value ?? null)).catch(() => {}); }, [id]);
  // Next scrolls to the page under this bar on navigation; show the bar too.
  useEffect(() => { window.scrollTo({ top: 0 }); }, [path]);

  const at = STEPS.findIndex((s) => s.slug === stepOf(path));
  const reassure = at > 0 ? STEPS[at - 1].done : "";

  async function share() {
    const url = location.href;
    if (navigator.share) return navigator.share({ title: name ?? "Event", url }).catch(() => {});
    navigator.clipboard.writeText(url).then(() => toast("Link copied."), () => toast("Couldn't copy the link.", "error"));
  }

  return (
    <header className="border-b border-border px-4 sm:px-10">
      <div className="flex min-h-16 items-center justify-between gap-4">
        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex items-center gap-2 text-[15px] text-neutral-600">
            <li className="hidden shrink-0 sm:block"><Link href="/dashboard" className="inline-flex min-h-11 items-center hover:text-foreground">Your events</Link></li>
            <li aria-hidden className="hidden text-neutral-500 sm:block">/</li>
            {at >= 0 ? (
              <>
                <li className="min-w-0 truncate"><Link href={`/events/${id}/profile`} className="inline-flex min-h-11 items-center hover:text-foreground">{name ?? "Your event"}</Link></li>
                <li aria-hidden className="text-neutral-500">/</li>
                <li aria-current="page" className="shrink-0 font-semibold text-foreground">{STEPS[at].label}</li>
              </>
            ) : <li aria-current="page" className="min-w-0 truncate font-semibold text-foreground">{name ?? "Your event"}</li>}
          </ol>
        </nav>
        <div className="flex shrink-0 items-center gap-5">
        {at >= 0 && <span className="hidden text-[15px] text-neutral-600 sm:block">Step {at + 1} of {STEPS.length}</span>}
        <button onClick={share} className="press inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-neutral-200 bg-background px-4 text-[15px] font-medium text-foreground hover:border-neutral-300 hover:bg-neutral-50">
          <Share width={16} height={16} /> Share
        </button>
        </div>
      </div>

      {reassure && (
        <p className="flex items-center gap-2 pb-4 text-[15px] text-success">
          <Check width={16} height={16} strokeWidth={2.5} className="shrink-0" /> {reassure}
        </p>
      )}
    </header>
  );
}
