"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import type { Attachment, SiteReview } from "@/lib/schemas";
import { Alert, Doc, Paperclip } from "./icons";
import { useFail } from "./toast";
import { Button, Skeleton, cx } from "./ui";

// The organiser's own site plan picture, and the AI's suggestion about it. A suggestion only: where things go is their call.
const box = (b: SiteReview["from"]) => ({ left: `${b.left}%`, top: `${b.top}%`, width: `${b.width}%`, height: `${b.height}%` });

export function SitePhoto({ eventId }: { eventId: string }) {
  const fail = useFail();
  const [files, setFiles] = useState<Attachment[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => { api.attachments(eventId).then(setFiles).catch(() => setFiles([])); }, [eventId]);

  async function add(list: FileList | null) {
    if (!list?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(list)) await api.attach(eventId, f);
      setFiles(await api.attachments(eventId));
    } catch (e) { fail(e); } finally { setUploading(false); }
  }

  if (!files) return <Skeleton className="aspect-video w-full lg:w-2/3" />;
  const photo = files.find((f) => f.type.startsWith("image/"));
  const pdfs = files.filter((f) => f.type === "application/pdf");
  const review = photo?.review ?? null;

  const upload = (
    <>
      <input ref={picker} type="file" multiple accept="image/png,image/jpeg,image/webp,image/heic,application/pdf" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => add(e.target.files)} />
      <Button variant="secondary" busy={uploading} onClick={() => picker.current?.click()}>{!uploading && <Paperclip />} {photo || pdfs.length ? "Add another" : "Add your site plan"}</Button>
    </>
  );

  if (!photo && !pdfs.length) {
    return (
      <section className="rounded-2xl border border-dashed border-neutral-300 px-6 py-10 text-center">
        <p className="text-lg font-semibold text-foreground">No site plan yet</p>
        <p className="mx-auto mt-1 max-w-md text-[15px] text-neutral-600">Add a photo or PDF of your layout: a drawing, a marked-up map or a screenshot all work.</p>
        <div className="mt-4">{upload}</div>
      </section>
    );
  }

  return (
    <section aria-labelledby="your-plan" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="your-plan" className="text-xl font-semibold text-foreground">Your site plan</h2>
        <div className="flex items-center gap-4">
          {photo && <a href={photo.url} target="_blank" rel="noreferrer" className="text-[15px] font-semibold text-primary hover:underline">Open full size</a>}
          {upload}
        </div>
      </div>
      <div className={cx("grid gap-6", review && "lg:grid-cols-[1fr_340px]")}>
        {photo && (
          <figure className="relative self-start overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={`${photo.name}, the site plan you added`} className="block h-auto w-full" />
            {review && (
              <>
                <span className="absolute rounded-md ring-4 ring-warning" style={box(review.from)} aria-hidden />
                <span className="absolute grid place-items-center rounded-md border-2 border-dashed border-success bg-success/30 text-center" style={box(review.to)} aria-hidden>
                  <span className="rounded bg-background/90 px-1.5 text-[11px] font-semibold leading-tight text-success">Suggested spot</span>
                </span>
              </>
            )}
            <figcaption className="sr-only">{photo.name}</figcaption>
          </figure>
        )}
        {review && (
          <aside className="self-start rounded-2xl border border-neutral-200 bg-background p-5">
            <p className="text-sm font-semibold text-primary">Suggestion</p>
            <h3 className="mt-2 flex gap-2 text-lg font-semibold leading-snug text-foreground">
              <Alert className="mt-1 shrink-0 text-warning" /> {review.issue}
            </h3>
            <p className="mt-2 text-[15px] text-neutral-700">{review.detail}</p>
            <p className="mt-4 text-sm font-semibold text-foreground">What we&apos;d suggest</p>
            <p className="mt-1 text-[15px] text-neutral-700">{review.fix}</p>
            <p className="mt-4 flex items-start gap-2 text-[15px] text-neutral-700">
              <span className="mt-1 size-3 shrink-0 rounded-sm border-2 border-dashed border-success bg-success/30" aria-hidden />
              For example, the {review.toLabel.toLowerCase()}, marked on your plan.
            </p>
            <p className="mt-4 text-sm text-neutral-600">It&apos;s a suggestion. Where it goes is your call.</p>
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
