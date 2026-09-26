import { DraftDocument, type DocumentType, type EventProfile } from "../schemas";
import { structured, MODEL_STRONG, fence } from "./client";
import { DRAFT_SYSTEM } from "./prompts";
import { retrieve, chunksToText } from "./retrieve";
import { normalizeDraft, splitChecklist, REGISTER_TYPES } from "./guards";
import { rangeNotes } from "./profile";
import { computeDeadlines, nzToday } from "../deadlines";

export interface TemplateAndChecklist {
  sections: string[];
  checklist: { id: string; text: string }[];
}

const list = (items: { id: string; text: string }[]) => items.map((c) => `- (${c.id}) ${c.text}`).join("\n");

/** This document's lodgement dates from the deadline engine (lib/deadlines), so the draft never works out its own. */
export function keyDates(profile: EventProfile, type: DocumentType, today = nzToday()): string {
  const date = profile.date.value;
  if (!date) return "";
  return computeDeadlines(date, [{ documentType: type, reason: "", ruleId: "", sourceUrl: "", lastChecked: null }])
    .map((d) => [
      `- ${d.label}: ${d.legalMinimum ? `no later than ${d.legalMinimum} (legal minimum), ` : ""}recommended by ${d.recommended}. ${d.basis}`,
      d.legalMinimum && d.legalMinimum < today ? `  Today is ${today}, so this is already past the legal minimum: lodging late needs a letter explaining why.` : "",
    ].filter(Boolean).join("\n"))
    .join("\n");
}

/** Step 5. One call per document; the UI fires one request per document so they draft in parallel. */
export async function draftDocument(profile: EventProfile, type: DocumentType, t: TemplateAndChecklist) {
  const chunks = await retrieve(profile.councilSlug, `${type.replaceAll("_", " ")} requirements template`);
  const { applicable, notApplicable } = splitChecklist(t.checklist, profile);
  const ranges = rangeNotes(profile);
  const dates = keyDates(profile, type);
  const raw = await structured({
    schema: DraftDocument, name: "draft_document", model: MODEL_STRONG, system: DRAFT_SYSTEM,
    user: [
      `Document type: ${type}`,
      `Event profile:\n${JSON.stringify(profile)}`,
      ranges.length ? `Answers given as ranges, not exact numbers:\n${ranges.map((r) => `- ${r}`).join("\n")}` : "",
      dates ? `Key dates from HostReady's deadline engine. Use these exact dates; never work out your own:\n${dates}` : "",
      REGISTER_TYPES.has(type)
        ? `This document is a register. Write one section per activity or hazard this event actually has, headed by the activity. In each section body, cover these columns in order, one line each, starting with the column name (e.g. "Hazards: burns, fire"):\n${t.sections.map((s) => `- ${s}`).join("\n")}`
        : `Template sections, in order:\n${t.sections.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
      `Checklist the draft must satisfy:\n${list(applicable)}`,
      notApplicable.length
        ? `Checklist items that do not apply because of this event's expected crowd size. Do not plan for them. Where a template section exists only for them, say in one sentence that it is not required for an event of this size:\n${list(notApplicable)}`
        : "",
      fence("council", chunksToText(chunks)),
    ].filter(Boolean).join("\n\n"),
  });
  return normalizeDraft(raw, { type, sections: t.sections, chunkIds: chunks.map((c) => c.id) });
}
