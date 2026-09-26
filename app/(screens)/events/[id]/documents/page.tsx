"use client";
import { use, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import type { EventDocument, EventProfile, Requirement } from "@/lib/schemas";
import { keyFacts } from "@/components/profile-fields";
import { namedPeople } from "@/components/people";
import { fillPeople } from "@/lib/people";
import { DOC_LABEL, STATUS_LABEL } from "@/components/format";
import { Alert, Check, Doc, Download, Pencil, Refresh } from "@/components/icons";
import { CHANGED } from "@/components/sidebar";
import { useFail, useToast } from "@/components/toast";
import { Button, ButtonA, ButtonLink, Pill, Skeleton, SourceLine, Spinner, Title, cx } from "@/components/ui";

// Screen 3, Documents. Every pending document drafts and checks in parallel; each row flips as it lands.
// Nothing is fixed behind the organiser's back: each red item shows what's wrong and they choose or write the wording.
// A draft only counts once they've read it and ticked it.
const ACT = "press inline-flex min-h-11 min-w-[88px] shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-[15px] font-semibold disabled:cursor-wait";
const ACT_PRIMARY = cx(ACT, "bg-primary text-primary-foreground hover:bg-brand-600");
const ACT_SECONDARY = cx(ACT, "border border-neutral-200 bg-background text-foreground hover:border-neutral-300 hover:bg-neutral-50");
/** The sentence to fill in. Checkers sometimes wrap it: "Specify who, e.g., '[NAME] will run it.'" -> "[NAME] will run it." */
const template = (fix: string) => fix.match(/['"‘“]([^'"’”]*\[[^\]]+\][^'"’”]*)['"’”]/)?.[1] ?? fix;
const toRead = (d: EventDocument) => d.status === "ready" && !d.reviewed;

export default function DocumentsPage({ params }: PageProps<"/events/[id]/documents">) {
  const { id } = use(params);
  const fail = useFail();
  const toast = useToast();
  const [docs, setDocs] = useState<EventDocument[] | null>(null);
  const [reqs, setReqs] = useState<Requirement[]>([]);
  const [profile, setProfile] = useState<EventProfile | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Record<string, string>>({}); // document id -> what's in flight (a checklist item, "edit" or "review")
  const [justFixed, setJustFixed] = useState<string | null>(null);
  const [flashDoc, setFlashDoc] = useState<string | null>(null);
  const started = useRef(false);

  const replace = (d: EventDocument) => { setDocs((ds) => ds?.map((x) => (x.id === d.id ? d : x)) ?? null); return d; };
  const busyOn = (docId: string, what: string | null) => setBusy((b) => {
    const n = { ...b };
    if (what) n[docId] = what; else delete n[docId];
    return n;
  });

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

  async function fix(doc: EventDocument, itemId: string, text: string) {
    busyOn(doc.id, itemId);
    try {
      const d = replace(await api.fix(doc.id, itemId, text));
      setJustFixed(itemId);
      dispatchEvent(new Event(CHANGED));
      const passed = d.checkResults?.items.find((i) => i.itemId === itemId)?.pass;
      if (!passed) toast("Added to the draft, but the council checklist still wants more for this item.", "error");
      else toast(d.status === "ready" ? "Added. Now read the draft and tick it off." : "Added to the draft.");
    } catch (e) {
      fail(e);
    } finally {
      busyOn(doc.id, null);
    }
  }

  async function saveEdit(doc: EventDocument, sections: { heading: string; body: string }[]) {
    busyOn(doc.id, "edit");
    try {
      replace(await api.editDocument(doc.id, sections));
      const d = replace(await api.check(doc.id)); // your words, checked against the council checklist again
      dispatchEvent(new Event(CHANGED));
      toast(d.status === "ready" ? "Saved and re-checked. Tick it off when you're happy." : "Saved. The council checklist wants something more, see the red items.");
      return true;
    } catch (e) {
      fail(e);
      return false;
    } finally {
      busyOn(doc.id, null);
    }
  }

  async function review(doc: EventDocument, reviewed: boolean) {
    busyOn(doc.id, "review");
    try {
      const d = replace(await api.review(doc.id, reviewed));
      dispatchEvent(new Event(CHANGED));
      if (!reviewed) return;
      setFlashDoc(d.id);
      // Straight on to the next draft that still needs reading.
      const next = docs?.find((x) => x.id !== d.id && toRead(x));
      setOpen(next?.id ?? null);
      toast(next ? `${DOC_LABEL[d.documentType]} checked. Next: ${DOC_LABEL[next.documentType]}.` : "Every draft is read and checked.");
    } catch (e) {
      fail(e);
    } finally {
      busyOn(doc.id, null);
    }
  }

  const count = (f: (d: EventDocument) => boolean) => docs?.filter(f).length ?? 0;
  const checked = count((d) => d.status === "ready" && d.reviewed);
  const unread = count(toRead);
  const toFix = count((d) => d.status === "needs_fix");
  const working = count((d) => d.status === "pending" || d.status === "drafted");
  const toggle = (docId: string) => setOpen((o) => (o === docId ? null : docId));

  return (
    <div className="space-y-6">
      <Title sub="Everything the council and licensing team will ask for, drafted from your event details. Read each one, change anything that isn't right, and tick it off."
        aside={docs && <>
          {checked > 0 && <Pill tone="ok">{checked} checked</Pill>}
          {unread > 0 && <Pill tone="quiet">{unread} to read</Pill>}
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
              const reds = d.checkResults?.items.filter((i) => !i.pass).length ?? 0;
              const sub = isFailed ? "Didn't finish drafting."
                : d.status === "needs_fix" && gap ? `${reds} ${reds === 1 ? "thing" : "things"} to fix: ${gap.text}`
                : toRead(d) ? "Passes the council checklist. Read it through and tick it off."
                : d.status === "ready" ? "You've read and checked this one."
                : req?.reason ?? (d.status === "manual" ? "You lodge this one yourself." : "");
              return (
                <li key={d.id} className={cx("border-b border-border last:border-b-0", d.status === "needs_fix" && "bg-warning-soft/40", flashDoc === d.id && d.reviewed && "flash-pass")}>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 sm:flex-nowrap">
                    <span className={cx("grid size-10 shrink-0 place-items-center rounded-xl", d.reviewed ? "bg-success text-success-foreground" : "bg-brand-50 text-primary")}>
                      {d.reviewed ? <Check width={18} height={18} strokeWidth={3} /> : <Doc />}
                    </span>
                    <div className="min-w-0 flex-1 basis-[calc(100%-3.5rem)] sm:basis-0">
                      <p className="text-[17px] font-semibold text-foreground">{d.content?.title ?? DOC_LABEL[d.documentType]}</p>
                      <p className="line-clamp-2 text-[15px] text-neutral-600 sm:line-clamp-1">{sub}</p>
                      {req && <SourceLine url={req.sourceUrl} checked={req.lastChecked} className="mt-0.5" />}
                    </div>
                    <div className="ml-14 flex items-center gap-3 sm:ml-0">
                      {isFailed ? <Pill tone="warn">Didn&apos;t finish</Pill>
                        : toRead(d) ? <Pill tone="quiet">To read</Pill>
                        : d.status === "ready" ? <Pill tone="ok">Checked by you</Pill>
                        : <Pill tone={d.status === "needs_fix" ? "warn" : "quiet"}>
                            {(d.status === "pending" || d.status === "drafted") && <span className="mr-1.5 inline-flex"><Spinner /></span>}
                            {d.status === "drafted" ? "Checking" : STATUS_LABEL[d.status]}
                          </Pill>}
                      {isFailed ? (
                        <button className={ACT_SECONDARY} onClick={() => work(d)}><Refresh width={16} height={16} /> Try again</button>
                      ) : (
                        <button className={d.status === "needs_fix" || toRead(d) ? ACT_PRIMARY : ACT_SECONDARY} aria-expanded={isOpen} onClick={() => toggle(d.id)}>
                          {isOpen ? "Close" : d.status === "needs_fix" ? "Fix it" : toRead(d) ? "Read it" : "Open"}
                        </button>
                      )}
                    </div>
                  </div>
                  {isOpen && (
                    <div className="arrive border-t border-border bg-background px-5 py-7 sm:pl-[76px] sm:pr-10">
                      <DocumentDetail doc={d} profile={profile} req={req} failed={isFailed} retry={() => work(d)} busy={busy[d.id] ?? null} justFixed={justFixed}
                        onFix={(itemId, text) => fix(d, itemId, text)} onSave={(sections) => saveEdit(d, sections)} onReview={(r) => review(d, r)} />
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
          <ButtonLink href={`/events/${id}/site-plan`} variant={toFix || unread ? "secondary" : "primary"} className="min-h-12 px-7 text-[17px]">Continue to site plan</ButtonLink>
          <ButtonLink href={`/events/${id}/profile`} variant="ghost" className="!text-neutral-700 hover:!bg-neutral-50">Back</ButtonLink>
          <p className="basis-full text-base text-neutral-600" aria-live="polite">
            {working ? `Drafting ${working} ${working === 1 ? "document" : "documents"} to the council templates. Each one appears here when it's done.`
              : toFix ? "Fix the red items, then read each draft and tick it off. Eventbrite unlocks when they're all checked."
              : unread ? `${unread} ${unread === 1 ? "draft" : "drafts"} still to read and tick off before Eventbrite unlocks.`
              : "Every draft is read and checked by you."}
          </p>
        </div>
      )}
    </div>
  );
}

function DocumentDetail({ doc, profile, req, failed, retry, busy, justFixed, onFix, onSave, onReview }: {
  doc: EventDocument; profile: EventProfile | null; req?: Requirement; failed: boolean; retry: () => void; busy: string | null; justFixed: string | null;
  onFix: (itemId: string, text: string) => void; onSave: (sections: { heading: string; body: string }[]) => Promise<boolean>; onReview: (reviewed: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);

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
      </div>
    );
  }

  const items = [...doc.checkResults.items].sort((a, b) => Number(a.pass) - Number(b.pass)); // what needs you first
  const pass = items.filter((i) => i.pass).length;
  const gaps = doc.content.placeholders.length;
  const people = profile ? namedPeople(profile) : [];

  return (
    <article className="arrive space-y-10">
      <section aria-labelledby="checklist">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="checklist" className="text-lg font-semibold text-foreground">Council checklist</h3>
          <p className="text-base font-medium tabular-nums text-neutral-700">{pass} of {items.length} pass</p>
        </div>
        <SourceLine url={doc.checklistSource?.url ?? ""} checked={doc.checklistSource?.lastChecked ?? null} className="mt-1" />
        <ul className="mt-4 border-t border-border">
          {items.map((it) => (
            <li key={it.itemId} className={cx("flex gap-3 border-b border-border px-1", it.pass ? "py-3" : "py-5", !it.pass && "bg-destructive-soft/60", it.pass && justFixed === it.itemId && "flash-pass")}>
              <span className={cx("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full", it.pass ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground")}>
                {it.pass
                  ? <Check width={14} height={14} strokeWidth={3} className={justFixed === it.itemId ? "tick-draw" : undefined} />
                  : <Alert width={14} height={14} strokeWidth={2.5} />}
              </span>
              <div className="min-w-0 flex-1 space-y-3">
                <p className="text-base font-semibold text-foreground">{it.text}</p>
                {it.pass && justFixed === it.itemId && it.evidence && <p className="text-sm text-muted-foreground">Now says: &ldquo;{it.evidence}&rdquo;</p>}
                {!it.pass && <CouncilQuote quote={doc.checklistSource?.quotes.find((q) => q.itemId === it.itemId)?.quote} />}
                {!it.pass && <FixItem key={`${it.itemId}${it.suggestedFix ?? ""}`} item={it.text} people={people}
                  suggestions={[it.suggestedFix, ...it.alternatives].filter((s): s is string => !!s).map((s) => template(profile ? fillPeople(s, profile.people) : s))}
                  busy={busy === it.itemId} disabled={!!busy} onFix={(text) => onFix(it.itemId, text)} />}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="draft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="draft" className="text-lg font-semibold text-foreground">The draft</h3>
          {!editing && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" disabled={!!busy} onClick={() => setEditing(true)}><Pencil width={16} height={16} /> Edit the wording</Button>
              <ButtonA href={api.documentPdfUrl(doc.id)} download variant="secondary"><Download /> PDF</ButtonA>
            </div>
          )}
        </div>
        <p className="mt-1 max-w-prose text-[15px] text-neutral-600">
          Written from your answers to the council&apos;s template. You know your event best: change anything that isn&apos;t right before you tick it off.
          {gaps > 0 && <span className="text-warning"> {gaps} highlighted {gaps === 1 ? "gap" : "gaps"} to fill.</span>}
        </p>
        {editing
          ? <DraftEditor sections={doc.content.sections} busy={busy === "edit"} onCancel={() => setEditing(false)}
              onSave={async (s) => { if (await onSave(s)) setEditing(false); }} />
          : (
            <div className="mt-5 max-w-prose space-y-6 border-l-2 border-neutral-200 pl-5">
              {doc.content.sections.map((s, i) => (
                <div key={i}>
                  <h4 className="text-base font-semibold text-foreground">{s.heading}</h4>
                  <p className="mt-1 whitespace-pre-line text-base leading-relaxed text-neutral-800"><Gaps text={s.body} /></p>
                </div>
              ))}
            </div>
          )}
      </section>

      <ReviewTick doc={doc} busy={busy === "review"} disabled={editing || (!!busy && busy !== "review")} onReview={onReview} />
    </article>
  );
}

/** Every section's wording, editable. Headings stay the council's. */
function DraftEditor({ sections, busy, onSave, onCancel }: {
  sections: { heading: string; body: string }[]; busy: boolean; onSave: (s: { heading: string; body: string }[]) => void; onCancel: () => void;
}) {
  const [bodies, setBodies] = useState(sections.map((s) => s.body));
  const changed = bodies.some((b, i) => b !== sections[i].body);
  return (
    <form className="arrive mt-5 max-w-prose space-y-5" onSubmit={(e) => { e.preventDefault(); onSave(sections.map((s, i) => ({ heading: s.heading, body: bodies[i] }))); }}>
      {sections.map((s, i) => (
        <label key={i} className="block">
          <span className="mb-1 block text-base font-semibold text-foreground">{s.heading}</span>
          <textarea value={bodies[i]} onChange={(e) => setBodies((b) => b.map((x, j) => (j === i ? e.target.value : x)))} maxLength={8000}
            rows={Math.min(14, Math.ceil(bodies[i].length / 75) + 2)}
            className="block w-full rounded-lg border border-neutral-300 bg-background px-3 py-2 text-base leading-relaxed text-foreground focus:border-primary focus:outline-none focus:ring-4 focus:ring-brand-100" />
        </label>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" busy={busy} disabled={!changed}>{busy ? "Saving and re-checking" : "Save changes"}</Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy} className="!text-neutral-700 hover:!bg-neutral-50">Cancel</Button>
        <span className="text-sm text-neutral-600">We&apos;ll check your wording against the council checklist again.</span>
      </div>
    </form>
  );
}

/** The organiser's sign-off. Only a draft with nothing red can be ticked; any change to the wording clears it. */
function ReviewTick({ doc, busy, disabled, onReview }: { doc: EventDocument; busy: boolean; disabled: boolean; onReview: (r: boolean) => void }) {
  const red = doc.status !== "ready";
  return (
    <div className={cx("rounded-2xl border px-5 py-4", doc.reviewed ? "border-success bg-success-soft" : "border-neutral-300 bg-neutral-50")}>
      <label className={cx("flex items-start gap-3", red ? "cursor-not-allowed" : "cursor-pointer")}>
        <input type="checkbox" checked={doc.reviewed} disabled={red || disabled || busy} onChange={(e) => onReview(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]" />
        <span>
          <span className="block text-base font-semibold text-foreground">
            {busy && <span className="mr-2 inline-flex align-middle"><Spinner /></span>}
            I&apos;ve read this draft and checked it&apos;s right for my event
          </span>
          <span className="mt-0.5 block text-[15px] text-neutral-600">
            {red ? "Fix the red checklist items above first." : doc.reviewed ? "Done. If you change the wording, you'll tick it again." : "The council holds you to what it says, so give it a proper read."}
          </span>
        </span>
      </label>
    </div>
  );
}

/** Why the item is asked, in the council's own words from its form or guide. */
const CouncilQuote = ({ quote }: { quote?: string }) => quote ? (
  <p className="max-w-prose border-l-2 border-neutral-300 pl-3 text-[15px] text-neutral-700">
    <span className="font-medium text-foreground">The council asks: </span>&ldquo;{quote}&rdquo;
  </p>
) : null;

/** One red checklist item: what's wrong, a few ways to word it, and the organiser's own wording wins. Nothing is added until they say so. */
function FixItem({ item, people, suggestions, busy, disabled, onFix }: {
  item: string; people: { label: string; value: string }[]; suggestions: string[]; busy: boolean; disabled: boolean; onFix: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<number | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  // "Attaches food and drinks menus": EvntX holds no files, so the organiser attaches it when lodging.
  if (/^attach/i.test(item)) {
    return (
      <div className="space-y-3">
        <p className="max-w-prose text-base text-neutral-800">You attach this yourself when you lodge. EvntX can&apos;t attach files, so we note it in the draft for you.</p>
        <Button variant="secondary" busy={busy} disabled={disabled}
          onClick={() => onFix(`The organiser will attach this when lodging: ${item.replace(/^attaches\s*/i, "")}.`)}>
          {!busy && <Check />} {busy ? "Updating the draft" : "I'll attach it when I lodge"}
        </Button>
      </div>
    );
  }
  const left = text.match(/\[[^\]]+\]/g) ?? [];
  // Select the next [bracket] so typing replaces it. After the click has placed the caret, hence the timeout.
  const jump = () => setTimeout(() => {
    const el = box.current, m = el && /\[[^\]]+\]/.exec(el.value);
    if (el && m) { el.focus(); el.setSelectionRange(m.index, m.index + m[0].length); }
  });
  const pick = (i: number) => { setPicked(i); setText(suggestions[i]); jump(); };
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onFix(text.trim()); }}>
      <p className="text-base text-destructive">The draft doesn&apos;t cover this yet, so the council would send it back.</p>
      {suggestions.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold text-foreground">Pick one to start from, or write your own below</legend>
          {suggestions.map((s, i) => (
            <label key={i} className={cx("flex cursor-pointer gap-3 rounded-xl border bg-background px-4 py-3 text-[15px] leading-relaxed",
              picked === i ? "border-primary ring-1 ring-primary" : "border-neutral-200 hover:border-neutral-300")}>
              <input type="radio" name={`fix-${item}`} checked={picked === i} onChange={() => pick(i)} disabled={disabled} className="mt-1 size-4 shrink-0 accent-[var(--primary)]" />
              <span className="text-neutral-800"><Gaps text={s} /></span>
            </label>
          ))}
        </fieldset>
      )}
      <label className="block max-w-prose">
        <span className="mb-1 block text-sm font-semibold text-foreground">What the draft should say</span>
        <textarea ref={box} value={text} onChange={(e) => { setText(e.target.value); setPicked(null); }} onFocus={() => left.length && jump()}
          rows={Math.max(3, Math.min(6, Math.ceil(text.length / 70) + 1))} maxLength={1500} disabled={disabled}
          placeholder="Your own words, or pick a suggestion above and change it"
          className="block w-full rounded-lg border border-neutral-300 bg-background px-3 py-2 text-base text-foreground placeholder:text-neutral-500 focus:border-primary focus:outline-none focus:ring-4 focus:ring-brand-100" />
      </label>
      {left.length > 0 && (
        <p className="text-sm text-neutral-700" aria-live="polite">Still to fill: <Gaps text={[...new Set(left)].join(" ")} /></p>
      )}
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
        {busy ? "Adding to the draft" : "Add to the draft"}
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
      <dl className="mt-4 border-t border-border">
        {facts.map((f) => (
          <div key={f.label} className="flex gap-6 border-b border-border py-3">
            <dt className="w-20 shrink-0 text-base text-muted-foreground">{f.label}</dt>
            <dd className="flex-1 text-base font-medium text-foreground">{f.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
