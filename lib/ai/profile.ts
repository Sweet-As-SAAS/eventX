import { EventProfile, type FollowUpQuestion, type CouncilSlug } from "../schemas";
import { structured, MODEL_STRONG } from "./client";
import { PROFILE_SYSTEM } from "./prompts";
import { conditionPaths, type Rule } from "../rules/engine";

/** Step 1. `today` is the NZ date (nzToday) so "this Sunday" resolves correctly. */
export async function buildProfile(description: string, council: CouncilSlug, today: string) {
  const profile = await structured({
    schema: EventProfile.omit({ people: true }), name: "event_profile", model: MODEL_STRONG, system: PROFILE_SYSTEM,
    user: `Reference date: ${today}\nCouncil: ${council}\nDescription:\n${description}`,
  });
  const date = resolveStatedDate(description, today, profile.date);
  const corrected = { ...profile, councilSlug: council, date };
  return EventProfile.parse({ ...corrected, missing: missingPaths(corrected) });
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Correct a model's year only when its month/day matches an explicit date in the description. */
export function resolveStatedDate(description: string, today: string, modelDate: EventProfile["date"]): EventProfile["date"] {
  if (!modelDate.value) return modelDate;
  const pattern = /\b(?:(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(20\d{2}))?\b/gi;
  for (const match of description.matchAll(pattern)) {
    const day = Number(match[2]);
    const month = MONTHS.findIndex((name) => name.startsWith(match[3].toLowerCase().slice(0, 3))) + 1;
    const monthDay = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (modelDate.value.slice(5) !== monthDay) continue;
    const weekday = match[1]?.toLowerCase();
    const explicitYear = match[4] ? Number(match[4]) : null;
    const firstYear = explicitYear ?? Number(today.slice(0, 4));
    const lastYear = explicitYear ?? firstYear + 7;
    for (let year = firstYear; year <= lastYear; year++) {
      const utc = new Date(Date.UTC(year, month - 1, day));
      if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) continue;
      if (weekday && WEEKDAYS[utc.getUTCDay()] !== weekday) continue;
      const iso = `${year}-${monthDay}`;
      if (iso >= today) return { value: iso, source: "stated" };
    }
    return { value: null, source: null };
  }
  return modelDate;
}

/** Keep question paths tied to actual unknown fields, independent of how the model spelled them. */
/** People are asked on their own (Questions page), so they never count as missing from the description. */
export function missingPaths(profile: Omit<EventProfile, "people">): string[] {
  const paths: string[] = [];
  const visit = (value: unknown, path: string) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    if ("value" in value && "source" in value) {
      if (value.value === null) paths.push(path);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== "missing" && key !== "people") visit(child, path ? `${path}.${key}` : key);
    }
  };
  visit(profile, "");
  return paths;
}

// Deterministic question bank. A question is only asked if its path is missing AND a verified rule reads it.
export const QUESTIONS: Record<string, Omit<FollowUpQuestion, "path">> = {
  "food.cookingOnSite": { question: "Will the food trucks cook on site?", options: ["Yes", "No", "Not sure"] },
  "roadOrFootpathImpact": { question: "Will any roads or footpaths be closed or affected?", options: ["Yes", "No", "Not sure"] },
  "structures.largestMarqueeSqm": { question: "How big is your largest marquee?", options: ["Under 100 sqm", "Over 100 sqm", "Not sure"] },
  "alcohol.supply": { question: "Will alcohol be sold, given away, or BYO?", options: ["Sold", "Given away", "BYO", "No alcohol"] },
  "openToPublic": { question: "Can anyone attend, even with a ticket?", options: ["Yes", "No, invite only"] },
  "structures.mechanicalRides": { question: "Any mechanical rides, like a Ferris wheel?", options: ["Yes", "No"] },
  "peakAttendance": { question: "Roughly how many people at the busiest time?", options: ["Under 150", "150 to 500", "500 to 2,000", "Over 2,000"] },
};

// Tap answers that are not plain Yes/No map to a representative value on the right side of each rule threshold.
const ANSWER_VALUES: Record<string, Record<string, unknown>> = {
  "structures.largestMarqueeSqm": { "Under 100 sqm": 50, "Over 100 sqm": 150 },
  "alcohol.supply": { Sold: "sold", "Given away": "free", BYO: "byo", "No alcohol": "none" },
  peakAttendance: { "Under 150": 100, "150 to 500": 400, "500 to 2,000": 1500, "Over 2,000": 3000 },
};

export function followUps(profile: EventProfile, rules: Rule[], max = 3): FollowUpQuestion[] {
  const relevant = new Set(rules.filter((r) => r.verified && r.council === profile.councilSlug).flatMap((r) => conditionPaths(r.condition)));
  return profile.missing
    .filter((p) => relevant.has(p) && QUESTIONS[p])
    .slice(0, max)
    .map((p) => ({ path: p, ...QUESTIONS[p] }));
}

/** Step 2 answers written onto the profile. Deterministic, no AI. "Not sure" stays null but is not asked again. */
export function applyAnswers(profile: EventProfile, answers: { path: string; answer: string }[]): EventProfile {
  const next: any = structuredClone(profile);
  for (const { path, answer } of answers) {
    const q = QUESTIONS[path];
    if (!q || !q.options.includes(answer)) throw new Error(`Unknown answer "${answer}" for ${path}`);
    const value = answer === "Not sure" ? null
      : ANSWER_VALUES[path]?.[answer] ?? (answer === "Yes" ? true : answer.startsWith("No") ? false : answer);
    const keys = path.split(".");
    const parent = keys.slice(0, -1).reduce((o, k) => o[k], next);
    parent[keys.at(-1)!] = { value, source: "answered" };
    next.missing = next.missing.filter((m: string) => m !== path);
  }
  return EventProfile.parse(next);
}
