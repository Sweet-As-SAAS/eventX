// Lane A, task 7: classify the demo event live against CCC's knowledge base.
// Gate: a category with reasoning drawn from retrieved chunks and citedChunkIds non-empty, or an honest "unclear".
// Only fees stated in a cited chunk survive (lib/ai/guards.ts).
//   npx tsx --env-file=.env.local scripts/try-classify.ts [runs]
import { readFile } from "node:fs/promises";
import { EventProfile } from "../lib/schemas";
import { classify } from "../lib/ai/classify";
import { MODEL_STRONG } from "../lib/ai/client";

const runsArg = process.argv.slice(2).find((a) => /^\d+$/.test(a));
const RUNS = runsArg ? Number(runsArg) : 3;

async function main() {
  const fixture = JSON.parse(await readFile("fixtures/demo-event.json", "utf8"));
  const profile = EventProfile.parse(fixture.profile);
  console.log(`classify × ${RUNS}, model ${MODEL_STRONG}\n`);
  let pass = true;
  for (let i = 0; i < RUNS; i++) {
    const t0 = Date.now();
    const c = await classify(profile);
    const grounded = c.category === "unclear" || c.citedChunkIds.length > 0;
    if (!grounded) pass = false;
    console.log(`run ${i + 1} (${((Date.now() - t0) / 1000).toFixed(1)} s): ${c.category}, cites ${c.citedChunkIds.length} chunks ${grounded ? "" : "FAIL: not grounded"}`);
    console.log(`  reasoning: ${c.reasoning}`);
    console.log(`  how to present: ${c.howToPresent ?? "—"}\n`);
  }
  console.log(pass ? "GATE PASSED" : "GATE FAILED");
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
