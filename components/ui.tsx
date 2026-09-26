// Primitives. Components use tokens only: no raw hex, no one-off shadows.
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { DocumentStatus } from "@/lib/schemas";
import { STATUS_LABEL, fmtDate, sourceName } from "./format";
import { Alert, Check, External, Hand } from "./icons";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const BTN = {
  primary: "bg-primary text-primary-foreground hover:bg-brand-600 disabled:bg-neutral-300",
  secondary: "border border-neutral-300 bg-background text-foreground hover:border-neutral-400 hover:bg-neutral-50 disabled:text-neutral-400",
  ghost: "text-primary hover:bg-brand-50 disabled:text-neutral-400",
};
type Variant = keyof typeof BTN;
const btn = (v: Variant, className?: string) =>
  cx("press inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-base font-semibold disabled:cursor-not-allowed", BTN[v], className);

export function Button({ variant = "primary", busy, className, children, ...p }: ComponentProps<"button"> & { variant?: Variant; busy?: boolean }) {
  return (
    <button {...p} disabled={p.disabled || busy} aria-busy={busy || undefined} className={btn(variant, className)}>
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant = "primary", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link {...p} className={btn(variant, className)} />;
}

export function ButtonA({ variant = "primary", className, ...p }: ComponentProps<"a"> & { variant?: Variant }) {
  return <a {...p} className={btn(variant, className)} />;
}

/** Fast spin reads as fast loading (Emil). */
export const Spinner = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" className="animate-spin [animation-duration:600ms]" aria-hidden>
    <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="2" />
    <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const Skeleton = ({ className }: { className?: string }) => <span aria-hidden className={cx("skeleton block", className)} />;

const TAG: Record<DocumentStatus, { cls: string; icon: ReactNode }> = {
  ready: { cls: "bg-success-soft text-success", icon: <Check width={14} height={14} strokeWidth={2.25} /> },
  needs_fix: { cls: "bg-destructive-soft text-destructive", icon: <Alert width={14} height={14} strokeWidth={2.25} /> },
  manual: { cls: "bg-neutral-100 text-neutral-700", icon: <Hand width={14} height={14} /> },
  drafted: { cls: "bg-brand-50 text-brand-700", icon: <Spinner /> },
  pending: { cls: "bg-brand-50 text-brand-700", icon: <Spinner /> },
};

export function StatusTag({ status }: { status: DocumentStatus }) {
  const t = TAG[status];
  return (
    <span className={cx("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-sm font-medium", t.cls)}>
      {t.icon}
      {STATUS_LABEL[status]}
    </span>
  );
}

const FIELD = {
  stated: { label: "You said", cls: "bg-marker text-brand-800" },
  inferred: { label: "Our guess", cls: "bg-warning-soft text-warning" },
  answered: { label: "You answered", cls: "bg-neutral-100 text-neutral-700" },
};

export function FieldSource({ source }: { source: keyof typeof FIELD | null }) {
  if (!source) return null;
  const f = FIELD[source];
  return <span className={cx("rounded-md px-1.5 py-0.5 text-xs font-medium", f.cls)}>{f.label}</span>;
}

/** "Source: CCC event permits, checked 26 Sep 2026". Our answer to "why not ChatGPT", so always visible. */
export function SourceLine({ url, checked, className }: { url: string; checked: string | null; className?: string }) {
  const real = /^https?:\/\//.test(url);
  return (
    <p className={cx("text-sm text-muted-foreground", className)}>
      Source:{" "}
      {real ? (
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary underline decoration-brand-200 underline-offset-2 hover:decoration-primary">
          {sourceName(url)}
          <External width={13} height={13} />
        </a>
      ) : (
        "not confirmed yet"
      )}
      {checked && <>, checked {fmtDate(checked)}</>}
    </p>
  );
}

/** Page title: display face, once per screen. */
export function Title({ children, sub, aside }: { children: ReactNode; sub?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="max-w-4xl space-y-2">
        <h1 className="text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-foreground sm:text-[2.75rem]">{children}</h1>
        {sub && <p className="text-[17px] text-neutral-600">{sub}</p>}
      </div>
      {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
    </header>
  );
}

/** Small rounded status pill: Ready, Drafting, Needs a fix, counts. */
export const PILL = {
  ok: "bg-success-soft text-success",
  warn: "bg-warning-soft text-warning",
  quiet: "bg-neutral-100 text-neutral-700",
};
export const Pill = ({ tone, children }: { tone: keyof typeof PILL; children: ReactNode }) => (
  <span className={cx("inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium", PILL[tone])}>{children}</span>
);
