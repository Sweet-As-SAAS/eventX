"use client";
import { useState } from "react";
import { MarkedText } from "./marked-text";
import { SourceLine, cx } from "./ui";

export type ExampleRow = { phrase: string; title: string; reason: string };

/** Landing hero: one paragraph in, the documents it triggers out. The page's one orchestrated moment. */
export function LandingExample({ text, rows, source, compact = false }: { text: string; rows: ExampleRow[]; source: { url: string; checked: string | null }; compact?: boolean }) {
  const [active, setActive] = useState<string | null>(null);
  const phrases = rows
    .map((r) => ({ start: text.indexOf(r.phrase), end: text.indexOf(r.phrase) + r.phrase.length, path: r.phrase, label: r.title }))
    .filter((p) => p.start >= 0)
    .sort((a, b) => a.start - b.start);

  return (
    <div className={compact ? "grid gap-8" : "grid gap-10 lg:grid-cols-12 lg:gap-16"}>
      <figure className={compact ? "" : "lg:col-span-7"}>
        <figcaption className="mb-4 text-base font-semibold text-neutral-700">An organiser writes</figcaption>
        <blockquote className={cx("display font-normal tracking-[-0.02em] text-foreground", compact ? "text-2xl leading-[1.4]" : "text-2xl leading-[1.4] sm:text-3xl sm:leading-[1.35]")}>
          <MarkedText text={text} phrases={phrases} active={active} onActive={setActive} sweep />
        </blockquote>
      </figure>
      <div className={compact ? "" : "lg:col-span-5"}>
        <h2 className="mb-4 text-base font-semibold text-neutral-700">HostReady works out what the council needs</h2>
        <ul className="border-t border-border">
          {rows.map((r, i) => (
            <li key={r.phrase} onMouseEnter={() => setActive(r.phrase)} onMouseLeave={() => setActive(null)}
              className={cx("arrive border-b border-border py-4 transition-colors duration-150", active === r.phrase && "bg-brand-50")}
              style={{ animationDelay: `${520 + i * 160}ms` }}>
              <p className="text-lg font-semibold text-foreground">{r.title}</p>
              <p className="text-base text-muted-foreground">{r.reason}</p>
              <p className="mt-1 text-sm text-neutral-600">
                from <span className="mark" data-active={active === r.phrase}>{r.phrase}</span>
              </p>
            </li>
          ))}
        </ul>
        <SourceLine url={source.url} checked={source.checked} className="mt-4" />
      </div>
    </div>
  );
}
