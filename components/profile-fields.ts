// How the profile reads on screen, and which words in the organiser's description each stated field came from.
// Display only: nothing here decides requirements or dates.
import type { EventProfile } from "@/lib/schemas";
import { fmtDate, fmtTime } from "./format";

type Field = { value: unknown; source: "stated" | "inferred" | "answered" | null };
export type FieldDef = { path: string; label: string; show?: (v: never) => string };

const ALCOHOL = { sold: "Sold", free: "Given away free", byo: "BYO", none: "None" } as const;

export const BASICS: FieldDef[] = [
  { path: "name", label: "Event name" },
  { path: "date", label: "Date", show: fmtDate },
  { path: "startTime", label: "Starts", show: fmtTime },
  { path: "endTime", label: "Finishes", show: fmtTime },
  { path: "venue.name", label: "Venue" },
  { path: "venue.councilLand", label: "On council land" },
  { path: "openToPublic", label: "Open to the public" },
  { path: "peakAttendance", label: "People at the busiest time", show: (n: number) => n.toLocaleString("en-NZ") },
  { path: "childrenAttending", label: "Children coming" },
];

export const ON_THE_DAY: FieldDef[] = [
  { path: "alcohol.supply", label: "Alcohol", show: (v: keyof typeof ALCOHOL) => ALCOHOL[v] },
  { path: "alcohol.area", label: "Where alcohol is served" },
  { path: "food.stalls", label: "Food stalls" },
  { path: "food.cookingOnSite", label: "Cooking on site" },
  { path: "structures.marquees", label: "Marquees" },
  { path: "structures.largestMarqueeSqm", label: "Largest marquee", show: (n: number) => `${n} sqm` },
  { path: "structures.stageOver1m", label: "Stage over 1 metre high" },
  { path: "structures.inflatables", label: "Inflatables" },
  { path: "structures.mechanicalRides", label: "Mechanical rides" },
  { path: "generators", label: "Generators" },
  { path: "amplifiedSound", label: "Amplified sound" },
  { path: "roadOrFootpathImpact", label: "Affects roads or footpaths" },
  { path: "vehicleAccess", label: "Vehicles on site" },
];

export const field = (p: EventProfile, path: string): Field =>
  path.split(".").reduce<any>((o, k) => o?.[k], p) ?? { value: null, source: null };

export function display(def: FieldDef, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (def.show) return def.show(value as never);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

// ---------- phrases: where in the description a stated field came from ----------

export type Phrase = { start: number; end: number; path: string; label: string };

const NUM_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// General English for event features, not tied to any one event.
const WORDS: Record<string, string[]> = {
  "alcohol.supply": ["beer tent", "wine and beer", "beer", "wine", "bar", "alcohol", "liquor", "cash bar"],
  "structures.inflatables": ["bouncy castles", "bouncy castle", "inflatables", "inflatable"],
  "structures.mechanicalRides": ["carnival rides", "rides", "ride"],
  "structures.stageOver1m": ["stage"],
  "structures.marquees": ["marquees", "marquee"],
  "childrenAttending": ["families and kids", "kids", "children", "families"],
  "amplifiedSound": ["live music", "a DJ", "DJ", "band", "PA system"],
  "generators": ["generators", "generator"],
  "roadOrFootpathImpact": ["road closure", "closing the road", "footpath"],
  "food.stalls": ["food trucks", "food stalls", "food"],
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function patterns(path: string, value: unknown): RegExp[] {
  const words = (WORDS[path] ?? []).map((w) => new RegExp(`\\b${esc(w)}\\b`, "i"));
  if (typeof value === "string" && path === "date") {
    const [, m, d] = value.split("-").map(Number);
    const month = MONTHS[m - 1];
    return [new RegExp(`\\b${d}(?:st|nd|rd|th)?\\s+${month}\\b|\\b${month}\\s+${d}(?:st|nd|rd|th)?\\b`, "i")];
  }
  if (typeof value === "string" && !/^\d\d:\d\d$/.test(value) && !(path in WORDS)) {
    const first = value.split(",")[0].trim();
    return [value, first].filter((s) => s.length > 2).map((s) => new RegExp(esc(s), "i"));
  }
  if (typeof value === "number") {
    const alts = [String(value), value.toLocaleString("en-NZ"), NUM_WORDS[value]].filter(Boolean).map(esc).join("|");
    return [new RegExp(`\\b(?:${alts})\\b(?:\\s+[a-z]+){0,2}`, "i"), ...words];
  }
  if (value === true || (typeof value === "string" && value !== "none")) return words;
  return [];
}

/** Non-overlapping phrases for every field the organiser stated, in text order. */
export function findPhrases(text: string, profile: EventProfile): Phrase[] {
  const out: Phrase[] = [];
  for (const def of [...BASICS, ...ON_THE_DAY]) {
    const f = field(profile, def.path);
    if (f.source !== "stated" || f.value === null) continue;
    for (const re of patterns(def.path, f.value)) {
      const m = re.exec(text);
      if (!m) continue;
      const start = m.index, end = m.index + m[0].trim().length;
      if (out.some((p) => start < p.end && end > p.start)) continue;
      out.push({ start, end, path: def.path, label: def.label });
      break;
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

// ---------- key facts: the short version of the profile ----------

export type Fact = { label: string; value: string; guess: boolean };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Six or seven lines an organiser can check at a glance. Empty facts are left out. */
export function keyFacts(p: EventProfile): Fact[] {
  const out: Fact[] = [];
  const guess = (...fs: { source: string | null }[]) => fs.some((f) => f.source === "inferred");
  const add = (label: string, value: string | null | false | undefined, g: boolean) => { if (value) out.push({ label, value, guess: g }); };
  const s = p.structures;

  add("Event", p.name.value, guess(p.name));
  add("Organiser", [p.people.organiser.value, p.people.contact.value].filter(Boolean).join(", "), false);
  add("When", [p.date.value && fmtDate(p.date.value), p.startTime.value && p.endTime.value && `${fmtTime(p.startTime.value)} to ${fmtTime(p.endTime.value)}`].filter(Boolean).join(", "), guess(p.date, p.startTime));
  add("Where", p.venue.name.value && `${p.venue.name.value}${p.venue.councilLand.value ? ", on council land" : ""}`, guess(p.venue.name, p.venue.councilLand));
  add("People", p.peakAttendance.value != null && `About ${p.peakAttendance.value.toLocaleString("en-NZ")}${p.childrenAttending.value ? ", children welcome" : ""}`, guess(p.peakAttendance, p.childrenAttending));
  const alc = p.alcohol.supply.value;
  add("Alcohol", alc && (alc === "none" ? "None" : `${ALCOHOL[alc]}${p.alcohol.area.value ? `, ${p.alcohol.area.value.charAt(0).toLowerCase()}${p.alcohol.area.value.slice(1)}` : ""}`), guess(p.alcohol.supply));
  const stalls = p.food.stalls.value;
  add("Food", stalls != null && (stalls === 0 ? "None" : `${stalls} ${stalls === 1 ? "stall" : "stalls"}${p.food.cookingOnSite.value ? ", cooking on site" : ""}`), guess(p.food.stalls));
  const setup = [
    s.marquees.value ? `${s.marquees.value} ${s.marquees.value === 1 ? "marquee" : "marquees"}${s.largestMarqueeSqm.value ? ` (largest ${s.largestMarqueeSqm.value} sqm)` : ""}` : null,
    s.stageOver1m.value && "a stage", s.inflatables.value && "inflatables", s.mechanicalRides.value && "rides",
    p.generators.value && "a generator", p.amplifiedSound.value && "amplified sound", p.roadOrFootpathImpact.value && "affects roads or footpaths",
  ].filter(Boolean) as string[];
  add("Setup", setup.length > 0 && cap(setup.join(", ")), guess(s.marquees, s.stageOver1m, s.inflatables, s.mechanicalRides, p.generators, p.amplifiedSound));
  return out;
}
