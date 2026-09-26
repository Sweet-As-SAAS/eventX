import { CheckResult, DraftDocument } from "../schemas";
import { structured, MODEL_FAST, MODEL_STRONG } from "./client";
import { CHECK_SYSTEM, FIX_SYSTEM } from "./prompts";

/** Keep model-generated fixes from assigning a real-sounding person or organisation nobody supplied. */
export function unprovidedProperNames(candidate: string, knownText: string): string[] {
  const withoutPlaceholders = candidate.replace(/\[[^\[\]\n]+\]/g, "");
  const names = withoutPlaceholders.match(/\b[A-Z][a-z]{2,}(?:[-'][A-Z][a-z]+)?\s+[A-Z][a-z]{2,}\b/g) ?? [];
  return [...new Set(names.filter((name) => !knownText.includes(name)))];
}

export function safeSuggestedFix(candidate: string | null | undefined, knownText: string): string | null {
  if (!candidate) return null;
  let result = candidate;
  for (const name of unprovidedProperNames(candidate, knownText)) result = result.replaceAll(name, "[NAME TO CONFIRM]");
  return result;
}

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
      suggestedFix: pass ? null : safeSuggestedFix(checked?.suggestedFix, body) };
  }) });
}

/** `supplied` is text the organiser typed themselves, so names in it are theirs, not invented. */
export async function applyFix(doc: DraftDocument, fix: string, supplied = "") {
  const result = await structured({
    schema: DraftDocument, name: "draft_document", model: MODEL_FAST, system: FIX_SYSTEM,
    user: `Fix to apply:\n${fix}\n\nDocument:\n${JSON.stringify(doc)}`,
  });
  const placeholders = [...new Set(result.sections.flatMap((section) =>
    section.body.match(/\[[^\[\]\n]+\]/g) ?? []))];
  const originalBody = doc.sections.map((section) => section.body).join("\n");
  const newBody = result.sections.map((section) => section.body).join("\n");
  if (unprovidedProperNames(newBody, `${originalBody}\n${supplied}`).length) {
    throw new Error("Fix introduced an unsupported proper name");
  }
  return DraftDocument.parse({ ...result, documentType: doc.documentType,
    citedChunkIds: doc.citedChunkIds, placeholders });
}
