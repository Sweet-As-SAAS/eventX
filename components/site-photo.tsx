"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { Attachment, SiteReview } from "@/lib/schemas";
import { Alert, Check, Doc } from "./icons";
import { useToast } from "./toast";
import { Button, cx } from "./ui";

// The organiser's own site plan picture, and the AI's review of it. The organiser decides: accept the fix or keep theirs.
type Decision = "accepted" | "kept" | null;
const KEY = (id: string) => `evntx:site-review:${id}`;
const box = (b: SiteReview["from"]) => ({ left: `${b.left}%`, top: `${b.top}%`, width: `${b.width}%`, height: `${b.height}%` });

export function SitePhoto({ eventId }: { eventId: string }) {
  const toast = useToast();
  const [files, setFiles] = useState<Attachment[] | null>(null);
  const [decision, setDecision] = useState<Decision>(null);
  useEffect(() => {
    api.attachments(eventId).then((f) => {
      setFiles(f);
      try { setDecision((localStorage.getItem(KEY(eventId)) as Decision) || null); } catch {} // remembered per browser
    }).catch(() => setFiles([]));
  }, [eventId]);

  const decide = (d: Decision) => {
    setDecision(d);
    try { if (d) localStorage.setItem(KEY(eventId), d); else localStorage.removeItem(KEY(eventId)); } catch {}
    if (d === "accepted") toast("Accepted. Move the assembly point on the plan below, and in your health and safety plan.");
  };

  const photo = files?.find((f) => f.type.startsWith("image/"));
  const pdfs = files?.filter((f) => f.type === "application/pdf") ?? [];
  if (!photo && !pdfs.length) return null;
  const review = photo?.review ?? null;

  return (
    <section aria-labelledby="your-plan" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="your-plan" className="text-xl font-semibold text-foreground">Your site plan</h2>
        {photo && <a href={photo.url} target="_blank" rel="noreferrer" className="text-[15px] font-semibold text-primary hover:underline">Open full size</a>}
      </div>
      <div className={cx("grid gap-6", review && "lg:grid-cols-[1fr_340px]")}>
        {photo && (
          <figure className="relative self-start overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={`${photo.name}, the site plan you added`} className="block h-auto w-full" />
            {review && decision !== "accepted" && decision !== "kept" && (
              <span className="absolute animate-pulse rounded-md ring-4 ring-warning" style={box(review.from)} aria-hidden />
            )}
            {review && decision === "accepted" && (
              <>
                <span className="absolute grid place-items-center rounded-md border-2 border-dashed border-destructive bg-destructive/25" style={box(review.from)} aria-hidden>
                  <span className="rounded bg-background/90 px-1.5 text-[11px] font-semibold text-destructive">Old spot</span>
                </span>
                <span className="absolute grid place-items-center rounded-md border-2 border-dashed border-success bg-success/35 text-center" style={box(review.to)} aria-hidden>
                  <span className="rounded bg-background/90 px-1.5 text-[11px] font-semibold leading-tight text-success">Emergency meet-up zone</span>
                </span>
              </>
            )}
            <figcaption className="sr-only">{photo.name}</figcaption>
          </figure>
        )}
        {review && (
          <aside aria-live="polite" className="self-start rounded-2xl border border-neutral-200 bg-background p-5">
            <p className="text-sm font-semibold text-primary">AI review of your site plan</p>
            <h3 className="mt-2 flex gap-2 text-lg font-semibold leading-snug text-foreground">
              <Alert className="mt-1 shrink-0 text-warning" /> {review.issue}
            </h3>
            <p className="mt-2 text-[15px] text-neutral-700">{review.detail}</p>
            <p className="mt-4 text-sm font-semibold text-foreground">Suggested fix</p>
            <p className="mt-1 text-[15px] text-neutral-700">{review.fix}</p>
            {decision === "accepted" ? (
              <div className="mt-5 rounded-xl bg-success-soft px-4 py-3 text-[15px] text-foreground">
                <p className="flex items-center gap-2 font-semibold text-success"><Check strokeWidth={2.5} /> Accepted</p>
                <p className="mt-1">The meet-up zone moves to the {review.toLabel.toLowerCase()}, shown in green. Put it there on the plan below and in your health and safety plan.</p>
                <button onClick={() => decide(null)} className="press mt-2 text-sm font-semibold text-primary hover:underline">Undo</button>
              </div>
            ) : decision === "kept" ? (
              <div className="mt-5 rounded-xl bg-neutral-50 px-4 py-3 text-[15px] text-neutral-700">
                <p className="font-semibold text-foreground">Kept as it is</p>
                <p className="mt-1">Your call. The council may ask why when it checks the plan.</p>
                <button onClick={() => decide(null)} className="press mt-2 text-sm font-semibold text-primary hover:underline">Undo</button>
              </div>
            ) : (
              <div className="mt-5 flex flex-wrap gap-2">
                <Button onClick={() => decide("accepted")}>Accept the fix</Button>
                <Button variant="secondary" onClick={() => decide("kept")}>Keep as is</Button>
              </div>
            )}
          </aside>
        )}
      </div>
      {pdfs.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="PDFs you added">
          {pdfs.map((f) => (
            <li key={f.name}><a href={f.url} target="_blank" rel="noreferrer" className="press inline-flex min-h-10 items-center gap-2 rounded-full border border-neutral-200 px-3 text-sm font-medium text-foreground hover:bg-neutral-50"><Doc width={16} height={16} /> {f.name}</a></li>
          ))}
        </ul>
      )}
    </section>
  );
}
