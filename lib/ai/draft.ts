import { DraftDocument, type DocumentType, type EventProfile } from "../schemas";
import { structured, fence } from "./client";
import { DRAFT_SYSTEM, DRAFT_REVIEW_SYSTEM } from "./prompts";
import { retrieve, chunksToText } from "./retrieve";
import { fillPeople } from "../people";

export interface TemplateAndChecklist {
  sections: string[];
  checklist: { id: string; text: string }[];
}

/** Names the organiser gave us: the event, the venue and their people. Anything else becomes a [PLACEHOLDER]. */
export const allowedNames = (p: EventProfile) =>
  [p.name.value, p.venue.name.value, p.people.organiser.value, p.people.dutyManager.value, p.people.security.value,
    p.people.foodProvider.value, p.people.wasteCollector.value].filter((v): v is string => !!v);

/** "The menus are attached." -> "The menus will be attached to the application." HostReady holds no files. */
export const honestAttachments = (text: string) =>
  text.replace(/\b(?:is|are|has been|have been)\s+(?:also\s+)?attached\b/giu, "will be attached to the application");

/** Event-specific claims the profile cannot support, even when a council source is cited. */
export function unsupportedDraftFacts(draft: DraftDocument, profile: EventProfile, sourceText = ""): string[] {
  const body = draft.sections.map((section) => section.body).join("\n");
  const issues: string[] = [];
  if (/\b(?:no existing|no current|not currently|not already)\b[^.\n]{0,90}\blicen[cs](?:e|ed)\b|\blicen[cs]e\s+(?:is|was)\s+not\s+(?:currently\s+)?held/iu.test(body)) {
    issues.push("Existing licence status is unknown; remove any claim that the venue has no licence.");
  }
  // HostReady holds no files, so a draft can never say something is already attached.
  if (/\b(?:is|are|has been|have been)\s+(?:also\s+)?attached\b|\battached\s+(?:is|are)\b/iu.test(body)) {
    issues.push("Nothing is attached yet; replace claims that a file is attached with a descriptive [ATTACH ...] placeholder.");
  }
  if (/\b(?:supervised|restricted)\s+designation\b/iu.test(body)) {
    issues.push("The alcohol-area legal designation is unknown; use [ALCOHOL AREA DESIGNATION].");
  }
  const firstWord = profile.name.value?.match(/^[\p{Lu}][\p{L}\p{N}-]{3,}/u)?.[0];
  if (firstWord && !["Event", "Fundraiser", "Community"].includes(firstWord)) {
    const escaped = firstWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const properName = new RegExp(`\\b${escaped}(?:\\s+[\\p{Lu}][\\p{L}\\p{N}-]*){1,5}`, "gu");
    const allowed = allowedNames(profile);
    for (const match of body.matchAll(properName)) {
      const phrase = match[0];
      if (!allowed.some((name) => phrase === name || name?.startsWith(`${phrase} `)) && !sourceText.includes(phrase)) {
        issues.push(`Unsupported event-specific name: "${phrase}". Use the exact profile name or a placeholder.`);
      }
    }
  }
  return [...new Set(issues)];
}

/** Step 5. One call per document; the UI fires one request per document so they draft in parallel. */
export async function draftDocument(profile: EventProfile, type: DocumentType, t: TemplateAndChecklist) {
  const chunks = await retrieve(profile.councilSlug, `${type.replaceAll("_", " ")} requirements template`);
  const draft = await structured({
    schema: DraftDocument, name: "draft_document", model: "strong", system: DRAFT_SYSTEM,
    user: [
      `Document type: ${type}`,
      `Event profile:\n${JSON.stringify(profile)}`,
      `Template sections, in order:\n${t.sections.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
      `Checklist the draft must satisfy:\n${t.checklist.map((c) => `- (${c.id}) ${c.text}`).join("\n")}`,
      fence("council", chunksToText(chunks)),
    ].join("\n\n"),
  });
  const sourceText = chunksToText(chunks);
  let reviewed = draft;
  for (let attempt = 0; attempt < 2; attempt++) {
    const issues = unsupportedDraftFacts(reviewed, profile, sourceText);
    reviewed = await structured({
      schema: DraftDocument, name: "reviewed_draft_document", model: "strong", system: DRAFT_REVIEW_SYSTEM,
      user: [
        `Event profile:\n${JSON.stringify(profile)}`,
        `Allowed event-specific proper names: ${JSON.stringify(allowedNames(profile))}`,
        `Template sections:\n${t.sections.join("\n")}`,
        `Checklist:\n${t.checklist.map((c) => `- (${c.id}) ${c.text}`).join("\n")}`,
        fence("council", chunksToText(chunks)),
        issues.length ? `Unsupported claims to remove:\n${issues.join("\n")}` : "Check all event-specific claims for support.",
        `Draft to review:\n${JSON.stringify(reviewed)}`,
      ].join("\n\n"),
    });
    if (!unsupportedDraftFacts(reviewed, profile, sourceText).length) break;
  }
  // Nothing is attached yet: turn "menus are attached" into a true statement rather than failing the whole draft.
  reviewed = { ...reviewed, sections: reviewed.sections.map((s) => ({ ...s, body: honestAttachments(s.body) })) };
  if (unsupportedDraftFacts(reviewed, profile, sourceText).length) throw new Error("Draft still contains unsupported event facts");
  const allowedIds = new Set(chunks.map((c) => c.id));
  if (reviewed.citedChunkIds.some((id) => !allowedIds.has(id))) throw new Error("Draft cited a chunk outside its council references");
  const sections = reviewed.sections.map((s) => ({ ...s, body: fillPeople(s.body, profile.people) }));
  const placeholders = [...new Set(sections.flatMap((section) => section.body.match(/\[[^\[\]\n]+\]/g) ?? []))];
  return DraftDocument.parse({ ...reviewed, sections, documentType: type, placeholders });
}
