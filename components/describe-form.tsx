"use client";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { ArrowUp, Cross, Mic, Paperclip } from "./icons";
import { useFail, useToast } from "./toast";
import { Button, Spinner, cx } from "./ui";

const MAX = 2000;
const ACCEPT = "image/png,image/jpeg,image/webp,image/heic,application/pdf";
const MAX_FILES = 8, MAX_BYTES = 10 * 1024 * 1024;
// Examples for the typing placeholder. The first one previews the demo event (team decision, 27 Sep 2026).
const EXAMPLES = [
  "Music festival at Hagley Park, 500 people, a bar and food trucks…",
  "Night market in Sydenham, 20 stalls, live music…",
  "Jazz picnic in a marquee, drinks at a bar…",
];

/** Typing placeholder (Wyatt). Stops while the field is focused or filled, and under reduced motion. */
function useTypingPlaceholder(active: boolean) {
  const [shown, setShown] = useState(EXAMPLES[0]);
  useEffect(() => {
    if (!active || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let i = 0, n = 0, t: ReturnType<typeof setTimeout>;
    const tick = () => {
      const full = EXAMPLES[i];
      n += 1;
      setShown(full.slice(0, n));
      if (n < full.length) t = setTimeout(tick, 38);
      else t = setTimeout(() => { i = (i + 1) % EXAMPLES.length; n = 0; tick(); }, 2200);
    };
    tick();
    return () => clearTimeout(t);
  }, [active]);
  return shown;
}

const noop = () => () => {};
const speechSupported = () => "SpeechRecognition" in window || "webkitSpeechRecognition" in window;

/** The one form that starts everything. Every event is Christchurch City Council, so there is nothing to pick.
 *  Remount with a new `key` to load a different starting description ("Run it again"). */
export function DescribeForm({ initial = "", autoFocus = false, pill = false }: { initial?: string; autoFocus?: boolean; pill?: boolean }) {
  const router = useRouter();
  const fail = useFail();
  const toast = useToast();
  const uid = useId(); // the landing page shows two of these forms
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState(false);
  const canSpeak = useSyncExternalStore(noop, speechSupported, () => false);
  const [listening, setListening] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const picker = useRef<HTMLInputElement>(null);
  const rec = useRef<{ stop(): void } | null>(null);
  const placeholder = useTypingPlaceholder(!focus && !text);
  const count = <span className="tabular-nums">{text.length.toLocaleString("en-NZ")} of {MAX.toLocaleString("en-NZ")} characters</span>;

  function listen() {
    if (listening) return rec.current?.stop();
    const w = window as any;
    const r = new (w.SpeechRecognition ?? w.webkitSpeechRecognition)();
    r.lang = "en-NZ";
    r.continuous = true;
    r.onresult = (e: any) => {
      const said = Array.from(e.results as ArrayLike<any>).slice(e.resultIndex).map((x) => x[0].transcript).join(" ").trim();
      setText((t) => (t ? `${t.trimEnd()} ${said}` : said).slice(0, MAX));
    };
    r.onerror = (e: any) => e.error !== "aborted" && toast(e.error === "not-allowed" ? "Allow the microphone to speak your description." : "Couldn't hear that. Try again or type it.", "error");
    r.onend = () => setListening(false);
    r.start();
    rec.current = r;
    setListening(true);
  }

  function addFiles(list: FileList | null) {
    const picked = Array.from(list ?? []);
    const big = picked.filter((f) => f.size > MAX_BYTES);
    if (big.length) toast(`${big.map((f) => f.name).join(", ")} ${big.length === 1 ? "is" : "are"} over 10 MB.`, "error");
    setFiles((fs) => [...fs, ...picked.filter((f) => f.size <= MAX_BYTES && !fs.some((x) => x.name === f.name))].slice(0, MAX_FILES));
    if (picker.current) picker.current.value = "";
  }

  // Paperclip and the chosen files. Photos and PDFs (a site plan, a map, a menu) go up with the event.
  const attach = (
    <>
      <input ref={picker} type="file" multiple accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => addFiles(e.target.files)} />
      <button type="button" onClick={() => picker.current?.click()} aria-label="Add photos or PDFs" title="Add photos or PDFs (site plan, map, menu)"
        className="press grid size-11 shrink-0 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100 hover:text-foreground">
        <Paperclip width={20} height={20} />
      </button>
    </>
  );
  const chips = files.length > 0 && (
    <ul aria-label="Attached files" className="flex flex-wrap gap-2">
      {files.map((f) => (
        <li key={f.name} className="flex min-h-9 items-center gap-1.5 rounded-full border border-neutral-200 bg-background pl-3 pr-1 text-sm text-foreground">
          <Paperclip width={14} height={14} className="text-neutral-500" />
          <span className="max-w-52 truncate">{f.name}</span>
          <button type="button" onClick={() => setFiles((fs) => fs.filter((x) => x !== f))} aria-label={`Remove ${f.name}`}
            className="press grid size-7 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-foreground"><Cross width={14} height={14} /></button>
        </li>
      ))}
    </ul>
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    rec.current?.stop();
    setBusy(true);
    try {
      const { id } = await api.createEvent({ council: "ccc", description: text.trim().slice(0, MAX) });
      for (const f of files) await api.attach(id, f);
      router.push(`/events/${id}/profile?new=1`);
    } catch (err) {
      fail(err);
      setBusy(false);
    }
  }

  const tooShort = text.trim().length < 10;

  if (pill) {
    return (
      <form onSubmit={submit}>
        <div className="flex items-end gap-2 rounded-[28px] border border-neutral-200 bg-background py-2 pl-3 pr-2 shadow-[0_10px_30px_-14px_rgb(20_23_36/0.22)] transition-[border-color,box-shadow] duration-150 focus-within:border-primary focus-within:ring-4 focus-within:ring-brand-100">
          <label htmlFor={`${uid}-text`} className="sr-only">Describe your event</label>
          {attach}
          {/* Grows with the text like a chat box; Enter sends, Shift+Enter adds a line. */}
          <textarea id={`${uid}-text`} required minLength={10} maxLength={MAX} value={text} rows={1} autoComplete="off" aria-describedby={`${uid}-count`}
            ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 240)}px`; } }}
            onChange={(e) => setText(e.target.value)} placeholder="Tell us about it in one sentence…"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!tooShort && !busy) e.currentTarget.form?.requestSubmit(); } }}
            className="max-h-60 min-h-12 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-2.5 text-lg leading-7 text-foreground placeholder:text-neutral-500 focus:outline-none" />
          <button type="submit" disabled={busy || tooShort} aria-busy={busy || undefined} aria-label="Check my event" title={tooShort ? "Write at least 10 characters first" : "Check my event"}
            className="press grid size-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-neutral-300">
            {busy ? <Spinner /> : <ArrowUp width={20} height={20} strokeWidth={2.25} />}
          </button>
        </div>
        {chips && <div className="mt-3 px-3">{chips}</div>}
        <p id={`${uid}-count`} className={cx("mt-2 px-7 text-sm text-muted-foreground", text.length < MAX * 0.8 && "sr-only")}>{count}</p>
      </form>
    );
  }

  const field = "block w-full rounded-xl bg-neutral-50 px-4 text-lg text-foreground placeholder:text-neutral-500 ring-1 ring-inset ring-neutral-200 transition-[box-shadow,background-color] duration-150 focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl bg-background p-4 text-left shadow-[0_24px_60px_-20px_rgb(0_20_60/0.45)] sm:p-5">
      <div>
        <label htmlFor={`${uid}-text`} className="mb-1.5 block text-sm font-semibold text-neutral-700">Your event, in your words</label>
        <textarea id={`${uid}-text`} required minLength={10} maxLength={MAX} rows={5} value={text} autoFocus={autoFocus} aria-describedby={`${uid}-count`}
          onChange={(e) => setText(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          placeholder={placeholder} className={cx(field, "resize-y py-3 leading-relaxed")} />
        <p id={`${uid}-count`} className="mt-1.5 text-right text-sm text-muted-foreground">{count}</p>
      </div>
      {chips}
      <div className="flex items-center gap-2">
        {attach}
        {canSpeak && (
          <button type="button" onClick={listen} aria-pressed={listening} aria-label={listening ? "Stop listening" : "Say it instead"} title={listening ? "Stop listening" : "Say it instead"}
            className={cx("press grid size-11 place-items-center rounded-lg", listening ? "bg-destructive-soft text-destructive" : "text-neutral-600 hover:bg-neutral-100 hover:text-foreground")}>
            <Mic />
          </button>
        )}
        <p className="hidden text-sm text-muted-foreground sm:block">{tooShort ? "Write at least 10 characters." : "Nothing is sent to the council."}</p>
        <Button type="submit" busy={busy} disabled={tooShort} className="ml-auto min-h-12 px-6">
          {busy ? "Starting" : "Check my event"}
        </Button>
      </div>
    </form>
  );
}
