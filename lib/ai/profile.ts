import { EventProfile, type FollowUpQuestion, type CouncilSlug } from "../schemas";
import { structured, MODEL_FAST } from "./client";
import { PROFILE_SYSTEM } from "./prompts";
import { conditionPaths, type Rule } from "../rules/engine";

/** Step 1. `today` is the NZ date (nzToday) so "this Sunday" resolves correctly. */
export async function buildProfile(description: string, council: CouncilSlug, today: string) {
  const profile = await structured({
    schema: EventProfile, name: "event_profile", model: MODEL_FAST, system: PROFILE_SYSTEM,
    user: `Reference date: ${today}\nCouncil: ${council}\nDescription:\n${description}`,
  });
  return { ...profile, councilSlug: council };
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
