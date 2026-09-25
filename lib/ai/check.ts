import { CheckResult, DraftDocument } from "../schemas";
import { structured, MODEL_FAST } from "./client";
import { CHECK_SYSTEM, FIX_SYSTEM } from "./prompts";

/** Step 6. Every checklist item gets pass or fail with an evidence quote. */
export async function checkDocument(doc: DraftDocument, checklist: { id: string; text: string }[]) {
  return structured({
    schema: CheckResult, name: "check_result", model: MODEL_FAST, system: CHECK_SYSTEM,
    user: `Checklist:\n${checklist.map((c) => `- (${c.id}) ${c.text}`).join("\n")}\n\nDraft:\n${JSON.stringify(doc)}`,
  });
}

export async function applyFix(doc: DraftDocument, fix: string) {
  return structured({
    schema: DraftDocument, name: "draft_document", model: MODEL_FAST, system: FIX_SYSTEM,
    user: `Fix to apply:\n${fix}\n\nDocument:\n${JSON.stringify(doc)}`,
  });
}
