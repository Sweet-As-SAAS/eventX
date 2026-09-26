"use client";
import { use, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import type { EventDocument, EventProfile, Requirement } from "@/lib/schemas";
import { keyFacts } from "@/components/profile-fields";
import { namedPeople } from "@/components/people";
import { fillPeople } from "@/lib/people";
import { DOC_LABEL, STATUS_LABEL } from "@/components/format";
import { Alert, Check, Doc, Download, Refresh, Wand } from "@/components/icons";
import { CHANGED } from "@/components/sidebar";
import { useFail, useToast } from "@/components/toast";
import { Button, ButtonA, ButtonLink, Pill, Skeleton, SourceLine, Spinner, Title, cx } from "@/components/ui";

// Screen 3, Documents. Every pending document drafts and checks in parallel; each row flips as it lands.
// Open expands the document in place; Fix it applies the suggested fix straight away.
const ACT = "press inline-flex min-h-11 min-w-[88px] shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-[15px] font-semibold disabled:cursor-wait";
const ACT_PRIMARY = cx(ACT, "bg-primary text-primary-foreground hover:bg-brand-600");
const ACT_SECONDARY = cx(ACT, "border border-neutral-200 bg-background text-foreground hover:border-neutral-300 hover:bg-neutral-50");
/** A suggested fix with a [PLACEHOLDER] needs a fact only the organiser has. Anything else the AI can write itself. */
const needsYou = (fix: string | null) => !!fix && /\[[^\]]+\]/.test(fix);
/** The sentence to fill in. Checkers sometimes wrap it: "Specify who, e.g., '[NAME] will run it.'" -> "[NAME] will run it." */
const template = (fix: string) => fix.match(/['"\u2018\u201c]([^'"\u2019\u201d]*\[[^\]]+\][^'"\u2019\u201d]*)['"\u2019\u201d]/)?.[1] ?? fix;
const autoFixable = (d: EventDocument) => d.checkResults?.items.filter((i) => !i.pass && !needsYou(i.suggestedFix)) ?? [];

export default function DocumentsPage({ params }: PageProps<"/events/[id]/documents">) {
  const { id } = use(params);
  const fail = useFail();
  const toast = useToast();
  const [docs, setDocs] = useState<EventDocument[] | null>(null);
  const [reqs, setReqs] = useState<Requirement[]>([]);
  const [profile, setProfile] = useState<EventProfile | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Record<string, string>>({}); // document id -> checklist item being fixed
  const [sweeping, setSweeping] = useState<Set<string>>(new Set()); // documents where we're fixing everything we can
  const [justFixed, setJustFixed] = useState<string | null>(null);
  const [flashDoc, setFlashDoc] = useState<string | null>(null);
  const started = useRef(false);

  const replace = (d: EventDocument) => { setDocs((ds) => ds?.map((x) => (x.id === d.id ? d : x)) ?? null); return d; };
  const busyOn = (docId: string, itemId: string | null) => setBusy((b) => {
    const n = { ...b };
    if (itemId) n[docId] = itemId; else delete n[docId];
    return n;
  });
  const sweep = (docId: string, on: boolean) => setSweeping((s) => { const n = new Set(s); if (on) n.add(docId); else n.delete(docId); return n; });

  function work(d: EventDocument) {
    setFailed((f) => { const n = new Set(f); n.delete(d.id); return n; });
    const run = d.status === "drafted" ? api.check(d.id) : api.draft(d.id).then(replace).then((x) => api.check(x.id));
    // Once checked, quietly fix whatever the AI can write itself, so the organiser only sees what needs them.
    run.then(replace).then((x) => { if (autoFixable(x).length) fixAll(x, false); }).catch((e) => {
      setFailed((f) => new Set(f).add(d.id));
      fail(e);
    });
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    Promise.all([api.listDocuments(id), api.getEvent(id)])
      .then(([list, ev]) => {
        list = list.filter((d) => d.documentType !== "site_plan"); // drawn on its own step
        setDocs(list);
        setReqs(ev.requirements);
        setProfile(ev.profile);
        list.filter((d) => d.status === "pending" || d.status === "drafted").forEach(work);
      })
      .catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function fix(doc: EventDocument, itemId: string, text?: string) {
    busyOn(doc.id, itemId);
    try {
      const d = replace(await api.fix(doc.id, itemId, text));
      setJustFixed(itemId);
      setFlashDoc(d.id);
      dispatchEvent(new Event(CHANGED));
      const passed = d.checkResults?.items.find((i) => i.itemId === itemId)?.pass;
      if (!passed) toast("Added to the draft, but the council checklist still wants more for this item.", "error");
      else toast(d.status === "ready" ? `Fixed. ${DOC_LABEL[d.documentType]} is ready.` : "Fixed.");
    } catch (e) {
      fail(e);
    } finally {
      busyOn(doc.id, null);
    }
  }

  /** Works through every red item the AI can write itself, one at a time (each fix rewrites the same draft). */
  async function fixAll(doc: EventDocument, announce = true) {
    sweep(doc.id, true);
    let d = doc;
    const tried = new Set<string>();
    try {
      for (;;) {
        const next = autoFixable(d).find((i) => !tried.has(i.itemId));
        if (!next) break;
        tried.add(next.itemId);
        busyOn(d.id, next.itemId);
        d = replace(await api.fix(d.id, next.itemId));
      }
      setFlashDoc(d.id);
      dispatchEvent(new Event(CHANGED));
      const left = d.checkResults?.items.filter((i) => !i.pass).length ?? 0;
      if (announce) toast(d.status === "ready" ? `Fixed. ${DOC_LABEL[d.documentType]} is ready.`
        : left ? `Done what we can. ${left} left ${left === 1 ? "needs" : "need"} a detail from you.` : "Fixed.");
    } catch (e) {
      fail(e);
    } finally {
      busyOn(doc.id, null);
      sweep(doc.id, false);
    }
  }

  const count = (s: EventDocument["status"]) => docs?.filter((d) => d.status === s).length ?? 0;
  const ready = count("ready"), working = count("pending") + count("drafted") + sweeping.size;
  const toFix = count("needs_fix") - sweeping.size;
  const toggle = (docId: string) => setOpen((o) => (o === docId ? null : docId));

  return (
    <div className="space-y-6">
      <Title sub="Everything the council and licensing team will ask for, drafted from your event details."
        aside={docs && <>
          {ready > 0 && <Pill tone="ok">{ready} ready</Pill>}
          {toFix > 0 && <Pill tone="warn">{toFix} to fix</Pill>}
          {working > 0 && <Pill tone="quiet">{working} in progress</Pill>}
        </>}>
        Documents
      </Title>

      <ul className="overflow-hidden rounded-2xl border border-border" aria-busy={!docs}>
        {docs
          ? docs.map((d) => {
              const req = reqs.find((r) => r.documentType === d.documentType);
              const gap = d.checkResults?.items.find((i) => !i.pass);
              const isFailed = failed.has(d.id);
              const isOpen = open === d.id;
              const isSweeping = sweeping.has(d.id);
              const toYou = d.checkResults?.items.filter((i) => !i.pass).length ?? 0;
              const sub = isFailed ? "Didn't finish drafting."
                : isSweeping ? "Fixing what we can, so you only fill in what's left…"
                : d.status === "needs_fix" && gap ? `${toYou} ${toYou === 1 ? "detail" : "details"} for you: ${gap.text}`
                : req?.reason ?? (d.status === "manual" ? "You lodge this one yourself." : "");
              return (
                <li key={d.id} className={cx("border-b border-border last:border-b-0", d.status === "needs_fix" && "bg-warning-soft/40", flashDoc === d.id && d.status === "ready" && "flash-pass")}>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 sm:flex-nowrap">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-primary"><Doc /></span>
                    <div className="min-w-0 flex-1 basis-[calc(100%-3.5rem)] sm:basis-0">
                      <p className="text-[17px] font-semibold text-foreground">{d.content?.title ?? DOC_LABEL[d.documentType]}</p>
                      <p className="line-clamp-2 text-[15px] text-neutral-600 sm:line-clamp-1">{sub}</p>
                      {req && <SourceLine url={req.sourceUrl} checked={req.lastChecked} className="mt-0.5" />}
                    </div>
                    <div className="ml-14 flex items-center gap-3 sm:ml-0">
                      {isFailed ? <Pill tone="warn">Didn&apos;t finish</Pill>
                        : isSweeping ? <Pill tone="quiet">Fixing</Pill>
                        : <Pill tone={d.status === "ready" ? "ok" : d.status === "needs_fix" ? "warn" : "quiet"}>
                            {(d.status === "pending" || d.status === "drafted") && <span className="mr-1.5 inline-flex"><Spinner /></span>}
                            {d.status === "drafted" ? "Checking" : STATUS_LABEL[d.status]}
                          </Pill>}
                      {isFailed ? (
                        <button className={ACT_SECONDARY} onClick={() => work(d)}><Refresh width={16} height={16} /> Try again</button>
                      ) : d.status === "needs_fix" ? (
                        <button className={ACT_PRIMARY} disabled={isSweeping} aria-expanded={isOpen} onClick={() => toggle(d.id)}>
                          {isSweeping ? <><Spinner /> Fixing</> : isOpen ? "Close" : "Fix it"}
                        </button>
                      ) : (
                        <button className={ACT_SECONDARY} aria-expanded={isOpen} onClick={() => toggle(d.id)}>
                          {isOpen ? "Close" : "Open"}
                        </button>
                      )}
                    </div>
                  </div>
                  {isOpen && (
                    <div className="arrive border-t border-border bg-background px-5 py-7 sm:pl-[76px] sm:pr-10">
                      <DocumentDetail doc={d} profile={profile} req={req} failed={isFailed} retry={() => work(d)}
                        busyItem={busy[d.id] ?? null} sweeping={isSweeping} justFixed={justFixed} onFix={(itemId, text) => fix(d, itemId, text)} onFixAll={() => fixAll(d)} />
                    </div>
                  )}
                </li>
              );
            })
          : Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="flex items-center gap-4 border-b border-border px-5 py-4 last:border-b-0" aria-hidden>
                <Skeleton className="size-10 !rounded-xl" />
                <span className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/2" /></span>
                <Skeleton className="h-10 w-24" />
              </li>
            ))}
      </ul>

      {docs && (
        <div className="flex flex-wrap items-center gap-6 pt-2">
          <ButtonLink href={`/events/${id}/site-plan`} variant={toFix ? "secondary" : "primary"} className="min-h-12 px-7 text-[17px]">Continue to site plan</ButtonLink>
          <ButtonLink href={`/events/${id}/profile`} variant="ghost" className="!text-neutral-700 hover:!bg-neutral-50">Back</ButtonLink>
          <p className="basis-full text-base text-neutral-600" aria-live="polite">
            {working ? `Drafting ${working} ${working === 1 ? "document" : "documents"} to the council templates. Each one appears here when it's done.`
              : toFix ? "Fix the red items so your pack is complete and Eventbrite unlocks."
              : "Every draft passes the council checklist. You still read each one before you lodge it."}
          </p>
        </div>
      )}
    </div>
  );
}

function DocumentDetail({ doc, profile, req, failed, retry, busyItem, sweeping, justFixed, onFix, onFixAll }: {
  doc: EventDocument; profile: EventProfile | null; req?: Requirement; failed: boolean; retry: () => void;
  busyItem: string | null; sweeping: boolean; justFixed: string | null; onFix: (itemId: string, text?: string) => void; onFixAll: () => void;
}) {
  if (doc.status === "manual") {
    return (
      <div className="space-y-4">
        <p className="max-w-prose text-lg text-neutral-700">
          {doc.documentType === "event_permit_application"
            ? "It's the council's own form, so you lodge it. We've gathered your answers below to copy straight in."
            : <>You handle this one. EvntX doesn&apos;t draft it.</>}
        </p>
        {req && <p className="max-w-prose text-base text-neutral-700"><span className="font-semibold text-foreground">Why the council needs it: </span>{req.reason.replace(/\.?$/, ".")}</p>}
        {req && <SourceLine url={req.sourceUrl} checked={req.lastChecked} />}
        {doc.documentType === "event_permit_application" && profile && <PermitAnswers profile={profile} />}
      </div>
    );
  }

  if (failed) {
    return (
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-lg text-destructive"><Alert /> This draft didn&apos;t finish.</p>
        <Button variant="secondary" onClick={retry}><Refresh /> Try again</Button>
      </div>
    );
  }

  if (!doc.content || !doc.checkResults) {
    return (
      <div className="space-y-5" aria-busy>
        <p role="status" className="flex items-center gap-2 text-base font-medium text-primary">
          <Spinner /> {doc.content ? "Checking it against the council checklist…" : "Drafting it to the council template…"}
        </p>
        <div className="space-y-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
        <div className="space-y-2 pt-4"><Skeleton className="h-5 w-1/3" /><Skeleton className="h-4" /><Skeleton className="h-4" /><Skeleton className="h-4 w-4/5" /></div>
      </div>
    );
  }

  const items = [...doc.checkResults.items].sort((a, b) => Number(a.pass) - Number(b.pass)); // what needs you first
  const pass = items.filter((i) => i.pass).length;
  const gaps = doc.content.placeholders.length;

  return (
    <article className="arrive space-y-10">
      <section aria-labelledby="checklist">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="checklist" className="text-lg font-semibold text-foreground">Council checklist</h3>
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-base font-medium tabular-nums text-neutral-700">{pass} of {items.length} pass</p>
            {autoFixable(doc).length > 1 && (
              <Button variant="secondary" busy={sweeping} disabled={!!busyItem} onClick={onFixAll}>
                {!sweeping && <Wand />} {sweeping ? "Fixing" : `Fix the ${autoFixable(doc).length} we can`}
              </Button>
            )}
          </div>
        </div>
        <SourceLine url={doc.checklistSource?.url ?? ""} checked={doc.checklistSource?.lastChecked ?? null} className="mt-1" />
        {sweeping && <p role="status" className="mt-3 flex items-center gap-2 text-base font-medium text-primary"><Spinner /> Fixing what we can. You&apos;ll only need to fill in what&apos;s left.</p>}
        <ul className="mt-4 border-t border-border">
          {items.map((it) => (
            <li key={it.itemId} className={cx("flex gap-3 border-b border-border px-1", it.pass ? "py-3" : "py-4", !it.pass && "bg-destructive-soft/60", it.pass && justFixed === it.itemId && "flash-pass")}>
              <span className={cx("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full", it.pass ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground")}>
                {it.pass
                  ? <Check width={14} height={14} strokeWidth={3} className={justFixed === it.itemId ? "tick-draw" : undefined} />
                  : <Alert width={14} height={14} strokeWidth={2.5} />}
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-base font-semibold text-foreground">{it.text}</p>
                {it.pass && justFixed === it.itemId && it.evidence && <p className="text-sm text-muted-foreground">Now says: &ldquo;{it.evidence}&rdquo;</p>}
                {!it.pass && <CouncilQuote quote={doc.checklistSource?.quotes.find((q) => q.itemId === it.itemId)?.quote} />}
                {!it.pass && <FixItem key={it.suggestedFix ?? ""} item={it.text} people={profile ? namedPeople(profile) : []}
                  fix={it.suggestedFix && profile ? fillPeople(it.suggestedFix, profile.people) : it.suggestedFix} busy={busyItem === it.itemId} disabled={!!busyItem || sweeping} onFix={(text) => onFix(it.itemId, text)} />}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <ButtonA href={api.documentPdfUrl(doc.id)} download variant="secondary"><Download /> Download this as a PDF</ButtonA>
        <span className="text-[15px] text-muted-foreground">Laid out to the council&apos;s template{gaps > 0 ? ", with the gaps highlighted" : ""}.</span>
      </div>

      <details className="group">
        <summary className="press flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-lg">
          <span className="text-lg font-semibold text-primary"><span className="group-open:hidden">Read the draft</span><span className="hidden group-open:inline">Hide the draft</span></span>
          {gaps > 0 && <span className="text-base text-warning">{gaps} {gaps === 1 ? "gap" : "gaps"} for you to fill before lodging</span>}
        </summary>
        <div className="mt-4 max-w-prose space-y-6 border-l-2 border-neutral-200 pl-5">
          {doc.content.sections.map((s, i) => (
            <div key={i}>
              <h4 className="text-base font-semibold text-foreground">{s.heading}</h4>
              <p className="mt-1 text-base leading-relaxed text-neutral-800"><Gaps text={s.body} /></p>
            </div>
          ))}
        </div>
      </details>
    </article>
  );
}

/** Why the item is asked, in the council's own words from its form or guide. */
const CouncilQuote = ({ quote }: { quote?: string }) => quote ? (
  <p className="max-w-prose border-l-2 border-neutral-300 pl-3 text-[15px] text-neutral-700">
    <span className="font-medium text-foreground">The council asks: </span>&ldquo;{quote}&rdquo;
  </p>
) : null;

/** One red checklist item. If the AI can write it, one click. If it needs a name or detail, the suggested
 *  sentence is the template: swap the [bracketed] bits and the rest is already written. */
function FixItem({ item, people, fix, busy, disabled, onFix }: {
  item: string; people: { label: string; value: string }[]; fix: string | null; busy: boolean; disabled: boolean; onFix: (text?: string) => void;
}) {
  const [text, setText] = useState(fix ? template(fix) : "");
  const box = useRef<HTMLTextAreaElement>(null);
  // "Attaches food and drinks menus": HostReady holds no files, so the organiser attaches it when lodging.
  if (/^attach/i.test(item)) {
    return (
      <div className="space-y-3">
        <p className="max-w-prose text-base text-neutral-800">You attach this yourself when you lodge. HostReady can&apos;t attach files, so we note it in the draft for you.</p>
        <Button variant="secondary" busy={busy} disabled={disabled}
          onClick={() => onFix(`The organiser will attach this when lodging: ${item.replace(/^attaches\s*/i, "")}.`)}>
          {!busy && <Check />} {busy ? "Updating the draft" : "I'll attach it when I lodge"}
        </Button>
      </div>
    );
  }
  if (!needsYou(fix)) {
    return (
      <div className="space-y-3">
        <p className="text-base text-destructive">Missing from the draft.</p>
        {fix && <p className="text-base text-neutral-800"><span className="font-semibold">Suggested fix: </span>{fix}</p>}
        <Button busy={busy} disabled={disabled} onClick={() => onFix()}>{!busy && <Wand />} {busy ? "Fixing" : "Fix it for me"}</Button>
      </div>
    );
  }
  const left = text.match(/\[[^\]]+\]/g) ?? [];
  const wantsName = left.some((b) => /name/i.test(b));
  // Select the next [bracket] so typing replaces it. After the click has placed the caret, hence the timeout.
  const jump = () => setTimeout(() => {
    const el = box.current, m = el && /\[[^\]]+\]/.exec(el.value);
    if (el && m) el.setSelectionRange(m.index, m.index + m[0].length);
  });
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onFix(text.trim()); }}>
      <p className="text-base text-destructive">Needs a detail only you know.</p>
      <label className="block max-w-prose">
        <span className="mb-1 block text-sm font-medium text-neutral-700">
          {wantsName ? "We've written it. Swap the highlighted bit for the real person or company, not a group like \"volunteers\"."
            : "We've written it. Swap the bracketed bits for your details."}
        </span>
        <textarea ref={box} value={text} onChange={(e) => setText(e.target.value)} onFocus={jump} rows={Math.min(6, Math.ceil(text.length / 70) + 1)} maxLength={1500} disabled={disabled}
          placeholder={wantsName ? "A person's or company's name" : "Names, providers or arrangements, in your words"}
          className="block w-full rounded-lg border border-neutral-300 bg-background px-3 py-2 text-base text-foreground placeholder:text-neutral-500 focus:border-primary focus:outline-none focus:ring-4 focus:ring-brand-100" />
      </label>
      <p className="text-sm text-neutral-700" aria-live="polite">
        {left.length ? <>Still to fill: <Gaps text={[...new Set(left)].join(" ")} /></> : "All filled in."}
      </p>
      {left.length > 0 && people.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-neutral-700">Use someone you named:</span>
          {people.map((p) => (
            <button key={p.label} type="button" disabled={disabled} onClick={() => { setText((t) => t.replace(/\[[^\]]+\]/, p.value)); jump(); }}
              className="press min-h-9 rounded-full border border-neutral-200 px-3 text-sm font-medium text-foreground hover:border-brand-300 hover:bg-brand-50">
              {p.value} <span className="text-muted-foreground">({p.label})</span>
            </button>
          ))}
        </div>
      )}
      <Button type="submit" busy={busy} disabled={disabled || left.length > 0 || !text.trim()}>
        {!busy && <Wand />} {busy ? "Updating the draft" : "Add to draft"}
      </Button>
    </form>
  );
}

/** [PLACEHOLDER] text the organiser must fill, marked so it can't be missed. */
function Gaps({ text }: { text: string }) {
  return text.split(/(\[[^\]]+\])/g).map((part, i) =>
    /^\[[^\]]+\]$/.test(part)
      ? <span key={i} className="rounded bg-warning-soft px-0.5 font-medium text-warning">{part}</span>
      : part,
  );
}

/** The permit is the council's own form, so we hand over every answer we already know, ready to copy across. */
function PermitAnswers({ profile }: { profile: EventProfile }) {
  const toast = useToast();
  const facts = keyFacts(profile);
  const copy = () => navigator.clipboard.writeText(facts.map((f) => `${f.label}: ${f.value}`).join("\n"))
    .then(() => toast("Copied. Paste them into the council form."), () => toast("Couldn't copy. Select the text instead.", "error"));
  return (
    <section aria-labelledby="answers" className="pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="answers" className="text-lg font-semibold text-foreground">Your answers for the permit form</h3>
        <Button variant="secondary" onClick={copy}>Copy all</Button>
      </div>
      <p className="mt-1 text-base text-muted-foreground">Everything we know so far. A dot means we guessed, so check those.</p>
      <dl className="mt-4 border-t border-border">
        {facts.map((f) => (
          <div key={f.label} className="flex gap-6 border-b border-border py-3">
            <dt className="w-20 shrink-0 text-base text-muted-foreground">{f.label}</dt>
            <dd className="flex flex-1 items-start justify-between gap-3 text-base font-medium text-foreground">
              {f.value}
              {f.guess && <span className="mt-2 size-2 shrink-0 rounded-full bg-warning" aria-label="Our guess" />}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
