import { mkdir, writeFile } from "node:fs/promises";
import fixture from "../fixtures/demo-event.json";
import { classify } from "../lib/ai/classify";
import { draftDocument } from "../lib/ai/draft";
import { retrieve } from "../lib/ai/retrieve";
import { db } from "../lib/supabase/admin";
import { DRAFTED_TYPES, DraftDocument, EventProfile, type DocumentType } from "../lib/schemas";

async function main() {
  const profile = EventProfile.parse(fixture.profile);
  const { data: councils, error: councilError } = await db().from("councils").select("id").eq("slug", profile.councilSlug).single();
  if (councilError) throw councilError;
  const [templates, checklists, chunks] = await Promise.all([
    db().from("templates").select("document_type, sections").eq("council_id", councils.id),
    db().from("checklists").select("document_type, items").eq("council_id", councils.id).eq("verified", true),
    retrieve(profile.councilSlug, "special licence host responsibility"),
  ]);
  if (templates.error) throw templates.error;
  if (checklists.error) throw checklists.error;
  console.log("Retrieved chunks:", chunks.map((c) => ({ id: c.id, heading: c.heading })));

  const types = fixture.requirements.map((r) => r.documentType as DocumentType).filter((type) => DRAFTED_TYPES.has(type));
  const started = performance.now();
  const results = await Promise.allSettled(types.map(async (type) => {
    const template = templates.data.find((t) => t.document_type === type);
    const checklist = checklists.data.find((c) => c.document_type === type);
    if (!template?.sections?.length || !checklist?.items?.length) throw new Error(`No verified template/checklist for ${type}`);
    const start = performance.now();
    const draft = DraftDocument.parse(await draftDocument(profile, type, { sections: template.sections, checklist: checklist.items }));
    return { type, milliseconds: Math.round(performance.now() - start), draft, checklist: checklist.items };
  }));
  const drafts = results.flatMap((result, i) => {
    if (result.status === "fulfilled") return [result.value];
    console.error(`Draft ${types[i]} failed:`, result.reason);
    return [];
  });
  console.table(drafts.map((r) => ({ type: r.type, milliseconds: r.milliseconds, sections: r.draft.sections.length,
    placeholders: r.draft.placeholders.length, citations: r.draft.citedChunkIds.length })));
  console.log(`All drafts completed in ${Math.round(performance.now() - started)} ms`);

  const classification = await classify(profile);
  console.log("Classification:", classification.category, "citations:", classification.citedChunkIds);
  await mkdir("data/ai-live", { recursive: true });
  await writeFile("data/ai-live/ai-run.json", JSON.stringify({ classification, drafts }, null, 2));
  if (results.some((result) => result.status === "rejected") || classification.citedChunkIds.length === 0) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
