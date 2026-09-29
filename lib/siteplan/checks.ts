// Site checks, derived from the placed items every time (never stored). A check is a council
// requirement only when a verified council fact backs it; everything else is labelled an EvntX check.
import type { CouncilSlug, DocumentType, Requirement, SiteItem, SiteItemKind } from "../schemas";

export type SiteCheck = {
  id: string;
  label: string;
  pass: boolean;
  note: string | null;
  basis: "council" | "evntx";
  source: { url: string; quote: string; lastChecked: string } | null; // set only when basis is "council"
};

/** A council's own words that a site plan must show `kind` when `documentType` is required. */
export interface SiteCouncilFact {
  council: CouncilSlug;
  documentType: DocumentType;
  kind: SiteItemKind;
  sourceUrl: string;
  sourceQuote: string;
  lastChecked: string | null;
  verified: boolean;
}

// verified: false facts never make a council check. Only set verified: true after reading the source yourself.
export const SITE_COUNCIL_FACTS: SiteCouncilFact[] = [
  // Lane B reviewed this source on 26 Sep 2026: scripts/ingest/verified/ccc/special-licence.json, item "site-plan".
  { council: "ccc", documentType: "special_licence_application", kind: "licensed",
    sourceUrl: "https://ccc.govt.nz/assets/Documents/Consents-and-Licences/business-licences-and-consents/Alcohol/SpecialLicence.pdf",
    sourceQuote: "A plan of the building/detailed site plan of the area to be licensed", lastChecked: "2026-09-26", verified: true },
];

export function siteChecks(
  items: SiteItem[],
  ctx: { council: CouncilSlug; requirements: Pick<Requirement, "documentType">[] },
  facts: SiteCouncilFact[] = SITE_COUNCIL_FACTS,
): SiteCheck[] {
  const on = (k: SiteItemKind) => items.filter((e) => e.kind === k && e.placed).length;
  const evntx = (id: string, label: string, pass: boolean, note: string | null = null): SiteCheck =>
    ({ id, label, pass, note, basis: "evntx", source: null });
  const checks: SiteCheck[] = [];

  if (ctx.requirements.some((r) => r.documentType === "special_licence_application")) {
    const fact = facts.find((f) => f.council === ctx.council && f.documentType === "special_licence_application"
      && f.kind === "licensed" && f.verified && /^https?:\/\//.test(f.sourceUrl) && f.lastChecked);
    const check = evntx("licensed", "Licensed area marked", on("licensed") > 0);
    checks.push(fact?.lastChecked
      ? { ...check, basis: "council", source: { url: fact.sourceUrl, quote: fact.sourceQuote, lastChecked: fact.lastChecked } }
      : check);
  }
  checks.push(
    evntx("exits", "At least two exits", on("exit") >= 2, `${on("exit")} on the plan`),
    evntx("firstaid", "First aid on the plan", on("firstaid") > 0),
    evntx("assembly", "Assembly point placed", on("assembly") > 0),
  );
  return checks;
}
