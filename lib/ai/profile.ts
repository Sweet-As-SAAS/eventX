import { EventProfile, type FollowUpQuestion, type CouncilSlug } from "../schemas";
import { structured, MODEL_FAST } from "./client";
import { PROFILE_SYSTEM } from "./prompts";
import { conditionPaths, type Rule } from "../rules/engine";
import { normalizeProfile, profileFields } from "./guards";

/** Step 1. `today` is the NZ date (nzToday) so "this Sunday" resolves correctly. */
export async function buildProfile(description: string, council: CouncilSlug, today: string) {
  const raw = await structured({
    schema: EventProfile, name: "event_profile", model: MODEL_FAST, system: PROFILE_SYSTEM,
    user: `Reference date: ${today}\nCouncil: ${council}\nDescription:\n${description}`,
  });
  return normalizeProfile(raw, { council, today, description });
}

// Deterministic question bank. A question is only asked if its path is missing AND a verified rule reads it.
// Order is priority: when more than 3 qualify, the ones that decide the most documents are asked first.
// Wording stays generic: it must suit any event any organiser could describe.
export const QUESTIONS: Record<string, Omit<FollowUpQuestion, "path">> = {
  "openToPublic": { question: "Can anyone attend, even with a ticket?", options: ["Yes", "No, invite only"] },
  "venue.councilLand": { question: "Is the venue on council land, such as a public park, reserve or street?", options: ["Yes", "No", "Not sure"] },
  "alcohol.supply": { question: "Will alcohol be sold, given away, or BYO?", options: ["Sold", "Given away", "BYO", "No alcohol"] },
  // Bands follow CCC thresholds: 150 (alcohol management plan), 100 and 400 (special licence fee classes), 1000 (waste plan detail).
  "peakAttendance": { question: "Roughly how many people at the busiest time?", options: ["Up to 100", "101 to 150", "151 to 400", "401 to 1,000", "Over 1,000"] },
  "structures.inflatables": { question: "Will there be a bouncy castle or other inflatable?", options: ["Yes", "No"] },
  "structures.mechanicalRides": { question: "Any mechanical rides, like a Ferris wheel?", options: ["Yes", "No"] },
  "structures.largestMarqueeSqm": { question: "How big is your largest marquee?", options: ["Under 100 sqm", "Over 100 sqm", "Not sure"] },
  "roadOrFootpathImpact": { question: "Will any roads or footpaths be closed or affected?", options: ["Yes", "No", "Not sure"] },
  "food.stalls": { question: "Will food be sold or served?", options: ["Yes", "No"] },
  "food.cookingOnSite": { question: "Will any food be cooked on site?", options: ["Yes", "No", "Not sure"] },
};

// Tap answers that are not plain Yes/No map to a representative value on the right side of each rule threshold.
const ANSWER_VALUES: Record<string, Record<string, unknown>> = {
  "structures.largestMarqueeSqm": { "Under 100 sqm": 50, "Over 100 sqm": 150 },
  "alcohol.supply": { Sold: "sold", "Given away": "free", BYO: "byo", "No alcohol": "none" },
  // Rules read food.stalls > 0. "Yes" records at least one stall; the organiser can correct the count later.
  "food.stalls": { Yes: 1, No: 0 },
  // A value inside each band. rangeNotes() tells the drafter these are bands, so the number is never stated as fact.
  peakAttendance: { "Up to 100": 100, "101 to 150": 150, "151 to 400": 400, "401 to 1,000": 700, "Over 1,000": 1500 },
};

export function followUps(profile: EventProfile, rules: Rule[], max = 3): FollowUpQuestion[] {
  const relevant = new Set(rules.filter((r) => r.verified && r.council === profile.councilSlug).flatMap((r) => conditionPaths(r.condition)));
  const missing = new Set(profile.missing);
  return Object.keys(QUESTIONS)
    .filter((p) => missing.has(p) && relevant.has(p))
    .slice(0, max)
    .map((p) => ({ path: p, ...QUESTIONS[p] }));
}

/**
 * Numeric tap answers are bands stored as a value inside the band, so rules can evaluate them. This tells the
 * drafter what the organiser actually said, so "151 to 400" never turns into "400 people" in a council document.
 */
export function rangeNotes(profile: EventProfile): string[] {
  return Object.entries(ANSWER_VALUES).flatMap(([path, values]) => {
    const field = profileFields(profile).find((f) => f.path === path)?.field;
    if (field?.source !== "answered" || typeof field.value !== "number") return [];
    const label = Object.keys(values).find((k) => values[k] === field.value);
    return label ? [`${path}: the organiser answered "${label}" to "${QUESTIONS[path].question}". ${field.value} is a stand-in; never state it, describe it as they did.`] : [];
  });
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
