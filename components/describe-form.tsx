"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import type { CouncilSlug } from "@/lib/schemas";
import { COUNCIL_SHORT, councilFor } from "./council";
import { ArrowUp, Check, Mic } from "./icons";
import { useFail, useToast } from "./toast";
import { Button, Spinner, cx } from "./ui";

const MAX = 2000;
// Illustrative examples for the typing placeholder. Generic, not the demo event.
const EXAMPLES = [
  "School gala in Riccarton, 600 people, beer tent…",
  "Street market in Kaiapoi, 20 stalls, live music…",
  "Club prizegiving in a marquee, drinks at a bar…",
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

/** Where + what: the one form that starts everything. Council comes from the place. */
export function DescribeForm({ initial, autoFocus = false, pill = false }: { initial?: { description: string; council: CouncilSlug } | null; autoFocus?: boolean; pill?: boolean }) {
  const router = useRouter();
  const fail = useFail();
  const toast = useToast();
  const [where, setWhere] = useState("");
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<CouncilSlug | null>(null);
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const [listening, setListening] = useState(false);
  const rec = useRef<{ stop(): void } | null>(null);
  const placeholder = useTypingPlaceholder(!focus && !text);

  useEffect(() => { setCanSpeak("SpeechRecognition" in window || "webkitSpeechRecognition" in window); }, []);
  useEffect(() => { if (initial) { setText(initial.description); setPicked(initial.council); } }, [initial]);

  const detected = councilFor(where) ?? councilFor(text);
  const council = detected ?? picked;
  const needsPick = !detected && (pill ? text.trim().length > 25 : where.trim().length > 2);

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!council) return toast("Pick the council your event is in.", "error");
    rec.current?.stop();
    setBusy(true);
    const place = where.trim();
    const description = place && !text.toLowerCase().includes(place.toLowerCase()) ? `${text.trim()} Location: ${place}.` : text.trim();
    try {
      const { id } = await api.createEvent({ council, description: description.slice(0, MAX) });
      router.push(`/events/${id}/profile?new=1`);
    } catch (err) {
      fail(err);
      setBusy(false);
    }
  }

  const picker = needsPick && (
    <div className="arrive mt-3 flex flex-wrap items-center gap-2 text-sm text-neutral-700">
      <span>Which council is it in?</span>
      {(Object.keys(COUNCIL_SHORT) as CouncilSlug[]).map((c) => (
        <button key={c} type="button" onClick={() => setPicked(c)} aria-pressed={picked === c}
          className={cx("press min-h-9 rounded-full border px-3 font-medium", picked === c ? "border-primary bg-brand-50 text-foreground" : "border-neutral-300 hover:border-primary")}>
          {COUNCIL_SHORT[c]}
        </button>
      ))}
    </div>
  );

  if (pill) {
    return (
      <form onSubmit={submit}>
        <div className="flex items-center gap-2 rounded-full border border-neutral-200 bg-background py-2 pl-7 pr-2 shadow-[0_10px_30px_-14px_rgb(20_23_36/0.22)] transition-[border-color,box-shadow] duration-150 focus-within:border-primary focus-within:ring-4 focus-within:ring-brand-100">
          <label htmlFor="description" className="sr-only">Describe your event</label>
          <input id="description" required minLength={10} maxLength={MAX} value={text} autoComplete="off"
            onChange={(e) => setText(e.target.value)} placeholder="Tell us about it in one sentence…"
            className="min-h-12 min-w-0 flex-1 bg-transparent text-lg text-foreground placeholder:text-neutral-500 focus:outline-none" />
          {detected && <span className="arrive hidden shrink-0 rounded-full bg-marker px-2.5 py-1 text-xs font-semibold text-brand-800 sm:inline">{COUNCIL_SHORT[detected]}</span>}
          <button type="submit" disabled={busy || text.trim().length < 10} aria-busy={busy || undefined} aria-label="Check my event" title="Check my event"
            className="press grid size-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-100">
            {busy ? <Spinner /> : <ArrowUp width={20} height={20} strokeWidth={2.25} />}
          </button>
        </div>
        {picker}
      </form>
    );
  }

  const field = "block w-full rounded-xl bg-neutral-50 px-4 text-lg text-foreground placeholder:text-neutral-400 ring-1 ring-inset ring-transparent transition-[box-shadow,background-color] duration-150 focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl bg-background p-4 text-left shadow-[0_24px_60px_-20px_rgb(0_20_60/0.45)] sm:p-5">
      <div>
        <label htmlFor="where" className="mb-1.5 block text-sm font-semibold text-neutral-700">Where is it?</label>
        <div className="relative">
          <input id="where" value={where} onChange={(e) => setWhere(e.target.value)} autoComplete="off" autoFocus={autoFocus}
            placeholder="Park, hall, street or suburb" className={cx(field, "min-h-12 pr-44")} />
          {detected && (
            <span className="arrive absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-md bg-marker px-2 py-1 text-xs font-semibold text-brand-800">
              <Check width={13} height={13} strokeWidth={2.5} /> {COUNCIL_SHORT[detected]}
            </span>
          )}
        </div>
        {needsPick && (
          <div className="arrive mt-2 flex flex-wrap items-center gap-2 text-sm text-neutral-700">
            <span>Which council is that in?</span>
            {(Object.keys(COUNCIL_SHORT) as CouncilSlug[]).map((c) => (
              <button key={c} type="button" onClick={() => setPicked(c)} aria-pressed={picked === c}
                className={cx("press min-h-9 rounded-full border px-3 font-medium", picked === c ? "border-primary bg-brand-50 text-foreground" : "border-neutral-300 hover:border-primary")}>
                {COUNCIL_SHORT[c]}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <label htmlFor="description" className="mb-1.5 block text-sm font-semibold text-neutral-700">What&apos;s happening?</label>
        <textarea id="description" required minLength={10} maxLength={MAX} rows={3} value={text}
          onChange={(e) => setText(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          placeholder={placeholder} className={cx(field, "resize-none py-3 leading-relaxed")} />
      </div>
      <div className="flex items-center gap-2">
        {canSpeak && (
          <button type="button" onClick={listen} aria-pressed={listening} aria-label={listening ? "Stop listening" : "Say it instead"}
            className={cx("press grid size-11 place-items-center rounded-lg", listening ? "bg-destructive-soft text-destructive" : "text-neutral-600 hover:bg-neutral-100 hover:text-foreground")}>
            <Mic />
          </button>
        )}
        <p className="hidden text-sm text-muted-foreground sm:block">Nothing is sent to the council.</p>
        <Button type="submit" busy={busy} disabled={text.trim().length < 10} className="ml-auto min-h-12 px-6">
          {busy ? "Starting" : "Check my event"}
        </Button>
      </div>
    </form>
  );
}
