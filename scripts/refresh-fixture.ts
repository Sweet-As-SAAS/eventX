// Lane A, task 8: rebuild the AI parts of fixtures/demo-event.json from a real run of the "demo" scenario
// (scripts/try-scenarios.ts output), so MOCK and DEMO_MODE serve genuine model output, not hand-written text.
// No API calls. Afterwards run `npm run fixture` (questions, requirements, deadlines) and `npm test`.
//
//   npx tsx scripts/refresh-fixture.ts data/scenarios/<run>.json
//
// Keeps document ids, keeps exactly one needs_fix document (its first draft with its red items) whose
// fixedDocument is the same document after "Fix", all green. Every other drafted document is served all green.
import { readFile, writeFile } from "node:fs/promises";
import { DRAFTED_TYPES, EventProfile, type DocumentType } from "../lib/schemas";

const FIXTURE = "fixtures/demo-event.json";
const IDS: Partial<Record<DocumentType, string>> = {
  event_permit_application: "doc-permit", site_plan: "doc-site-plan", health_safety_plan: "doc-hs",
  waste_management_confirmation: "doc-waste", hazard_register: "doc-hazard", food_licence_check: "doc-food",
  special_licence_application: "doc-licence", alcohol_management_plan: "doc-amp",
};
const idOf = (t: DocumentType) => IDS[t] ?? `doc-${t.replaceAll("_", "-")}`;

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("Usage: npx tsx scripts/refresh-fixture.ts data/scenarios/<run>.json");
  const run = JSON.parse(await readFile(path, "utf8")).runs.find((r: any) => r.scenario.id === "demo");
  if (!run) throw new Error(`No "demo" scenario in ${path}`);
  const fixture = JSON.parse(await readFile(FIXTURE, "utf8"));

  const docs = run.documents as any[];
  const allGreen = (c: any) => c.items.length > 0 && c.items.every((i: any) => i.pass);
  if (!docs.every((d) => allGreen(d.finalCheck))) throw new Error("A demo document never reached all green; rerun try-scenarios");
  // The red demo moment: prefer a document with exactly one red item on first check.
  const reds = docs.filter((d) => d.firstCheck.items.some((i: any) => !i.pass));
  const red = reds.find((d) => d.firstCheck.items.filter((i: any) => !i.pass).length === 1) ?? reds[0];
  if (!red) throw new Error("Every demo draft passed first time, so there is no red item to show; rerun try-scenarios");

  const byType = new Map(docs.map((d) => [d.type as DocumentType, d]));
  fixture.description = run.scenario.description;
  fixture.profile = EventProfile.parse(run.profile);
  fixture.classification = run.classification;
  fixture.documents = (run.requirements as any[]).map((r) => {
    const t = r.documentType as DocumentType;
    const d = byType.get(t);
    if (!DRAFTED_TYPES.has(t) || !d)
      return { id: idOf(t), documentType: t, status: "manual", content: null, checkResults: null, checklistSource: null };
    const isRed = d === red;
    return {
      id: idOf(t), documentType: t, status: isRed ? "needs_fix" : "ready",
      content: isRed ? d.draft : d.final, checkResults: isRed ? d.firstCheck : d.finalCheck, checklistSource: d.checklistSource,
    };
  });
  fixture.fixedDocument = {
    id: idOf(red.type), documentType: red.type, status: "ready", content: red.final, checkResults: red.finalCheck,
    checklistSource: red.checklistSource,
  };
  fixture._about = "Seeded demo event (fictional club and people; Hagley Park is real). Generated from a live run by scripts/refresh-fixture.ts, "
    + `models ${JSON.stringify((JSON.parse(await readFile(path, "utf8"))).models)}. MOCK=1 routes serve these pieces; DEMO_MODE=1 falls back to them `
    + "for this exact description only. Every key is validated by tests/contract.test.ts. Do not build logic, copy or UI around these details.";
  await writeFile(FIXTURE, JSON.stringify(fixture, null, 2) + "\n");
  console.log(`Wrote ${FIXTURE}: ${fixture.documents.length} documents, red item on ${red.type} (${red.firstCheck.items.filter((i: any) => !i.pass).map((i: any) => i.itemId).join(", ")}).`);
  console.log("Now run: npm run fixture && npm test");
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
