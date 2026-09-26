"use client";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { api } from "@/lib/api/client";
import type { CouncilSlug, Requirement, SiteItem, SiteItemKind, SiteLayout } from "@/lib/schemas";
import { SITE_CANVAS, siteChecks } from "@/lib/siteplan";
import { useFail } from "./toast";
import { Alert, Check, Download, Plus } from "./icons";
import { Button, cx } from "./ui";

// PRD F10. The layout comes from the site plan route; every change the organiser makes is saved (debounced).
const { w: W, h: H, edge: EDGE } = SITE_CANVAS;
const LOOK: Record<SiteItemKind, { fill: string; stroke: string; round?: boolean; dash?: boolean }> = {
  licensed: { fill: "var(--marker)", stroke: "var(--primary)", dash: true },
  marquee: { fill: "var(--background)", stroke: "var(--neutral-500)" },
  food: { fill: "var(--warning-soft)", stroke: "var(--warning)" },
  inflatable: { fill: "var(--brand-100)", stroke: "var(--brand-500)", round: true },
  ride: { fill: "var(--brand-100)", stroke: "var(--brand-500)" },
  stage: { fill: "var(--neutral-200)", stroke: "var(--neutral-600)" },
  generator: { fill: "var(--neutral-300)", stroke: "var(--neutral-700)" },
  firstaid: { fill: "var(--destructive-soft)", stroke: "var(--destructive)" },
  toilet: { fill: "var(--brand-50)", stroke: "var(--brand-500)" },
  bin: { fill: "var(--neutral-100)", stroke: "var(--neutral-600)" },
  exit: { fill: "var(--success)", stroke: "var(--success)" },
  assembly: { fill: "var(--success-soft)", stroke: "var(--success)", round: true },
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Props = { eventId: string; layout: SiteLayout; council: CouncilSlug; requirements: Pick<Requirement, "documentType">[] };

export function SitePlan({ eventId, layout, council, requirements }: Props) {
  const fail = useFail();
  const [els, setEls] = useState(layout.items);
  const [sel, setSel] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);

  // Each organiser change bumps `edits`; a save goes out a second after the last one. Loading never saves.
  const [edits, setEdits] = useState(0);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const latest = useRef(els);
  useEffect(() => { latest.current = els; });
  useEffect(() => {
    if (!edits) return;
    const t = setTimeout(() => {
      api.saveSitePlan(eventId, { items: latest.current }).then(() => setStatus("saved"), (e) => { setStatus("idle"); fail(e); });
    }, 1000);
    return () => clearTimeout(t);
  }, [edits, eventId, fail]);
  const edited = () => { setEdits((n) => n + 1); setStatus("saving"); };

  const move = (id: string, fn: (e: SiteItem) => Partial<SiteItem>) => setEls((all) => all.map((e) => (e.id === id ? { ...e, ...fn(e) } : e)));
  const at = (ev: PointerEvent) => {
    const pt = svg.current!.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    return pt.matrixTransform(svg.current!.getScreenCTM()!.inverse());
  };

  function down(ev: PointerEvent<SVGGElement>, e: SiteItem) {
    ev.currentTarget.setPointerCapture(ev.pointerId);
    const p = at(ev);
    drag.current = { id: e.id, dx: p.x - e.x, dy: p.y - e.y, moved: false };
    setSel(e.id);
  }
  function over(ev: PointerEvent<SVGGElement>) {
    const d = drag.current;
    if (!d) return;
    const p = at(ev);
    d.moved = true;
    move(d.id, (e) => ({ x: Math.round(clamp(p.x - d.dx, 0, W - e.w)), y: Math.round(clamp(p.y - d.dy, 0, H - e.h)) }));
  }
  function up() {
    if (drag.current?.moved) edited();
    drag.current = null;
  }
  function key(ev: KeyboardEvent<SVGGElement>, e: SiteItem) {
    const step = ev.shiftKey ? 40 : 10;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[ev.key];
    if (d) { ev.preventDefault(); move(e.id, (x) => ({ x: clamp(x.x + d[0], 0, W - x.w), y: clamp(x.y + d[1], 0, H - x.h) })); edited(); }
    if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); move(e.id, () => ({ placed: false })); setSel(null); edited(); }
  }

  function addExit() {
    const n = els.filter((e) => e.kind === "exit").length;
    setEls((all) => [...all, { id: `exit-${Date.now()}`, kind: "exit", label: `Exit ${n + 1}`, w: 64, h: 26, x: EDGE, y: H / 2 - 13, placed: true }]);
    edited();
  }

  function download() {
    const css = getComputedStyle(document.documentElement); // a standalone file can't see our CSS variables
    const markup = new XMLSerializer().serializeToString(svg.current!).replace(/var\((--[\w-]+)\)/g, (_, v) => css.getPropertyValue(v).trim());
    const blob = new Blob([markup], { type: "image/svg+xml" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "site-plan.svg" });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const checks = siteChecks(els, { council, requirements });
  const tray = els.filter((e) => !e.placed);
  const selected = els.find((e) => e.id === sel && e.placed);

  return (
    <div className="grid gap-10 lg:grid-cols-12">
      <div className="space-y-4 lg:col-span-8">
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" role="application" aria-label="Site plan. Tab to an item, then use the arrow keys to move it."
          className="w-full select-none rounded-xl bg-neutral-50" onPointerDown={(ev) => ev.target === ev.currentTarget && setSel(null)}>
          <defs>
            <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="var(--neutral-200)" /></pattern>
          </defs>
          {layout.basemap
            ? <image href={layout.basemap.url} width={W} height={H} preserveAspectRatio="xMidYMid slice" pointerEvents="none" />
            : <rect width={W} height={H} fill="url(#dots)" pointerEvents="none" />}
          <rect x={EDGE} y={EDGE} width={W - 2 * EDGE} height={H - 2 * EDGE} rx="10" fill="none" stroke={layout.basemap ? "var(--neutral-700)" : "var(--neutral-400)"} strokeWidth="2" strokeDasharray="8 6" pointerEvents="none" />
          <text x={EDGE + 12} y={H - EDGE - 10} fontSize="13" fill={layout.basemap ? "var(--neutral-800)" : "var(--neutral-500)"} pointerEvents="none"
            {...(layout.basemap && { stroke: "var(--background)", strokeWidth: 3, paintOrder: "stroke" })}>Site boundary</text>
          {layout.basemap && <text x={W - 8} y={H - 8} textAnchor="end" fontSize="11" fill="var(--neutral-600)" pointerEvents="none">{layout.basemap.attribution}</text>}
          {els.filter((e) => e.placed).map((e) => {
            const look = LOOK[e.kind];
            const light = e.kind === "exit";
            return (
              <g key={e.id} transform={`translate(${e.x} ${e.y})`} tabIndex={0} role="button" aria-label={`${e.label}. Arrow keys move it, Delete takes it off the plan.`}
                onPointerDown={(ev) => down(ev, e)} onPointerMove={over} onPointerUp={up} onPointerCancel={up}
                onFocus={() => setSel(e.id)} onKeyDown={(ev) => key(ev, e)}
                className="cursor-grab outline-none active:cursor-grabbing" style={{ touchAction: "none" }}>
                {look.round
                  ? <ellipse cx={e.w / 2} cy={e.h / 2} rx={e.w / 2} ry={e.h / 2} fill={look.fill} stroke={look.stroke} strokeWidth="2" strokeDasharray={e.kind === "assembly" ? "6 5" : undefined} />
                  : <rect width={e.w} height={e.h} rx="6" fill={look.fill} stroke={look.stroke} strokeWidth="2" strokeDasharray={look.dash ? "7 5" : undefined} />}
                {e.kind === "firstaid" && <path d={`M${e.w / 2 - 7} 14h14M${e.w / 2} 7v14`} stroke="var(--destructive)" strokeWidth="3" strokeLinecap="round" />}
                <text x={e.w / 2} y={e.kind === "firstaid" ? e.h - 9 : e.h / 2 + 4.5} textAnchor="middle" fontSize="13" fontWeight="600"
                  fill={light ? "var(--success-foreground)" : "var(--foreground)"}>{e.label}</text>
                {sel === e.id && <rect x={-5} y={-5} width={e.w + 10} height={e.h + 10} rx="9" fill="none" stroke="var(--ring)" strokeWidth="2" strokeDasharray="4 3" />}
              </g>
            );
          })}
        </svg>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={addExit}><Plus /> Add an exit</Button>
          {selected && <Button variant="ghost" onClick={() => { move(selected.id, () => ({ placed: false })); setSel(null); edited(); }}>Take {selected.label.toLowerCase()} off the plan</Button>}
          <span className="ml-auto text-sm text-muted-foreground" aria-live="polite">{status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}</span>
          <Button variant="ghost" onClick={download}><Download /> Download plan</Button>
        </div>
        <p className="text-sm text-muted-foreground">Drag things where they&apos;ll be on the day. On a keyboard, tab to an item and use the arrow keys (hold Shift for bigger steps).</p>
      </div>

      <aside className="space-y-8 lg:col-span-4">
        <section aria-labelledby="checks">
          <h2 id="checks" className="text-lg font-semibold text-foreground">Site checks</h2>
          <ul className="mt-3 border-t border-border" aria-live="polite">
            {checks.map((c) => (
              <li key={c.id} className="flex items-center gap-3 border-b border-border py-3">
                <span className={cx("grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-200", c.pass ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground")}>
                  {c.pass ? <Check width={14} height={14} strokeWidth={3} className="tick-draw" key="ok" /> : <Alert width={14} height={14} strokeWidth={2.5} key="no" />}
                </span>
                <span className="flex-1">
                  <span className="block text-base font-medium text-foreground">{c.label}</span>
                  <span className="block text-sm text-muted-foreground">
                    {c.basis === "council" && c.source
                      ? <a href={c.source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">Council requirement · checked {c.source.lastChecked}</a>
                      : "EvntX check"}
                  </span>
                </span>
                {c.note && <span className="text-sm text-muted-foreground">{c.note}</span>}
              </li>
            ))}
          </ul>
        </section>

        {tray.length > 0 && (
          <section aria-labelledby="tray">
            <h2 id="tray" className="text-lg font-semibold text-foreground">Not on the plan yet</h2>
            <ul className="mt-3 space-y-2">
              {tray.map((e) => (
                <li key={e.id}>
                  <Button variant="secondary" className="w-full justify-start" onClick={() => { move(e.id, () => ({ placed: true })); setSel(e.id); edited(); }}>
                    <Plus /> Add {e.label.toLowerCase()}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}
