// Council fees for each required document, read from each council's 2026/27 fee schedule on 27 Sep 2026.
// Pure and browser-safe so the Documents screen can price the pack. A fee we have not verified stays null ("check with council").
import type { DocumentType, EventProfile } from "../schemas";

export type Category = "community" | "commercial" | "unclear";
/** min === max is one amount; min < max is a range (usually community vs commercial). min null: no verified amount. */
export type FeeLine = { documentType: DocumentType; min: number | null; max: number | null; note: string; sourceUrl: string | null };

export const FEES_CHECKED = "2026-09-27";
const CCC_PARKS = "https://ccc.govt.nz/the-council/plans-strategies-policies-and-bylaws/plans/long-term-plan-and-annual-plans/fees-and-charges/fees-parks";
const CCC_ALCOHOL = "https://ccc.govt.nz/consents-and-licences/business-licences-and-consents/alcohol/alcohol-licence-fees";
const CCC_BUILDING = "https://ccc.govt.nz/the-council/plans-strategies-policies-and-bylaws/plans/long-term-plan-and-annual-plans/fees-and-charges/fees-building-control";
const CCC_STREETS = "https://ccc.govt.nz/the-council/plans-strategies-policies-and-bylaws/plans/long-term-plan-and-annual-plans/fees-and-charges/fees-streets-and-transport";
const CCC_COMPLIANCE = "https://ccc.govt.nz/the-council/plans-strategies-policies-and-bylaws/plans/long-term-plan-and-annual-plans/fees-and-charges/fees-compliance";
const WMK_PREMISES = "https://www.waimakariri.govt.nz/services/fees-and-charges/2026/registered-premises";
const WMK_BUILDING = "https://www.waimakariri.govt.nz/services/fees-and-charges/2026/building-services";
const WMK_ROADING = "https://www.waimakariri.govt.nz/services/fees-and-charges/2026/roading";
const WMK_PARKS = "https://www.waimakariri.govt.nz/services/fees-and-charges/2026/community-centres-and-halls";
const WMK_DEVICES = "https://www.waimakariri.govt.nz/services/fees-and-charges/2026/amusement-devices";

/** [upper bound of the attendance tier, daily fee]. The first tier the crowd fits in wins. */
type Tiers = [number, number][];
const tier = (t: Tiers, n: number) => t.find(([upTo]) => n <= upTo)?.[1] ?? null;
const HAGLEY = { community: [[299, 67], [1000, 196], [10000, 392], [Infinity, 639]] as Tiers, communityAdmin: 93,
  commercial: [[299, 464], [1000, 629], [10000, 938], [Infinity, 2165]] as Tiers, commercialAdmin: 206 };
const CCC_PARK = { community: [[5000, 0], [Infinity, 247]] as Tiers, commercial: [[299, 155], [500, 227], [4999, 381], [Infinity, 773]] as Tiers, admin: 90 };

const one = (documentType: DocumentType, amount: number, note: string, sourceUrl: string): FeeLine =>
  ({ documentType, min: amount, max: amount, note, sourceUrl });
const range = (documentType: DocumentType, a: number | null, b: number | null, category: Category, note: string, sourceUrl: string): FeeLine => {
  if (a == null || b == null) return { documentType, min: null, max: null, note: "Depends on crowd size. Check with the council.", sourceUrl };
  const [min, max] = category === "community" ? [a, a] : category === "commercial" ? [b, b] : [a, b];
  return { documentType, min, max, note: category === "unclear" ? `${note} Community rate to commercial rate, until the council confirms which.` : note, sourceUrl };
};

/** Special licence class by expected crowd, for a single event (both councils publish the national three-tier fees). */
const licence = (n: number | null, url: string): FeeLine =>
  n == null ? { documentType: "special_licence_application", min: null, max: null, note: "Depends on crowd size.", sourceUrl: url }
  : one("special_licence_application", n < 100 ? 63.25 : n <= 400 ? 207 : 575,
    n < 100 ? "Small event, under 100 people." : n <= 400 ? "Medium event, 100 to 400 people." : "Large event, over 400 people.", url);

export function feesFor(profile: EventProfile, types: DocumentType[], category: Category = "unclear"): FeeLine[] {
  const n = profile.peakAttendance.value;
  const ccc = profile.councilSlug === "ccc";
  return types.map((t): FeeLine => {
    switch (t) {
      case "event_permit_application": {
        if (!ccc) return range(t, 37.3, 213.2, category, "Park booking, per day.", WMK_PARKS);
        if (n == null) return range(t, null, null, category, "", CCC_PARKS);
        if (/hagley park/i.test(profile.venue.name.value ?? "")) {
          const a = n < 50 ? null : tier(HAGLEY.community, n), b = n < 50 ? null : tier(HAGLEY.commercial, n);
          return range(t, a == null ? null : a + HAGLEY.communityAdmin, b == null ? null : b + HAGLEY.commercialAdmin, category,
            "Hagley Park, one day plus admin fee. Set-up days cost the same again; a refundable bond applies.", CCC_PARKS);
        }
        const b = n < 50 ? null : tier(CCC_PARK.commercial, n);
        return range(t, tier(CCC_PARK.community, n)! + CCC_PARK.admin, b == null ? null : b + CCC_PARK.admin, category,
          "Park hire, one day plus admin fee. Set-up days cost the same again; a refundable bond applies.", CCC_PARKS);
      }
      case "special_licence_application": return licence(n, ccc ? CCC_ALCOHOL : WMK_PREMISES);
      case "building_consent_exemption": return ccc ? one(t, 500, "Marquee exemption, charged even if declined.", CCC_BUILDING)
        : one(t, 464, "Marquee, fixed fee.", WMK_BUILDING);
      case "traffic_management_plan": return ccc ? { documentType: t, min: 190, max: 380, note: "Depends on the road level. Extra time is charged by the hour.", sourceUrl: CCC_STREETS }
        : one(t, 106.3, "Standard traffic management plan.", WMK_ROADING);
      case "amusement_device_permit": return one(t, 11.5, "One device, first 7 days.", ccc ? CCC_COMPLIANCE : WMK_DEVICES);
      case "food_licence_check": return { documentType: t, min: null, max: null, note: "Usually none for a fundraiser. Registered food businesses pay their own.", sourceUrl: null };
      default: return { documentType: t, min: 0, max: 0, note: "No fee in the council's schedule.", sourceUrl: null };
    }
  });
}

/** Known fees added up. `unknown` counts the lines we could not price. */
export function feeTotal(lines: FeeLine[]) {
  const known = lines.filter((l) => l.min != null);
  return { min: known.reduce((s, l) => s + l.min!, 0), max: known.reduce((s, l) => s + l.max!, 0), unknown: lines.length - known.length };
}
