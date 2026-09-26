import { z } from "zod";
import { CheckResult, DraftDocument } from "../schemas";
import { structured } from "./client";
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

// What the model returns: every field required (structured outputs), alternatives [] when the item passes.
const CheckResultAI = z.object({ items: z.array(z.object({
  itemId: z.string(), text: z.string(), pass: z.boolean(), evidence: z.string(), suggestedFix: z.string().nullable(), alternatives: z.array(z.string()),
})) });

/** Step 6. Every checklist item gets pass or fail with an evidence quote. */
export async function checkDocument(doc: DraftDocument, checklist: { id: string; text: string }[]) {
  const result = await structured({
    schema: CheckResultAI, name: "check_result", model: "fast", system: CHECK_SYSTEM,
    user: `Checklist:\n${checklist.map((c) => `- (${c.id}) ${c.text}`).join("\n")}\n\nDraft:\n${JSON.stringify(doc)}`,
  });
  const body = doc.sections.map((section) => section.body).join("\n");
  return CheckResult.parse({ items: checklist.map((item) => {
    const checked = result.items.find((candidate) => candidate.itemId === item.id);
    const evidence = checked?.evidence.trim().replace(/^["'“”]+|["'“”]+$/g, "") ?? "";
    const pass = !!checked?.pass && !!evidence && body.includes(evidence) && !/\[[^\[\]\n]+\]/.test(evidence);
    return { itemId: item.id, text: item.text, pass, evidence: pass ? evidence : "",
      suggestedFix: pass ? null : safeSuggestedFix(checked?.suggestedFix, body),
      alternatives: pass ? [] : (checked?.alternatives ?? []).slice(0, 2).map((a) => safeSuggestedFix(a, body)).filter((a): a is string => !!a) };
  }) });
}

/** Put the organiser's own wording in the most relevant existing template section. */
export function insertOrganiserText(doc: DraftDocument, checklistItem: string, supplied: string): DraftDocument {
  if (doc.sections.some((section) => section.body.includes(supplied))) return doc;
  const words = new Set(checklistItem.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  let sectionIndex = 0;
  let bestScore = -1;
  doc.sections.forEach((section, index) => {
    const score = (section.heading.toLowerCase().match(/[a-z]{4,}/g) ?? [])
      .filter((word) => words.has(word)).length;
    if (score > bestScore) { bestScore = score; sectionIndex = index; }
  });
  const sections = doc.sections.map((section, index) => index === sectionIndex
    ? { ...section, body: [section.body.trimEnd(), supplied].filter(Boolean).join("\n\n") }
    : section);
  return DraftDocument.parse({ ...doc, sections,
    placeholders: [...new Set(sections.flatMap((section) => section.body.match(/\[[^\[\]\n]+\]/g) ?? []))] });
}

/** Use AI for a suggested fix; insert an organiser's own answer exactly as written. */
export async function applyFix(doc: DraftDocument, fix: string, supplied = "", checklistItem = "") {
  if (supplied) return insertOrganiserText(doc, checklistItem, supplied);
  const result = await structured({
    schema: DraftDocument, name: "draft_document", model: "fast", system: FIX_SYSTEM,
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
