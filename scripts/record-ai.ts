import { mkdir, writeFile } from "node:fs/promises";
import fixture from "../fixtures/demo-event.json";
import { buildProfile } from "../lib/ai/profile";
import { classify } from "../lib/ai/classify";
import { draftDocument } from "../lib/ai/draft";
import { checkDocument } from "../lib/ai/check";
import { db } from "../lib/supabase/admin";
import { DRAFTED_TYPES, EventProfile, type DocumentType } from "../lib/schemas";

const COUNT = 10;

async function collect<T>(label: string, run: (index: number) => Promise<T>): Promise<T[]> {
  const outputs: T[] = [];
  for (let offset = 0; offset < COUNT; offset += 3) {
    const batch = await Promise.all(Array.from({ length: Math.min(3, COUNT - offset) }, (_, i) => run(offset + i)));
    outputs.push(...batch);
    console.log(`${label}: ${outputs.length}/${COUNT}`);
  }
  return outputs;
}

async function main() {
  const profile = EventProfile.parse(fixture.profile);
  const { data: council, error: councilError } = await db().from("councils").select("id").eq("slug", profile.councilSlug).single();
  if (councilError) throw councilError;
  const [templates, checklists] = await Promise.all([
    db().from("templates").select("document_type, sections").eq("council_id", council.id),
    db().from("checklists").select("document_type, items").eq("council_id", council.id).eq("verified", true),
  ]);
  if (templates.error) throw templates.error;
  if (checklists.error) throw checklists.error;
  const types = fixture.requirements.map((r) => r.documentType as DocumentType).filter((type) => DRAFTED_TYPES.has(type));
  if (!types.length) throw new Error("Fixture has no drafted types");

  const profiles = await collect("profiles", () => buildProfile(fixture.description, profile.councilSlug, "2026-09-26"));
  const classifications = await collect("classifications", () => classify(profile));
  const drafts = await collect("drafts", async (index) => {
    const type = types[index % types.length];
    const template = templates.data.find((row) => row.document_type === type);
    const checklist = checklists.data.find((row) => row.document_type === type);
    if (!template?.sections?.length || !checklist?.items?.length) throw new Error(`No verified template/checklist for ${type}`);
    return draftDocument(profile, type, { sections: template.sections, checklist: checklist.items });
  });
  const checks = await collect("checks", async (index) => {
    const draft = drafts[index];
    const checklist = checklists.data.find((row) => row.document_type === draft.documentType);
    if (!checklist?.items?.length) throw new Error(`No verified checklist for ${draft.documentType}`);
    return checkDocument(draft, checklist.items);
  });

  await mkdir("tests/fixtures", { recursive: true });
  await writeFile("tests/fixtures/ai-live.json", JSON.stringify({ recordedAt: new Date().toISOString(),
    models: { fast: process.env.OPENAI_MODEL_FAST, strong: process.env.OPENAI_MODEL_STRONG },
    profiles, classifications, drafts, checks }, null, 2) + "\n");
  console.log("Recorded 10 live responses per AI schema to tests/fixtures/ai-live.json");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
