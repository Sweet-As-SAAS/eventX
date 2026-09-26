// Hand-picked seed URLs. Crawl only follows links from here, max depth 2, same domain, matching KEYWORDS.
// CCC URLs checked 26 Sep 2026. Waimakariri: TODO(lane B) add pages found via site search on waimakariri.govt.nz.
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
  waimakariri: {
    domain: "waimakariri.govt.nz",
    urls: [
      "https://www.waimakariri.govt.nz/home",
      // TODO(lane B): event permit page, alcohol licensing page, special licence form, fees and charges, road closures
    ],
  },
} as const;

export type Council = keyof typeof SEEDS;
export const councilArg = (): Council => {
  const c = process.argv[2];
  if (c !== "ccc" && c !== "waimakariri") throw new Error('Pass a council: ccc or waimakariri (never "wdc", that is Whangārei)');
  return c;
};

export const KEYWORDS = ["event", "alcohol", "liquor", "licen", "road-closure", "temporary-road", "park", "fees", "noise", "food", "marquee", "safety", "form"];
// TRD: the user agent names EvntX and a contact email. crawl.ts refuses to run until you replace the placeholder.
export const USER_AGENT = "EvntXBot/0.1 (hackathon research; contact: [YOUR EMAIL])";
