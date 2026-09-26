import Link from "next/link";
import { Logotype, Mark, Wordmark } from "@/components/brand";
import { DescribeForm } from "@/components/describe-form";
import { LandingExample } from "@/components/landing-example";
import { DOC_LABEL } from "@/components/format";
import { Alert, Badge, Calendar, Check, Hand, Home as HomeIcon, Plus, Wallet } from "@/components/icons";
import { ButtonLink } from "@/components/ui";
import { cccRules } from "@/lib/rules/ccc";
import fixture from "@/fixtures/demo-event.json";

// The hero paragraph is the demo event (team decision, 27 Sep 2026), so the landing page and the live demo tell one story.
// Reasons and sources come from the verified CCC rules; a phrase missing from the paragraph just drops its row.
const EXAMPLE = fixture.description;
const LINKS = [
  { phrase: "Hagley Park", ruleId: "ccc-permit" },
  { phrase: "a bar selling beer and wine", ruleId: "ccc-special-licence" },
  { phrase: "bouncy castle", ruleId: "ccc-inflatable" },
  { phrase: "four food trucks", ruleId: "ccc-food" },
];

const STEPS = [
  { title: "Tell us where and what", body: "One paragraph, typed or spoken, about your Christchurch event: a festival, a market, a gala." },
  { title: "Answer a question or two", body: "Only the ones that change what the council needs." },
  { title: "Get a checked pack", body: "Drafts checked line by line against the council's own checklist." },
  { title: "Lodge on time", body: "Every deadline in working days, with a reminder before each one." },
];

const WHY = [
  { title: "Rules with receipts", body: "Every requirement links to the council page it came from and the day we last checked it." },
  { title: "Deadlines you can trust", body: "Working days worked out by rules, not guesswork, including the 20 December to 15 January liquor gap." },
  { title: "Tickets wait for paperwork", body: "Your Eventbrite draft only unlocks once every document is ready or marked as yours to lodge." },
];

export default function Landing() {
  const rules = LINKS.map((l) => ({ ...l, rule: cccRules.find((r) => r.id === l.ruleId && r.verified) })).filter((l) => l.rule);
  const rows = rules.map(({ phrase, rule }) => ({ phrase, title: DOC_LABEL[rule!.outcome.documentType], reason: rule!.outcome.reason }));
  const source = { url: rules[0]?.rule?.sourceUrl ?? "", checked: rules[0]?.rule?.lastChecked ?? null };

  return (
    <>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <header className="flex items-center justify-between py-4">
          <Wordmark />
          <nav className="flex items-center gap-2">
            <Link href="/login" className="press inline-flex min-h-11 items-center rounded-lg px-3 text-base font-medium text-neutral-700 hover:text-foreground">Log in</Link>
            <ButtonLink href="/dashboard" className="min-h-11 rounded-full px-5 text-base">Get started free</ButtonLink>
          </nav>
        </header>

        {/* Hero: centred headline and input, then the pack itself as the picture */}
        <section className="mx-auto max-w-3xl pb-14 pt-16 text-center sm:pt-24">
          <h1 className="step-in text-5xl leading-[1.02] text-foreground sm:text-6xl lg:text-7xl">
            Your event, council&#8209;ready.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-lg text-muted-foreground sm:text-xl">
            Describe it once. We work out the permits, licences and deadlines, and check every page against the council&apos;s rules.
          </p>
          <div className="mx-auto mt-9 max-w-xl text-left"><DescribeForm pill /></div>
        </section>
      </div>

      <section className="px-4 sm:px-6" aria-label="What you get">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-brand-50 px-4 py-10 sm:px-10 sm:py-14"><PackSpread /></div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="py-16 text-center sm:py-20" aria-labelledby="meet">
          <h2 id="meet" className="display text-4xl text-foreground sm:text-5xl">Meet EvntX</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Every event, document, licence and deadline in one place, checked against Christchurch City Council&apos;s own rules.
          </p>
        </section>
      </div>

      <section className="px-4 sm:px-6" aria-label="The workspace">
        <div className="mx-auto max-w-6xl rounded-3xl bg-neutral-100 px-4 pt-10 sm:px-10 sm:pt-14">
          <AppWindow />
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="py-20 sm:py-28" aria-labelledby="words">
          <h2 id="words" className="display max-w-2xl text-4xl text-foreground sm:text-5xl">Your words become the paperwork</h2>
          <div className="mt-12"><LandingExample text={EXAMPLE} rows={rows} source={source} /></div>
        </section>

        <section className="border-t border-border py-20 sm:py-24" aria-labelledby="how">
          <h2 id="how" className="display text-4xl text-foreground sm:text-5xl">How it works</h2>
          <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="border-t border-foreground pt-4">
                <p className="text-sm text-muted-foreground">Step {i + 1}</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{s.title}</p>
                <p className="mt-1.5 text-base text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t border-border py-20 sm:py-24" aria-labelledby="why">
          <h2 id="why" className="display max-w-2xl text-4xl text-foreground sm:text-5xl">Why not just ask a chatbot?</h2>
          <div className="mt-12 grid gap-10 md:grid-cols-3">
            {WHY.map((w) => (
              <div key={w.title} className="border-t border-foreground pt-4">
                <p className="text-lg font-semibold text-foreground">{w.title}</p>
                <p className="mt-1.5 text-base text-muted-foreground">{w.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border py-20 text-center sm:py-28">
          <h2 className="display text-4xl text-foreground sm:text-5xl">Your next event, sorted.</h2>
          <div className="mx-auto mt-8 max-w-lg text-left"><DescribeForm pill /></div>
        </section>
      </div>
    </>
  );
}

/** The pack as a spread of pages. Illustrative example pages, not live data. */
function PackSpread() {
  const line = (w: string) => <span className="block h-1.5 rounded-full bg-neutral-200" style={{ width: w }} />;
  const page = "arrive flex aspect-[3/4] w-40 shrink-0 flex-col rounded-lg bg-background p-4 text-left shadow-[0_12px_32px_-16px_rgb(20_23_36/0.35)] sm:w-48";
  return (
    <div aria-hidden className="flex items-end justify-center gap-3 sm:gap-5">
      <div className={`${page} hidden translate-y-6 md:flex`} style={{ animationDelay: "100ms" }}>
        <p className="text-xs font-semibold text-foreground">Event permit application</p>
        <div className="mt-4 space-y-3">
          {["Event", "When", "Where", "People"].map((l, i) => (
            <div key={l}><p className="text-[10px] text-muted-foreground">{l}</p>{line(["70%", "55%", "80%", "40%"][i])}</div>
          ))}
        </div>
      </div>
      <div className={page} style={{ animationDelay: "200ms" }}>
        <p className="text-xs font-semibold text-foreground">Health and safety plan</p>
        <div className="mt-3 space-y-2">{line("90%")}{line("75%")}{line("85%")}</div>
        <ul className="mt-auto space-y-1.5">
          {["Event details", "Hazards", "First aid", "Assembly point"].map((t) => (
            <li key={t} className="flex items-center gap-1.5 text-[10px] text-foreground">
              <span className="grid size-3.5 place-items-center rounded-full bg-success text-white"><Check width={9} height={9} strokeWidth={3.5} /></span>{t}
            </li>
          ))}
        </ul>
      </div>
      <div className={`${page} -translate-y-4 bg-primary text-primary-foreground`} style={{ animationDelay: "300ms" }}>
        <p className="text-xs font-semibold text-white/80">Council checklist</p>
        <p className="display mt-auto text-5xl text-white">4/4</p>
        <p className="text-sm text-white/85">checks pass. Ready to lodge.</p>
      </div>
      <div className={page} style={{ animationDelay: "400ms" }}>
        <p className="text-xs font-semibold text-foreground">Site plan</p>
        <svg viewBox="0 0 120 110" className="mt-3 w-full">
          <rect x="2" y="2" width="116" height="106" rx="6" fill="var(--neutral-50)" stroke="var(--neutral-300)" strokeDasharray="4 3" />
          <rect x="12" y="12" width="44" height="30" rx="3" fill="var(--marker)" stroke="var(--primary)" strokeDasharray="3 2" />
          <rect x="64" y="14" width="42" height="24" rx="3" fill="var(--background)" stroke="var(--neutral-500)" />
          <circle cx="32" cy="74" r="14" fill="var(--brand-100)" stroke="var(--brand-500)" />
          <rect x="66" y="60" width="26" height="14" rx="3" fill="var(--destructive-soft)" stroke="var(--destructive)" />
          <rect x="44" y="102" width="22" height="7" rx="2" fill="var(--success)" />
        </svg>
      </div>
      <div className={`${page} hidden translate-y-6 md:flex`} style={{ animationDelay: "500ms" }}>
        <p className="text-xs font-semibold text-foreground">Deadlines</p>
        <div className="relative mt-6 ml-1.5 flex-1 border-l-2 border-neutral-200">
          {[["Lodge permit", "bg-primary"], ["Special licence", "bg-primary"], ["Event day", "bg-foreground"]].map(([t, c], i) => (
            <div key={t} className="relative mb-5 pl-4">
              <span className={`absolute -left-[7px] top-0.5 size-3 rounded-full ${c}`} />
              <p className="text-[10px] font-semibold text-foreground">{t}</p>{line(["60%", "50%", "40%"][i])}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A picture of the real workspace, drawn with the app's own styles. Illustrative, not live data. */
function AppWindow() {
  const nav = [[HomeIcon, "Home", true], [Plus, "New event", false], [Wallet, "Budget", false], [Badge, "Licences", false]] as const;
  const docs = [["Special licence application", "ready"], ["Hazard register", "ready"], ["Health and safety plan", "fix"], ["Event permit application", "manual"]] as const;
  return (
    <div aria-hidden className="overflow-hidden rounded-t-2xl border border-b-0 border-border bg-background shadow-[0_-12px_40px_-20px_rgb(20_23_36/0.25)]">
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
        <span className="size-2.5 rounded-full bg-neutral-200" /><span className="size-2.5 rounded-full bg-neutral-200" /><span className="size-2.5 rounded-full bg-neutral-200" />
      </div>
      <div className="grid md:grid-cols-[15rem_1fr]">
        <div className="hidden border-r border-border p-4 md:block">
          <div className="flex items-center gap-2 px-2"><Mark size={24} /><Logotype className="text-lg" /></div>
          <ul className="mt-5 space-y-0.5">
            {nav.map(([Icon, label, on]) => (
              <li key={label} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${on ? "bg-neutral-100 font-semibold" : "text-neutral-700"}`}><Icon width={16} height={16} className="text-neutral-500" />{label}</li>
            ))}
          </ul>
          <p className="mt-6 border-t border-border px-3 pt-4 text-xs font-medium text-muted-foreground">Your events</p>
          <ul className="mt-2 space-y-0.5">
            {[fixture.profile.name.value, "Riverside night market", "Autumn jazz picnic"].map((e, i) => (
              <li key={e} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${i === 0 ? "bg-brand-50 font-semibold" : "text-neutral-700"}`}><Calendar width={16} height={16} className="text-neutral-500" />{e}</li>
            ))}
          </ul>
        </div>
        <div className="p-6 sm:p-10">
          <p className="display text-3xl font-medium text-foreground">Your pack</p>
          <p className="mt-1 text-base text-muted-foreground">1 needs a fix. 1 you handle yourself.</p>
          <ul className="mt-6 max-w-xl border-t border-border">
            {docs.map(([d, s]) => (
              <li key={d} className="flex items-center justify-between border-b border-border py-3">
                <span className="text-base font-semibold text-foreground">{d}</span>
                {s === "ready" && <span className="inline-flex items-center gap-1.5 rounded-md bg-success-soft px-2 py-1 text-sm font-medium text-success"><Check width={14} height={14} /> Ready</span>}
                {s === "fix" && <span className="inline-flex items-center gap-1.5 rounded-md bg-destructive-soft px-2 py-1 text-sm font-medium text-destructive"><Alert width={14} height={14} /> Needs a fix</span>}
                {s === "manual" && <span className="inline-flex items-center gap-1.5 rounded-md bg-neutral-100 px-2 py-1 text-sm font-medium text-neutral-700"><Hand width={14} height={14} /> You handle this</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
