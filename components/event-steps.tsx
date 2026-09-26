"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api/client";
import { Share } from "./icons";
import { useToast } from "./toast";

// A real sequence, so it is numbered: details, documents, site plan, deadlines.
export const STEPS = [
  { slug: "profile", label: "Details" },
  { slug: "documents", label: "Documents" },
  { slug: "site-plan", label: "Site plan" },
  { slug: "deadlines", label: "Deadlines" },
];

export const eventIdFrom = (path: string) => path.match(/^\/events\/([^/]+)/)?.[1] ?? null;

/** Breadcrumb, which step you are on, and Share. Navigation never animates (Emil). */
export function EventTopBar({ id }: { id: string }) {
  const path = usePathname();
  const toast = useToast();
  const [name, setName] = useState<string | null>(null);
  useEffect(() => { api.getEvent(id).then((ev) => setName(ev.profile?.name.value ?? null)).catch(() => {}); }, [id]);

  const slug = path.split("/").pop() ?? "";
  const at = STEPS.findIndex((s) => s.slug === slug);
  const label = STEPS[at]?.label ?? "";

  async function share() {
    const url = location.href;
    if (navigator.share) return navigator.share({ title: name ?? "Event", url }).catch(() => {});
    navigator.clipboard.writeText(url).then(() => toast("Link copied."), () => toast("Couldn't copy the link.", "error"));
  }

  return (
    <header className="flex min-h-16 items-center justify-between gap-4 border-b border-border px-4 sm:px-10">
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex items-center gap-2 text-[15px] text-neutral-600">
          <li className="hidden shrink-0 sm:block"><Link href="/dashboard" className="hover:text-foreground">Your events</Link></li>
          <li aria-hidden className="hidden text-neutral-400 sm:block">/</li>
          <li className="min-w-0 truncate"><Link href={`/events/${id}/profile`} className="hover:text-foreground">{name ?? "Your event"}</Link></li>
          <li aria-hidden className="text-neutral-400">/</li>
          <li aria-current="page" className="shrink-0 font-semibold text-foreground">{label}</li>
        </ol>
      </nav>
      <div className="flex shrink-0 items-center gap-4">
        {at >= 0 && <span className="hidden text-[15px] text-neutral-600 sm:inline">Step {at + 1} of {STEPS.length}</span>}
        <button onClick={share} className="press inline-flex min-h-10 items-center gap-2 rounded-lg border border-neutral-200 bg-background px-4 text-[15px] font-medium text-foreground hover:border-neutral-300 hover:bg-neutral-50">
          <Share width={16} height={16} /> Share
        </button>
      </div>
    </header>
  );
}
