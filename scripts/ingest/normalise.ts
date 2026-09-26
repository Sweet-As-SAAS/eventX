// Step 6: AI turns each source into CANDIDATE rules, checklists, templates, lead times and fees. Nothing is verified here.
// Output: data/normalised/<council>/*.json for a human to review. Run: npm run ingest:normalise -- ccc
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { z } from "zod";
import { DocumentType } from "../../lib/schemas";
import { structured, fence } from "../../lib/ai/client";
import { normaliseSystem } from "../../lib/ai/prompts";
import { councilArg } from "./seeds";

const council = councilArg();

const Candidate = z.object({
  rules: z.array(z.object({
    id: z.string().describe("short kebab-case id, unique within this council"),
    description: z.string(),
    conditionJson: z.string().describe('Condition as JSON using profile paths, e.g. {"path":"alcohol.supply","eq":"sold"}'),
    documentType: DocumentType, reason: z.string(), sourceQuote: z.string().describe("Exact sentence from the source"),
  })),
  checklists: z.array(z.object({ documentType: DocumentType, items: z.array(z.object({ id: z.string(), text: z.string(), sourceQuote: z.string() })) })),
  templates: z.array(z.object({ documentType: DocumentType, sections: z.array(z.string()) })),
  leadTimes: z.array(z.object({ documentType: DocumentType, text: z.string(), sourceQuote: z.string() })),
  fees: z.array(z.object({ item: z.string(), amount: z.string(), sourceQuote: z.string() })),
});

// Must match lib/schemas.ts EventProfile. Condition operators: eq, gt, gte, truthy, all, any (lib/rules/engine.ts).
const PROFILE_PATHS = "openToPublic, venue.councilLand, peakAttendance, childrenAttending, alcohol.supply (sold|free|byo|none), food.stalls, food.cookingOnSite, structures.marquees, structures.largestMarqueeSqm, structures.stageOver1m, structures.inflatables, structures.mechanicalRides, generators, amplifiedSound, roadOrFootpathImpact, vehicleAccess";

async function main() {
  await mkdir(`data/normalised/${council}`, { recursive: true });
  for (const f of await readdir(`data/text/${council}`)) {
    const text = await readFile(`data/text/${council}/${f}`, "utf8");
    const url = text.match(/<!-- source: (.*) -->/)?.[1] ?? "";
    const candidate = await structured({
      schema: Candidate, name: "candidate", model: "strong", system: normaliseSystem(council, PROFILE_PATHS),
      user: fence(url, text.slice(0, 60000)),
    });
    await writeFile(`data/normalised/${council}/${f.replace(".md", ".json")}`, JSON.stringify({ url, verified: false, ...candidate }, null, 2));
    console.log("normalised", url, candidate.rules.length, "rules");
  }
  console.log("NEXT: open each JSON, check every item against the live page, add \"verified\": true to items you confirmed.");
}
main();
