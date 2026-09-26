import { CheckResult, DraftDocument } from "../schemas";
import { structured, MODEL_FAST, MODEL_STRONG } from "./client";
import { CHECK_SYSTEM, FIX_SYSTEM } from "./prompts";

/** Step 6. Every checklist item gets pass or fail with an evidence quote. */
export async function checkDocument(doc: DraftDocument, checklist: { id: string; text: string }[]) {
  const result = await structured({
    schema: CheckResult, name: "check_result", model: MODEL_STRONG, system: CHECK_SYSTEM,
    user: `Checklist:\n${checklist.map((c) => `- (${c.id}) ${c.text}`).join("\n")}\n\nDraft:\n${JSON.stringify(doc)}`,
  });
  const body = doc.sections.map((section) => section.body).join("\n");
  return CheckResult.parse({ items: checklist.map((item) => {
    const checked = result.items.find((candidate) => candidate.itemId === item.id);
    const evidence = checked?.evidence.trim().replace(/^["'“”]+|["'“”]+$/g, "") ?? "";
    const pass = !!checked?.pass && !!evidence && body.includes(evidence) && !/\[[^\[\]\n]+\]/.test(evidence);
    return { itemId: item.id, text: item.text, pass, evidence: pass ? evidence : "",
      suggestedFix: pass ? null : checked?.suggestedFix ?? null };
  }) });
}

export async function applyFix(doc: DraftDocument, fix: string) {
  const result = await structured({
    schema: DraftDocument, name: "draft_document", model: MODEL_FAST, system: FIX_SYSTEM,
    user: `Fix to apply:\n${fix}\n\nDocument:\n${JSON.stringify(doc)}`,
  });
  const placeholders = [...new Set(result.sections.flatMap((section) =>
    section.body.match(/\[[^\[\]\n]+\]/g) ?? []))];
  return DraftDocument.parse({ ...result, documentType: doc.documentType,
    citedChunkIds: doc.citedChunkIds, placeholders });
}
