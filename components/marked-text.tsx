"use client";
import type { ReactNode } from "react";
import type { Phrase } from "./profile-fields";

/** The brand's signature: the organiser's own words, marked where EvntX understood them. */
export function MarkedText({ text, phrases, active, onActive, sweep = false }: {
  text: string;
  phrases: Pick<Phrase, "start" | "end" | "path" | "label">[];
  active?: string | null;
  onActive?: (path: string | null) => void;
  sweep?: boolean;
}) {
  const parts: ReactNode[] = [];
  let at = 0;
  phrases.forEach((p, i) => {
    if (p.start > at) parts.push(text.slice(at, p.start));
    parts.push(
      <mark key={p.path} tabIndex={onActive ? 0 : undefined} title={p.label} aria-label={`${text.slice(p.start, p.end)} (${p.label})`}
        data-active={active === p.path} onMouseEnter={() => onActive?.(p.path)} onMouseLeave={() => onActive?.(null)}
        onFocus={() => onActive?.(p.path)} onBlur={() => onActive?.(null)}
        className={`mark ${sweep ? "mark-sweep" : ""} ${onActive ? "cursor-default" : ""}`}
        style={sweep ? { animationDelay: `${300 + i * 160}ms` } : undefined}>
        {text.slice(p.start, p.end)}
      </mark>,
    );
    at = p.end;
  });
  parts.push(text.slice(at));
  return <>{parts}</>;
}
