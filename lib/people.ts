// Fills role gaps ([DUTY MANAGER NAME], [PHONE NUMBER]...) with the people the organiser named. Pure and browser-safe:
// drafting, fixing and the Documents screen all use it, so a name typed once lands everywhere.
import type { People } from "./schemas";

type Pick = (p: People) => string | null;
const email = (c: string | null) => c?.match(/[^\s,;]+@[^\s,;]+/)?.[0] ?? null;
const phone = (c: string | null) => c?.replace(email(c) ?? "", "").replace(/^[\s,;]+|[\s,;]+$/g, "") || null;

// First match wins, so the specific roles come before the organiser. A gap must be asking for a who or a how-to-reach.
const WHO = /NAME|PERSON|COMPANY|FIRM|PROVIDER|CONTRACTOR|SUPPLIER|VENDOR|CATERER|RESPONSIBLE|CONTACT|PHONE|MOBILE|EMAIL/;
const ROLES: [RegExp, Pick][] = [
  [/DUTY MANAGER|LICENSED MANAGER|MANAGER FOR THE EVENT/, (p) => p.dutyManager.value],
  [/SECURITY/, (p) => p.security.value],
  [/FOOD|CATER/, (p) => p.foodProvider.value],
  [/WASTE|RUBBISH|RECYCLING/, (p) => p.wasteCollector.value],
  [/EMAIL/, (p) => email(p.contact.value)],
  [/PHONE|MOBILE/, (p) => phone(p.contact.value)],
  [/CONTACT DETAILS|CONTACT INFORMATION/, (p) => p.contact.value],
  [/APPLICANT|ORGANI[SZ]ER|EVENT MANAGER|EVENT LEAD|PERSON IN CHARGE/, (p) => p.organiser.value],
];

/** The named person for one [PLACEHOLDER], or null when it isn't a role we know. */
export function personFor(placeholder: string, people: People): string | null {
  const gap = placeholder.toUpperCase();
  if (!WHO.test(gap)) return null;
  for (const [role, pick] of ROLES) if (role.test(gap)) return pick(people);
  return null;
}

/** Replaces every role gap we can fill; leaves the rest ([WASTE AMOUNT], [ATTACH MENUS]) for the organiser. */
export const fillPeople = (text: string, people: People) => text.replace(/\[[^\[\]\n]+\]/g, (m) => personFor(m, people) ?? m);
