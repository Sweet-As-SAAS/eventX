"use client";
import { use, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import type { EventDocument, EventProfile, Requirement } from "@/lib/schemas";
import { keyFacts } from "@/components/profile-fields";
import { DOC_LABEL, STATUS_LABEL } from "@/components/format";
import { Alert, Check, Doc, Refresh, Wand } from "@/components/icons";
import { CHANGED } from "@/components/sidebar";
import { useFail, useToast } from "@/components/toast";
import { Button, ButtonLink, Pill, Skeleton, SourceLine, Spinner, Title, cx } from "@/components/ui";

// Screen 3, Documents. Every pending document drafts and checks in parallel; each row flips as it lands.
// Open expands the document in place; Fix it applies the suggested fix straight away.
const ACT = "press inline-flex min-h-10 min-w-[88px] shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-[15px] font-semibold disabled:cursor-wait";
const ACT_PRIMARY = cx(ACT, "bg-primary text-primary-foreground hover:bg-brand-600");
const ACT_SECONDARY = cx(ACT, "border border-neutral-200 bg-background text-foreground hover:border-neutral-300 hover:bg-neutral-50");
/** A fix that still has a [PLACEHOLDER] (or no fix at all) needs facts only the organiser has. */
const needsYou = (fix: string | null) => !fix || /\[[^\]]+\]/.test(fix);

export default function DocumentsPage({ params }: PageProps<"/events/[id]/documents">) {
  const { id } = use(params);
  const fail = useFail();
  const toast = useToast();
  const [docs, setDocs] = useState<EventDocument[] | null>(null);
  const [reqs, setReqs] = useState<Requirement[]>([]);
  const [profile, setProfile] = useState<EventProfile | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [fixing, setFixing] = useState<string | null>(null);
  const [justFixed, setJustFixed] = useState<string | null>(null);
  const [flashDoc, setFlashDoc] = useState<string | null>(null);
  const started = useRef(false);

  const replace = (d: EventDocument) => { setDocs((ds) => ds?.map((x) => (x.id === d.id ? d : x)) ?? null); return d; };

  function work(d: EventDocument) {
    setFailed((f) => { const n = new Set(f); n.delete(d.id); return n; });
    const run = d.status === "drafted" ? api.check(d.id) : api.draft(d.id).then(replace).then((x) => api.check(x.id));
    run.then(replace).catch((e) => {
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
    setFixing(itemId);
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
      setFixing(null);
    }
  }

  const count = (s: EventDocument["status"]) => docs?.filter((d) => d.status === s).length ?? 0;
  const ready = count("ready"), toFix = count("needs_fix"), working = count("pending") + count("drafted");
  const toggle = (docId: string) => setOpen((o) => (o === docId ? null : docId));

  return (
    <div className="space-y-6">
      <Title sub="Everything the council and licensing team will ask for, drafted from your event details."
        aside={docs && <>
          {ready > 0 && <Pill tone="ok">{ready} ready</Pill>}
          {toFix > 0 && <Pill tone="warn">{toFix} to fix</Pill>}
          {working > 0 && <Pill tone="quiet">{working} drafting</Pill>}
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
              const sub = isFailed ? "Didn't finish drafting."
                : d.status === "needs_fix" && gap ? gap.suggestedFix ?? gap.text
                : req?.reason ?? (d.status === "manual" ? "You lodge this one yourself." : "");
              return (
                <li key={d.id} className={cx("border-b border-border last:border-b-0", d.status === "needs_fix" && "bg-warning-soft/40", flashDoc === d.id && d.status === "ready" && "flash-pass")}>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 sm:flex-nowrap">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-primary"><Doc /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[17px] font-semibold text-foreground">{d.content?.title ?? DOC_LABEL[d.documentType]}</p>
                      <p className="line-clamp-2 text-[15px] text-neutral-600 sm:line-clamp-1">{sub}</p>
                    </div>
                    <div className="ml-14 flex items-center gap-3 sm:ml-0">
                      {isFailed ? <Pill tone="warn">Didn&apos;t finish</Pill>
                        : <Pill tone={d.status === "ready" ? "ok" : d.status === "needs_fix" ? "warn" : "quiet"}>{d.status === "drafted" ? "Checking" : STATUS_LABEL[d.status]}</Pill>}
                      {isFailed ? (
                        <button className={ACT_SECONDARY} onClick={() => work(d)}><Refresh width={16} height={16} /> Try again</button>
                      ) : d.status === "needs_fix" ? (
                        <button className={ACT_PRIMARY} disabled={!!fixing} aria-expanded={isOpen}
                          onClick={() => (gap && !needsYou(gap.suggestedFix) && !isOpen ? fix(d, gap.itemId) : toggle(d.id))}>
                          {fixing && fixing === gap?.itemId ? <><Spinner /> Fixing</> : "Fix it"}
                        </button>
                      ) : (
                        <button className={ACT_SECONDARY} aria-expanded={isOpen} onClick={() => toggle(d.id)}>
                          {isOpen ? "Close" : d.status === "pending" || d.status === "drafted" ? "Continue" : "Open"}
                        </button>
                      )}
                    </div>
                  </div>
                  {isOpen && (
                    <div className="arrive border-t border-border bg-background px-5 py-7 sm:pl-[76px] sm:pr-10">
                      <DocumentDetail doc={d} profile={profile} req={req} failed={isFailed} retry={() => work(d)}
                        fixing={fixing} justFixed={justFixed} onFix={(itemId, text) => fix(d, itemId, text)} />
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
          <ButtonLink href={`/events/${id}/site-plan`} className="min-h-12 px-7 text-[17px]">Continue to site plan</ButtonLink>
          <ButtonLink href={`/events/${id}/profile`} variant="ghost" className="!text-neutral-700 hover:!bg-neutral-50">Back</ButtonLink>
        </div>
      )}
    </div>
  );
}

function DocumentDetail({ doc, profile, req, failed, retry, fixing, justFixed, onFix }: {
  doc: EventDocument; profile: EventProfile | null; req?: Requirement; failed: boolean; retry: () => void;
  fixing: string | null; justFixed: string | null; onFix: (itemId: string, text?: string) => void;
}) {
  if (doc.status === "manual") {
    return (
      <div className="space-y-4">
        <p className="max-w-prose text-lg text-neutral-700">
          {doc.documentType === "event_permit_application"
            ? "It's the council's own form, so you lodge it. We've gathered your answers below to copy straight in."
            : <>You handle this one. HostReady doesn&apos;t draft it.</>}
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

  const items = doc.checkResults.items;
  const pass = items.filter((i) => i.pass).length;
  const gaps = doc.content.placeholders.length;

  return (
    <article className="arrive space-y-10">
      <section aria-labelledby="checklist">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="checklist" className="text-lg font-semibold text-foreground">Council checklist</h3>
          <p className="text-base font-medium tabular-nums text-neutral-700">{pass} of {items.length} pass</p>
        </div>
        {doc.checklistSource && <SourceLine url={doc.checklistSource.url} checked={doc.checklistSource.lastChecked} className="mt-1" />}
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
                {!it.pass && <FixItem fix={it.suggestedFix} busy={fixing === it.itemId} disabled={!!fixing} onFix={(text) => onFix(it.itemId, text)} />}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <details className="group">
        <summary className="press flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-lg">
          <span className="text-lg font-semibold text-primary"><span className="group-open:hidden">Read the draft</span><span className="hidden group-open:inline">Hide the draft</span></span>
          {gaps > 0 && <span className="text-base text-warning">{gaps} {gaps === 1 ? "gap" : "gaps"} for you to fill before lodging</span>}
        </summary>
        <div className="mt-4 max-w-prose space-y-6 border-l-2 border-neutral-200 pl-5">
          {doc.content.sections.map((s) => (
            <div key={s.heading}>
              <h4 className="text-base font-semibold text-foreground">{s.heading}</h4>
              <p className="mt-1 text-base leading-relaxed text-neutral-800"><Gaps text={s.body} /></p>
            </div>
          ))}
        </div>
      </details>
    </article>
  );
}

/** One red checklist item: the suggested fix, plus a box for facts only the organiser has (names, providers, menus). */
function FixItem({ fix, busy, disabled, onFix }: { fix: string | null; busy: boolean; disabled: boolean; onFix: (text?: string) => void }) {
  const [text, setText] = useState("");
  const ask = needsYou(fix);
  const wantsName = !!fix && /\[[^\]]*NAME[^\]]*\]/i.test(fix); // "volunteers" or "the club" won't pass; the council wants it named
  const typed = text.trim();
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onFix(typed || undefined); }}>
      <p className="text-base text-destructive">Missing from the draft.</p>
      {fix && <p className="text-base text-neutral-800"><span className="font-semibold">Suggested fix: </span><Gaps text={fix} /></p>}
      <label className="block max-w-prose">
        <span className="mb-1 block text-sm font-medium text-neutral-700">
          {wantsName ? "The council wants this named. Type the actual person or company, not a group like \"volunteers\"."
            : ask ? "Only you know this. Add the details and we'll write them into the draft." : "Or say it in your own words (optional)"}
        </span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={1500} disabled={disabled}
          placeholder={wantsName ? "A person's or company's name" : "Names, providers or arrangements, in your words"}
          className="block w-full rounded-lg border border-neutral-300 bg-background px-3 py-2 text-base text-foreground placeholder:text-neutral-400 focus:border-primary focus:outline-none focus:ring-4 focus:ring-brand-100" />
      </label>
      <Button type="submit" busy={busy} disabled={disabled || (ask && !typed)}>
        {!busy && <Wand />} {busy ? "Updating the draft" : typed ? "Add to draft" : "Apply fix"}
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
