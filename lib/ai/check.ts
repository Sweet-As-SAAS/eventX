import { z } from "zod";
import { CheckResult, DraftDocument, type EventProfile } from "../schemas";
import { structured, MODEL_FAST } from "./client";
import { CHECK_SYSTEM, FIX_SYSTEM } from "./prompts";
import { normalizeCheck, mergeFix, splitChecklist, quoteInDraft } from "./guards";

/**
 * Step 6. Every checklist item gets pass or fail with an evidence quote that must really be in the draft.
 * Pass the event profile so items scoped to other crowd sizes ("events of about 1000 attendees or more") are skipped.
 */
export async function checkDocument(doc: DraftDocument, fullChecklist: { id: string; text: string }[], profile?: EventProfile | null) {
  const checklist = splitChecklist(fullChecklist, profile).applicable;
  const ask = (items: { id: string; text: string }[], note = "") => structured({
    schema: CheckResult, name: "check_result", model: MODEL_FAST, system: CHECK_SYSTEM,
    user: `${note}Checklist:\n${items.map((c) => `- (${c.id}) ${c.text}`).join("\n")}\n\nDraft:\n${JSON.stringify(doc)}`,
  });
  const raw = await ask(checklist);
  const replace = (fresh: CheckResult) => {
    raw.items = [...raw.items.filter((i) => !fresh.items.some((f) => f.itemId === i.itemId)), ...fresh.items];
  };
  // Long checklists (the special licence has 20 items) sometimes come back with the last few skipped.
  // Ask again for just those, so every item gets a real verdict instead of a default fail.
  const skipped = checklist.filter((c) => !raw.items.some((i) => i.itemId === c.id));
  if (skipped.length) replace(await ask(skipped));
  // A pass whose quote cannot be found in the draft would be failed by the guard. Give the checker one chance to
  // quote exactly, so a real pass is not shown red; a pass it still cannot evidence stays failed.
  const unverified = checklist.filter((c) => {
    const m = raw.items.find((i) => i.itemId === c.id);
    return m?.pass && !quoteInDraft(m.evidence, doc);
  });
  if (unverified.length)
    replace(await ask(unverified, "Your previous quotes for these items were not found in the draft. Quote one short passage exactly as it is written, character for character.\n\n"));
  return normalizeCheck(raw, checklist, doc);
}

// Internal to the fix step, not part of the API contract: the model returns only the section it changes,
// and mergeFix puts it back, so a fix can never drop or rewrite the rest of the document.
const FixEdit = z.object({
  heading: z.string().describe("Exact heading of the section to change, or the heading of a new section"),
  body: z.string().describe("The complete new body of that section"),
});

/** Applies one suggested fix. Type, title, citations and every other section are kept by construction. */
export async function applyFix(doc: DraftDocument, fix: string): Promise<DraftDocument> {
  const edit = await structured({
    schema: FixEdit, name: "fix_edit", model: MODEL_FAST, system: FIX_SYSTEM,
    user: `Fix to apply:\n${fix}\n\nDocument:\n${JSON.stringify(doc)}`,
  });
  return mergeFix(doc, edit, fix);
}
