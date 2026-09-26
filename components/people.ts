import type { EventProfile, People } from "@/lib/schemas";

// Who's doing what: asked once on the Questions page so drafts carry real names instead of [NAME] gaps.
// UI copy only. Which documents are required is still decided by the rules engine.
export type RoleKey = keyof People;
export type Quick = "same" | "stallholders";
export type Role = { key: RoleKey; label: string; question: string; why: string; goesInto: string; placeholder: string; quick: Quick[]; ask: (p: EventProfile) => boolean };

const sellsAlcohol = (p: EventProfile) => p.alcohol.supply.value === "sold";

export const ROLES: Role[] = [
  { key: "organiser", label: "organiser", question: "Who's organising it?", placeholder: "Your name, or your club or company",
    why: "The special licence and permit form name the applicant: the person the council deals with and who's in charge overall.",
    goesInto: "Every plan, the special licence and the permit form", quick: [], ask: () => true },
  { key: "contact", label: "contact", question: "Best phone and email for the council?", placeholder: "Phone and email",
    why: "The council and the licensing team use this to reach the applicant about the application.",
    goesInto: "The special licence and the permit form", quick: [], ask: () => true },
  { key: "dutyManager", label: "duty manager", question: "Who's the duty manager?", placeholder: "Their full name",
    why: "The special licence has to name a manager for the event, or ask for an exemption.",
    goesInto: "The special licence and alcohol management plan", quick: ["same"], ask: sellsAlcohol },
  { key: "security", label: "security", question: "Who's doing security?", placeholder: "Security company, or the person in charge of it",
    why: "The council's alcohol management plan guide expects security staff once numbers pass about 100 patrons.",
    goesInto: "The alcohol management plan and special licence", quick: [], ask: sellsAlcohol },
  { key: "foodProvider", label: "food", question: "Who's providing the food?", placeholder: "Caterer or vendors",
    why: "The special licence has to describe the food available and who provides it.",
    goesInto: "The special licence and alcohol management plan", quick: ["stallholders"],
    ask: (p) => sellsAlcohol(p) && (p.food.stalls.value ?? 1) > 0 },
  { key: "wasteCollector", label: "waste", question: "Who collects and gets rid of the waste?", placeholder: "A person, or your waste contractor",
    why: "For events of about 1,000 people or more, the council's waste section asks who collects and disposes of it. Name a person or company, not a group like \"volunteers\".",
    goesInto: "Waste management", quick: ["same"], ask: (p) => p.openToPublic.value !== false && p.venue.councilLand.value !== false && (p.peakAttendance.value ?? 1000) >= 1000 },
];

export const QUICK_LABEL: Record<Quick, string> = { same: "Same as the organiser", stallholders: "Each stall holder brings their own" };
export const quickValue = (q: Quick, organiser: string) => (q === "same" ? organiser : "Each food stall holder provides their own food");

/** The roles worth asking about for this event. */
export const rolesFor = (p: EventProfile) => ROLES.filter((r) => r.ask(p));
/** Roles still without a name. */
export const peopleToAsk = (p: EventProfile) => rolesFor(p).filter((r) => !p.people[r.key].value);
/** "Sam Rivers (organiser)" chips for filling [NAME] gaps on the Documents page. */
export const namedPeople = (p: EventProfile) =>
  ROLES.flatMap((r) => (p.people[r.key].value ? [{ label: r.label, value: p.people[r.key].value! }] : []));
