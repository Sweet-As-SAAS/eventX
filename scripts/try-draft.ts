// Lane A, tasks 5 and 6: draft every required drafted document for the demo event in parallel, check each against
// its verified council checklist, then apply one suggested fix and re-check (red to green).
// Gates: all drafts in under 60 s together; every draft parses; checklist coverage; every number in a draft is
// either in the event profile or in the council's own template/checklist wording (anything else is listed for review).
//
//   npx tsx --env-file=.env.local scripts/try-draft.ts                  uses fixture.profile (repeatable input)
//   npx tsx --env-file=.env.local scripts/try-draft.ts --live-profile   builds the profile from the description first
//
// Needs OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Outputs go to data/try-draft/ (gitignored).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { DRAFTED_TYPES, EventProfile, type CheckResult, type DocumentType, type DraftDocument } from "../lib/schemas";
import { db } from "../lib/supabase/admin";
import { requiredDocuments, staticRules } from "../lib/rules";
import { buildProfile } from "../lib/ai/profile";
import { draftDocument } from "../lib/ai/draft";
import { checkDocument, applyFix } from "../lib/ai/check";
import { splitChecklist } from "../lib/ai/guards";
import { MODEL_FAST, MODEL_STRONG } from "../lib/ai/client";

const TODAY = "2026-09-26";
const COUNCIL = "ccc" as const;
const BUDGET_MS = 60_000;

type Item = { id: string; text: string };
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const text = (d: DraftDocument) => [d.title, ...d.sections.flatMap((s) => [s.heading, s.body])].join("\n");
const numbers = (s: string) => new Set(s.match(/\$?\d[\d,]*(?:\.\d+)?/g)?.map((n) => n.replace(/[$,]/g, "")) ?? []);

async function main() {
  const missingEnv = ["OPENAI_API_KEY", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
  if (missingEnv.length) {
    console.error(`Missing ${missingEnv.join(", ")}. Fill .env.local and run:\n  npx tsx --env-file=.env.local scripts/try-draft.ts`);
    process.exit(1);
  }
  const fixture = JSON.parse(await readFile("fixtures/demo-event.json", "utf8"));
  const profile = process.argv.includes("--live-profile")
    ? await buildProfile(fixture.description, COUNCIL, TODAY)
    : EventProfile.parse(fixture.profile);

  const types = requiredDocuments(profile, staticRules).map((r) => r.documentType).filter((t) => DRAFTED_TYPES.has(t));
  const council = await db().from("councils").select("id").eq("slug", COUNCIL).single();
  if (council.error) throw new Error(`councils: ${council.error.message}`);
  const [templates, checklists] = await Promise.all([
    db().from("templates").select("document_type, sections").eq("council_id", council.data.id),
    db().from("checklists").select("document_type, items").eq("council_id", council.data.id).eq("verified", true),
  ]);
  if (templates.error || checklists.error) throw new Error(templates.error?.message ?? checklists.error?.message);
  const sectionsOf = (t: DocumentType) => templates.data.find((r) => r.document_type === t)?.sections as string[] | undefined;
  const checklistOf = (t: DocumentType) => (checklists.data.find((r) => r.document_type === t)?.items ?? []) as Item[];

  const ready = types.filter((t) => sectionsOf(t)?.length && checklistOf(t).length);
  const skipped = types.filter((t) => !ready.includes(t));
  console.log(`Models: draft ${MODEL_STRONG}, check ${MODEL_FAST}. Profile: ${process.argv.includes("--live-profile") ? "live" : "fixture"}.`);
  console.log(`Required drafted types: ${types.join(", ")}`);
  if (skipped.length) console.log(`No published template or verified checklist, skipped: ${skipped.join(", ")}`);

  // Draft all in parallel, like the Documents screen does.
  const t0 = Date.now();
  const drafts = await Promise.all(ready.map(async (type) => {
    const s = Date.now();
    try {
      const doc = await draftDocument(profile, type, { sections: sectionsOf(type)!, checklist: checklistOf(type) });
      return { type, doc, ms: Date.now() - s };
    } catch (e) {
      return { type, error: e instanceof Error ? e.message : String(e), ms: Date.now() - s };
    }
  }));
  const draftMs = Date.now() - t0;
  console.log(`\nDrafted ${drafts.filter((d) => "doc" in d).length}/${ready.length} in ${secs(draftMs)} (budget ${secs(BUDGET_MS)})`);

  // Check all in parallel.
  const checks = await Promise.all(drafts.map(async (d) => {
    if (!("doc" in d) || !d.doc) return { type: d.type, error: "not drafted" };
    try {
      return { type: d.type, result: await checkDocument(d.doc, checklistOf(d.type), profile) };
    } catch (e) {
      return { type: d.type, error: e instanceof Error ? e.message : String(e) };
    }
  }));

  // Report per document.
  const profileNumbers = numbers(JSON.stringify(profile));
  let allPass = true;
  let passed = 0, total = 0;
  for (const d of drafts) {
    console.log(`\n=== ${d.type} (${secs(d.ms)})`);
    if (!("doc" in d) || !d.doc) { console.log(`  DRAFT FAILED: ${"error" in d ? d.error : ""}`); allPass = false; continue; }
    const { applicable, notApplicable } = splitChecklist(checklistOf(d.type), profile);
    console.log(`  ${d.doc.sections.length} sections · ${d.doc.placeholders.length} placeholders · cites ${d.doc.citedChunkIds.length} chunks`);
    if (notApplicable.length) console.log(`  skipped for this crowd size: ${notApplicable.map((i) => i.id).join(", ")}`);
    const c = checks.find((x) => x.type === d.type)!;
    if ("error" in c) { console.log(`  CHECK FAILED: ${c.error}`); allPass = false; continue; }
    const fails = c.result!.items.filter((i) => !i.pass);
    passed += c.result!.items.length - fails.length;
    total += c.result!.items.length;
    console.log(`  checklist: ${c.result!.items.length - fails.length}/${applicable.length} pass`);
    for (const f of fails) console.log(`    ✗ ${f.itemId}: ${f.text}\n      fix: ${f.suggestedFix}`);
    console.log(`  placeholders: ${d.doc.placeholders.join(" ") || "none"}`);
    // Invented-fact scan: numbers must come from the profile or the council's own template/checklist wording.
    const allowed = new Set([...profileNumbers, ...numbers(JSON.stringify(checklistOf(d.type))), ...numbers(JSON.stringify(sectionsOf(d.type)))]);
    const unexplained = [...numbers(text(d.doc))].filter((n) => !allowed.has(n));
    console.log(`  numbers not in profile or checklist: ${unexplained.join(", ") || "none"}${unexplained.length ? "  <- check each against a cited chunk" : ""}`);
  }

  // Task 6: one red item, fixed and re-checked.
  let fixDemo: unknown = null;
  const red = checks.find((c) => "result" in c && c.result!.items.some((i) => !i.pass));
  if (red && "result" in red) {
    const item = red.result!.items.find((i) => !i.pass)!;
    const before = drafts.find((d) => d.type === red.type)!;
    if ("doc" in before && before.doc) {
      const s = Date.now();
      const fixed = await applyFix(before.doc, item.suggestedFix!);
      const after: CheckResult = await checkDocument(fixed, checklistOf(red.type), profile);
      const afterItem = after.items.find((i) => i.itemId === item.itemId);
      console.log(`\n=== Fix demo: ${red.type} / ${item.itemId} (${secs(Date.now() - s)})`);
      console.log(`  before: ${JSON.stringify(item)}`);
      console.log(`  after:  ${JSON.stringify(afterItem)}`);
      console.log(`  ${afterItem?.pass ? "red -> green" : "STILL RED"}; document ${after.items.every((i) => i.pass) ? "all green" : "still has red items"}`);
      fixDemo = { type: red.type, itemId: item.itemId, before: { doc: before.doc, item }, after: { doc: fixed, check: after } };
    }
  } else {
    console.log("\nNo red item on first check, so no fix demo this run.");
  }

  // Gate
  const inBudget = draftMs <= BUDGET_MS;
  console.log(`\nGate`);
  console.log(`  all drafted and checked: ${allPass ? "yes" : "NO"}`);
  console.log(`  drafts within ${secs(BUDGET_MS)}: ${inBudget ? "yes" : `NO (${secs(draftMs)})`}`);
  console.log(`  checklist items passing on first draft: ${passed}/${total}${total ? ` (${Math.round((100 * passed) / total)}%, target 80%)` : ""}`);
  console.log(`  review the "numbers not in profile" lines by hand: invented facts are a fail`);

  await mkdir("data/try-draft", { recursive: true });
  const file = `data/try-draft/${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await writeFile(file, JSON.stringify({ models: { draft: MODEL_STRONG, check: MODEL_FAST }, profile, drafts, checks, fixDemo }, null, 2));
  console.log(`Saved to ${file}`);
  process.exit(allPass && inBudget ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
