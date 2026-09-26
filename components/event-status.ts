"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { EventDocument, EventSummary } from "@/lib/schemas";

/** One line on where an event's pack stands: "1 fix to do", "drafting", "ready". */
export function packNote(docs: EventDocument[]) {
  const fix = docs.filter((d) => d.status === "needs_fix").length;
  const working = docs.filter((d) => d.status === "pending" || d.status === "drafted").length;
  if (!docs.length) return { text: "just started", warn: false, fix, done: false };
  if (fix) return { text: `${fix} ${fix === 1 ? "fix" : "fixes"} to do`, warn: true, fix, done: false };
  if (working) return { text: "drafting", warn: false, fix, done: false };
  return { text: "ready", warn: false, fix, done: true };
}

export type EventWithNote = EventSummary & { note: ReturnType<typeof packNote> };

/** Your events, each with its pack status. Reloads when `key` changes (e.g. the path), so fixes show up. */
export function useEvents(key?: string) {
  const [events, setEvents] = useState<EventWithNote[] | null>(null);
  useEffect(() => {
    let live = true;
    // ponytail: one documents call per event; add a status column to /api/events if the list grows past a handful
    api.listEvents()
      .then((list) => Promise.all(list.slice(0, 12).map((e) =>
        api.listDocuments(e.id).catch(() => []).then((docs) => ({ ...e, note: packNote(docs) })))))
      .then((l) => live && setEvents(l))
      .catch(() => live && setEvents([]));
    return () => { live = false; };
  }, [key]);
  return events;
}

export const initials = (s: string | null | undefined) =>
  (s ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
