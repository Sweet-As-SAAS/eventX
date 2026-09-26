import { readFile, writeFile } from "node:fs/promises";
import { applyFix, checkDocument } from "../lib/ai/check";
import { CheckResult, DraftDocument, EventProfile } from "../lib/schemas";
import { db } from "../lib/supabase/admin";
import fixture from "../fixtures/demo-event.json";

async function main() {
  const saved = JSON.parse(await readFile("data/ai-live/ai-run.json", "utf8"));
  const drafts: { type: string; draft: DraftDocument }[] = saved.drafts;
  const profile = EventProfile.parse(fixture.profile);
  const { data: council, error: councilError } = await db().from("councils").select("id").eq("slug", profile.councilSlug).single();
  if (councilError) throw councilError;
  const { data: lists, error } = await db().from("checklists").select("document_type, items").eq("council_id", council.id).eq("verified", true);
  if (error) throw error;

  const results = await Promise.all(drafts.map(async ({ type, draft }) => {
    const items = lists.find((list) => list.document_type === type)?.items as { id: string; text: string }[] | undefined;
    if (!items?.length) throw new Error(`No checklist for ${type}`);
    const checked = CheckResult.parse(await checkDocument(DraftDocument.parse(draft), items));
    return { type, checked };
  }));
  console.table(results.map(({ type, checked }) => ({ type, total: checked.items.length,
    failed: checked.items.filter((item) => !item.pass).map((item) => item.itemId).join(", ") })));

  const source = drafts.find(({ type }) => type === "health_safety_plan")?.draft;
  const registerItem = (lists.find((list) => list.document_type === "health_safety_plan")?.items as { id: string; text: string }[])
    .find((item) => item.id === "accident-register");
  if (!source || !registerItem) throw new Error("Accident register checklist item unavailable");
  const broken = DraftDocument.parse({ ...source, sections: source.sections.map((section) =>
    /accident register/i.test(section.heading) ? { ...section, body: "[ACCIDENT REGISTER PROCESS]" } : section),
    placeholders: [...source.placeholders, "[ACCIDENT REGISTER PROCESS]"] });
  const before = CheckResult.parse(await checkDocument(broken, [registerItem]));
  const suggestion = before.items[0]?.suggestedFix;
  if (before.items[0]?.pass || !suggestion) throw new Error("Checker failed to flag the accident register placeholder");
  const fixed = DraftDocument.parse(await applyFix(broken, suggestion));
  const after = CheckResult.parse(await checkDocument(fixed, [registerItem]));
  console.log("Fix gate:", JSON.stringify({ before: before.items[0], suggestion, after: after.items[0] }));
  await writeFile("data/ai-live/check-run.json", JSON.stringify({ results, before, fixed, after }, null, 2));
  if (!after.items[0]?.pass) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
