// Lane A, task 9: prove the DEMO_MODE safety net with the AI unreachable. Uses a deliberately broken OpenAI key, so
// every live call fails, and wraps each AI step exactly as the routes do: withDemoFallback(live, isSeeded ? cached : null).
// Gate: every step for the seeded demo event returns the cached fixture answer within 20 s, and a different
// description (or the demo switched to another council) gets an error, never the demo data.
//   npx tsx --env-file=.env.local scripts/try-demo-mode.ts
import { readFile } from "node:fs/promises";

process.env.OPENAI_API_KEY = "sk-deliberately-broken-for-demo-mode-test";
process.env.DEMO_MODE = "1";

async function main() {
  const { withDemoFallback, isSeeded } = await import("../lib/ai/demo");
  const { buildProfile } = await import("../lib/ai/profile");
  const { classify } = await import("../lib/ai/classify");
  const { draftDocument } = await import("../lib/ai/draft");
  const { checkDocument, applyFix } = await import("../lib/ai/check");
  const { EventProfile, EventDocument, Classification } = await import("../lib/schemas");
  const fixture = JSON.parse(await readFile("fixtures/demo-event.json", "utf8"));
  const profile = EventProfile.parse(fixture.profile);
  const red = EventDocument.parse(fixture.documents.find((d: any) => d.id === fixture.fixedDocument.id));
  const fixed = EventDocument.parse(fixture.fixedDocument);
  const items = red.checkResults!.items.map((i) => ({ id: i.itemId, text: i.text }));

  let pass = true;
  const step = async (name: string, ev: { description: string; council: string }, live: () => Promise<unknown>, cached: unknown, expectCached: boolean) => {
    const t = Date.now();
    let outcome: string;
    let ok: boolean;
    try {
      const v = await withDemoFallback(live, isSeeded(ev) ? cached : null);
      const same = JSON.stringify(v) === JSON.stringify(cached);
      ok = expectCached && same;
      outcome = same ? "served the cached demo answer" : "returned a live answer (unexpected with a broken key)";
    } catch (e) {
      ok = !expectCached;
      outcome = `error: ${(e as Error).message.slice(0, 70)}`;
    }
    const ms = Date.now() - t;
    if (expectCached && ms > 20_000) ok = false;
    if (!ok) pass = false;
    console.log(`${ok ? "PASS" : "FAIL"} ${name.padEnd(44)} ${(ms / 1000).toFixed(1).padStart(5)} s  ${outcome}`);
  };

  const seeded = { description: fixture.description, council: "ccc" };
  console.log("Seeded demo event, AI unreachable: each step must fall back to the cache within 20 s");
  await step("profile", seeded, () => buildProfile(seeded.description, "ccc", "2026-09-26"), profile, true);
  await step("classify", seeded, () => classify(profile), Classification.parse(fixture.classification), true);
  for (const d of fixture.documents.filter((x: any) => x.content))
    await step(`draft ${d.documentType}`, seeded, () => draftDocument(profile, d.documentType, { sections: ["x"], checklist: [] }), d.content, true);
  await step("check (red document)", seeded, () => checkDocument(red.content!, items, profile), red.checkResults, true);
  await step("fix + re-check", seeded, async () => ({ content: await applyFix(red.content!, "x") }),
    { content: fixed.content }, true);

  console.log("\nAny other event, AI unreachable: must fail, never show the demo data");
  await step("different description", { description: "A quiz night at the club rooms.", council: "ccc" },
    () => buildProfile("A quiz night at the club rooms.", "ccc", "2026-09-26"), profile, false);
  await step("same description, other council", { description: fixture.description, council: "waimakariri" },
    () => buildProfile(fixture.description, "waimakariri", "2026-09-26"), profile, false);

  console.log(pass ? "\nGATE PASSED" : "\nGATE FAILED");
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
