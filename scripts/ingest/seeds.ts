// Hand-picked seed URLs. Crawl only follows links from here, max depth 2, same domain, matching KEYWORDS.
// CCC URLs checked 26 Sep 2026. Christchurch City Council is the only council.
export const SEEDS = {
  ccc: {
    domain: "ccc.govt.nz",
    urls: [
      "https://ccc.govt.nz/news-and-events/events/running-an-event/event-permits",
      "https://ccc.govt.nz/news-and-events/events/running-an-event/conditions-for-events-on-public-land",
      "https://ccc.govt.nz/news-and-events/events/running-an-event/event-resources",
      "https://ccc.govt.nz/the-council/plans-strategies-policies-and-bylaws/plans/long-term-plan-and-annual-plans/fees-and-charges/fees-parks",
      "https://ccc.govt.nz/consents-and-licences/business-licences-and-consents/temporary-road-closures/road-closures-for-events",
      "https://ccc.govt.nz/consents-and-licences/building-consents/before-you-build/exemption-from-building-consent",
      "https://ccc.govt.nz/assets/Documents/Culture-Community/Events-Festivals/CS-Smokefree-Events-Checklist.pdf",
    ],
  },
} as const;

export type Council = keyof typeof SEEDS;
export const councilArg = (): Council => {
  const c = process.argv[2];
  if (c !== "ccc") throw new Error("Pass a council: ccc (the only council EvntX supports)");
  return c;
};

export const KEYWORDS = ["event", "alcohol", "liquor", "licen", "road-closure", "temporary-road", "park", "fees", "noise", "food", "marquee", "safety", "form"];
// TRD: the user agent names EvntX and a contact email. crawl.ts refuses to run until you replace the placeholder.
export const USER_AGENT = "EvntXBot/0.1 (hackathon research; contact: [YOUR EMAIL])";
