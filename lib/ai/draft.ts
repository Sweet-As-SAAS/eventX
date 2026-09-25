import { DraftDocument, type DocumentType, type EventProfile } from "../schemas";
import { structured, MODEL_STRONG, fence } from "./client";
import { DRAFT_SYSTEM } from "./prompts";
import { retrieve, chunksToText } from "./retrieve";

export interface TemplateAndChecklist {
  sections: string[];
  checklist: { id: string; text: string }[];
}

/** Step 5. One call per document; the UI fires one request per document so they draft in parallel. */
export async function draftDocument(profile: EventProfile, type: DocumentType, t: TemplateAndChecklist) {
  const chunks = await retrieve(profile.councilSlug, `${type.replaceAll("_", " ")} requirements template`);
  return structured({
    schema: DraftDocument, name: "draft_document", model: MODEL_STRONG, system: DRAFT_SYSTEM,
    user: [
      `Document type: ${type}`,
      `Event profile:\n${JSON.stringify(profile)}`,
      `Template sections, in order:\n${t.sections.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
      `Checklist the draft must satisfy:\n${t.checklist.map((c) => `- (${c.id}) ${c.text}`).join("\n")}`,
      fence("council", chunksToText(chunks)),
    ].join("\n\n"),
  });
}
