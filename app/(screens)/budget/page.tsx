"use client";
import { useMemo, useSyncExternalStore } from "react";
import { Plus, Trash } from "@/components/icons";
import { Button, Title } from "@/components/ui";

// Budget: the organiser's own numbers. No API behind it yet, so it lives in this browser only.
// ponytail: localStorage per viewer; move to a budgets table when committees need to share it.
type Line = { id: string; label: string; amount: string; council?: boolean };
const KEY = "hostready-budget";
const START: Line[] = [
  { id: "permit", label: "Council event permit", amount: "", council: true },
  { id: "licence", label: "Special licence", amount: "", council: true },
  { id: "stage", label: "Stage and sound hire", amount: "" },
  { id: "marquee", label: "Marquee hire", amount: "" },
  { id: "toilets", label: "Toilets", amount: "" },
  { id: "firstaid", label: "First aid", amount: "" },
  { id: "security", label: "Security", amount: "" },
];
const nzd = (n: number) => n.toLocaleString("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 });

// localStorage as an external store: the server renders START, the browser its saved copy. `mem` covers blocked storage.
const subs = new Set<() => void>();
let mem: string | null = null;
const read = () => { try { return localStorage.getItem(KEY) ?? mem; } catch { return mem; } };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
function parse(raw: string | null): Line[] {
  try { return raw ? JSON.parse(raw) : START; } catch { return START; }
}
function setLines(f: (ls: Line[]) => Line[]) {
  mem = JSON.stringify(f(parse(read())));
  try { localStorage.setItem(KEY, mem); } catch {}
  subs.forEach((s) => s());
}

export default function BudgetPage() {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const lines = useMemo(() => parse(raw), [raw]);

  const set = (id: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-12 sm:px-6 sm:py-16">
      <Title sub="What the event will cost. Saved on this device.">Budget</Title>

      <ul className="border-t border-border">
        {lines.map((l) => (
          <li key={l.id} className="flex items-center gap-3 border-b border-border py-2">
            <div className="min-w-0 flex-1">
              <input value={l.label} onChange={(e) => set(l.id, { label: e.target.value })} aria-label="Item"
                className="min-h-11 w-full rounded-lg bg-transparent px-2 py-2 text-base font-medium text-foreground hover:bg-neutral-50 focus:bg-neutral-50 focus:outline-none" />
              {l.council && <p className="px-2 text-sm text-muted-foreground">Fee varies, check with council</p>}
            </div>
            <label className="flex items-center gap-1 rounded-lg bg-neutral-50 px-3 focus-within:ring-2 focus-within:ring-primary">
              <span className="text-muted-foreground">$</span>
              <input inputMode="decimal" value={l.amount} onChange={(e) => set(l.id, { amount: e.target.value.replace(/[^\d.]/g, "") })}
                placeholder="0" aria-label={`${l.label} cost`} className="min-h-11 w-24 bg-transparent text-right text-base tabular-nums focus:outline-none" />
            </label>
            <button onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))} aria-label={`Remove ${l.label}`}
              className="press grid size-11 place-items-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-destructive"><Trash /></button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button variant="secondary" onClick={() => setLines((ls) => [...ls, { id: String(Date.now()), label: "New item", amount: "" }])}><Plus /> Add a cost</Button>
        <p className="text-right">
          <span className="block text-sm text-muted-foreground">Total so far</span>
          <span className="display text-3xl font-medium tabular-nums text-foreground">{nzd(total)}</span>
        </p>
      </div>
    </div>
  );
}
