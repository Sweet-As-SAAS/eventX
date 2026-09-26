// Deterministic checks on every AI output, applied after the schema parse. The schema guarantees shape;
// these guarantee the facts line up: missing is exactly the unknown fields, placeholders are the ones in the
// text, citations are chunks we actually sent, and a checklist "pass" quotes the draft for real.
// No OpenAI import here, so tests/ai-guards.test.ts runs without a key.
import {
  EventProfile, type CheckResult, type Classification, type CouncilSlug, type DocumentType, type DraftDocument,
} from "../schemas";

// ---------- Profile ----------

type Field = { value: unknown; source: "stated" | "inferred" | "answered" | null };
const isField = (x: unknown): x is Field => !!x && typeof x === "object" && "value" in x && "source" in x;

/** Every `{ value, source }` field in a profile with its dot path, in schema order. */
export function profileFields(profile: object, prefix = ""): { path: string; field: Field }[] {
  return Object.entries(profile).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    if (isField(v)) return [{ path, field: v }];
    if (v && typeof v === "object" && !Array.isArray(v)) return profileFields(v, path);
    return [];
  });
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const COUNTS = new Set(["peakAttendance", "food.stalls", "structures.marquees", "structures.largestMarqueeSqm"]);

const realDate = (s: string) => DATE.test(s) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const SPECIFIC_DAY = new RegExp([
  "\\b(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?\\b", // Saturday, this Sunday, next Fri
  `\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\b`, // 13 February, 1st of March
  `\\b${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, // February 13
  "\\b\\d{1,2}[/.-]\\d{1,2}(?:[/.-]\\d{2,4})?\\b", // 13/2, 13.02.2027
  "\\b\\d{4}-\\d{2}-\\d{2}\\b", "\\b(?:today|tomorrow|tonight|new year'?s (?:day|eve)|christmas (?:day|eve)|boxing day|waitangi day|anzac day)\\b",
].join("|"), "i");

/** True if the description names an actual day. "Sometime next month" or "in March" does not. */
export const namesSpecificDay = (description: string) => SPECIFIC_DAY.test(description);

/**
 * Makes an AI profile internally consistent:
 * - a date is kept only if the description names an actual day: "sometime next month" is asked, never guessed
 * - malformed dates and times, and negative counts, become unknown
 * - a date in the past rolls forward a year when the description never states a year ("Sunday 14 March")
 * - unknown fields have source null; known fields the model left untagged or tagged "answered" become "inferred"
 *   ("answered" is reserved for the organiser's tap answers)
 * - missing is recomputed as exactly the unknown fields, in schema order
 */
export function normalizeProfile(raw: EventProfile, ctx: { council: CouncilSlug; today: string; description: string }): EventProfile {
  const p: EventProfile = structuredClone({ ...raw, councilSlug: ctx.council });

  const date = p.date.value;
  if (date != null && (!realDate(date) || !namesSpecificDay(ctx.description))) p.date.value = null;
  else if (date != null && date < ctx.today && !/\b(19|20)\d{2}\b/.test(ctx.description)) {
    const next = `${Number(date.slice(0, 4)) + 1}${date.slice(4)}`;
    p.date.value = realDate(next) ? next : null; // 29 Feb has no next-year twin: ask instead of guessing
  }
  for (const t of [p.startTime, p.endTime]) if (t.value != null && !TIME.test(t.value)) t.value = null;

  const missing: string[] = [];
  for (const { path, field } of profileFields(p)) {
    if (COUNTS.has(path) && typeof field.value === "number" && field.value < 0) field.value = null;
    if (field.value == null) {
      field.value = null;
      field.source = null;
      missing.push(path);
    } else if (field.source == null || field.source === "answered") {
      field.source = "inferred";
    }
  }
  p.missing = missing;
  return EventProfile.parse(p);
}

// ---------- Drafts ----------

/** Placeholders are square brackets starting with a capital: [DUTY MANAGER NAME]. "[chunk 12]" is not one. */
const PLACEHOLDER = /\[[A-Z][^[\]\n]*\]/g;

const docText = (d: DraftDocument) => [d.title, ...d.sections.flatMap((s) => [s.heading, s.body])].join("\n");

/** Every placeholder in the document text, first-seen order, no duplicates. */
export const extractPlaceholders = (d: DraftDocument) => [...new Set(docText(d).match(PLACEHOLDER) ?? [])];

// "[chunk 44fd807e-…]" or "(as per chunk 2db1…)" in text a volunteer or the council reads. Ids need a digit, so
// ordinary prose ("a chunk of the park") survives. Spaces are tidied, line breaks kept (registers are line-based).
const CHUNK_REF = /,?[ \t]*\(?(?:as (?:per|stated in|shown in) |see |per |from |in )?\[?chunk (?=[\w-]*\d)[\w-]+\]?\)?/gi;

/** Chunk ids belong in citedChunkIds, never in document or reasoning text. */
export const stripChunkRefs = (s: string) =>
  s.replace(CHUNK_REF, "").replace(/[ \t]+([.,])/g, "$1").replace(/[ \t]{2,}/g, " ").trim();

const cleanSections = (sections: DraftDocument["sections"]) =>
  sections.map((s) => ({ heading: stripChunkRefs(s.heading), body: stripChunkRefs(s.body) }));

const keepCited = (ids: string[], allowed: Iterable<string>) => {
  const ok = new Set([...allowed].map(String));
  return [...new Set(ids.map(String))].filter((id) => ok.has(id));
};

const headingKey = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const sameHeading = (a: string, b: string) => {
  const [x, y] = [headingKey(a), headingKey(b)];
  return x === y || (x.length > 3 && y.length > 3 && (x.includes(y) || y.includes(x)));
};

/**
 * Registers are tables: their template "sections" are the columns of each row (Activity, Hazards, Controls...).
 * The draft has one section per row, headed by the activity, with every column inside its body.
 */
export const REGISTER_TYPES: ReadonlySet<DocumentType> = new Set<DocumentType>(["hazard_register"]);

/**
 * A fresh draft: forced to the requested type, every template section present (a missing one is added as a
 * placeholder so the checker flags it; registers are exempt, see REGISTER_TYPES), placeholders read from the
 * text, citations limited to chunks we sent and never left inline in the text.
 */
export function normalizeDraft(raw: DraftDocument, ctx: { type: DocumentType; sections: string[]; chunkIds: Iterable<string> }): DraftDocument {
  const sections = cleanSections(raw.sections).filter((s) => s.heading || s.body);
  if (!REGISTER_TYPES.has(ctx.type))
    for (const heading of ctx.sections)
      if (!sections.some((s) => sameHeading(s.heading, heading)))
        sections.push({ heading, body: `[TO COMPLETE: ${heading}]` });
  const doc = { ...raw, documentType: ctx.type, sections };
  return { ...doc, placeholders: extractPlaceholders(doc), citedChunkIds: keepCited(raw.citedChunkIds, ctx.chunkIds) };
}

/**
 * Applies a one-section fix edit: replaces the body of the section with that heading, or adds it as a new section.
 * Every other section is untouched by construction. If the edit changes nothing, the suggested fix text (written by
 * the checker to be addable as-is) is appended to the last section, so a click on "Fix" always changes the draft.
 * Our own default fix is an instruction, not document text: it is never pasted in, and never survives in an edit.
 */
export function mergeFix(doc: DraftDocument, rawEdit: { heading: string; body: string }, fix: string): DraftDocument {
  const [edit] = cleanSections([{ ...rawEdit, body: rawEdit.body.replace(DEFAULT_FIX_LINE, "") }]);
  const i = doc.sections.findIndex((s) => sameHeading(s.heading, edit.heading));
  let sections = doc.sections.map((s) => ({ ...s }));
  if (i >= 0 && edit.body.trim()) sections[i].body = edit.body.trim();
  else if (i < 0 && edit.body.trim()) sections.push({ heading: edit.heading.trim() || "Additional information", body: edit.body.trim() });
  if (docText({ ...doc, sections }) === docText(doc) && !fix.startsWith(DEFAULT_FIX_PREFIX)) {
    sections = doc.sections.map((s) => ({ ...s }));
    const last = sections.at(-1);
    if (last) last.body = `${last.body.trim()}\n${fix.trim()}`;
    else sections.push({ heading: "Additional information", body: fix.trim() });
  }
  const out = { ...doc, sections };
  return { ...out, placeholders: extractPlaceholders(out) };
}

// ---------- Checklist applicability ----------

// Council checklists scope some items by crowd size in their own words. Each pattern captures the number.
const SIZE_SCOPES: { re: RegExp; applies: (peak: number, n: number) => boolean }[] = [
  { re: /about ([\d,]+) (?:attendees|people|guests|patrons) or more/i, applies: (p, n) => p >= n },
  { re: /(?:more than|over) ([\d,]+) (?:attendees|people|guests|patrons)/i, applies: (p, n) => p > n },
];

/** False only when the item is scoped by crowd size and the known peak attendance is outside it. Unknown size: applies. */
export function itemApplies(text: string, peakAttendance: number | null | undefined): boolean {
  if (peakAttendance == null) return true;
  for (const { re, applies } of SIZE_SCOPES) {
    const m = text.match(re);
    if (m) return applies(peakAttendance, Number(m[1].replaceAll(",", "")));
  }
  return true;
}

/** Splits a checklist into the items this event must satisfy and the ones its size rules out. */
export function splitChecklist<T extends { text: string }>(checklist: T[], profile: EventProfile | null | undefined) {
  const peak = profile?.peakAttendance.value;
  return {
    applicable: checklist.filter((c) => itemApplies(c.text, peak)),
    notApplicable: checklist.filter((c) => !itemApplies(c.text, peak)),
  };
}

// ---------- Checks ----------

const squash = (s: string) =>
  s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();

/**
 * True if the evidence is really in the draft. It is split at ellipses, line breaks and punctuation, and every
 * piece must appear verbatim: "each row..." items quote one line per row, and list items are quoted without the
 * items between them ("Attach: Alcohol Management Plan" from "Attach: site plan, Alcohol Management Plan, menus").
 * At least one piece must have two or more words, so a quote cannot be stitched from single common words.
 */
export function quoteInDraft(evidence: string, doc: DraftDocument): boolean {
  const text = squash(docText(doc));
  const parts = evidence.split(/\.\.\.|…|\n|[,;:.()]/).map((p) => squash(p).replace(/^["']+|["']+$/g, "").trim()).filter(Boolean);
  return parts.some((p) => p.includes(" ")) && parts.every((p) => text.includes(p));
}

const DEFAULT_FIX_PREFIX = "Add a sentence that covers:";
const DEFAULT_FIX_LINE = /^[ \t]*Add a sentence that covers:.*$\n?/gim;
/** Used when the checker gave no fix. An instruction for the fix model, never document text (see mergeFix). */
export const defaultFix = (itemText: string) => `${DEFAULT_FIX_PREFIX} ${itemText.replace(/\.$/, "")}.`;

/**
 * One result per checklist item, in checklist order, with the checklist's own text. A pass stands only if its
 * evidence is quoted from the draft and is more than placeholders. Evidence that contains a placeholder can still
 * pass ("Duty manager [NAME] runs the bar" documents the role; names are never invented, so they stay open):
 * whether an item needs the missing detail is the model's call (CHECK_SYSTEM). Every failure carries a fix, so
 * "Fix" always has something to apply and the document can reach green.
 */
export function normalizeCheck(raw: CheckResult, checklist: { id: string; text: string }[], doc: DraftDocument): CheckResult {
  return {
    items: checklist.map((c) => {
      const m = raw.items.find((i) => i.itemId === c.id);
      const evidence = m?.evidence.trim() ?? "";
      const substance = /[a-z0-9]/i.test(evidence.replace(PLACEHOLDER, ""));
      const pass = !!m?.pass && substance && quoteInDraft(evidence, doc);
      return pass
        ? { itemId: c.id, text: c.text, pass, evidence, suggestedFix: null }
        : { itemId: c.id, text: c.text, pass, evidence: "", suggestedFix: m?.suggestedFix?.trim() || defaultFix(c.text) };
    }),
  };
}

// ---------- Classification ----------

export const UNCLEAR: Classification = {
  category: "unclear",
  reasoning: "The council information we hold does not settle whether this event is community or commercial. Check with the council before you apply.",
  howToPresent: null,
  citedChunkIds: [],
};

const MONEY = /\$\s?\d[\d,]*(?:\.\d{1,2})?/g;
const money = (s: string) => s.replace(/[\s,$]/g, "").replace(/\.0+$/, "");
export const FEES_VARY = "Fees vary, check with the council.";

/** Removes every sentence that states a dollar amount the cited council text does not contain. */
export function dropUnsourcedFees(text: string, sourceText: string): { text: string; dropped: boolean } {
  const known = new Set((sourceText.match(MONEY) ?? []).map(money));
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((s) => (s.match(MONEY) ?? []).every((m) => known.has(money(m))));
  return { text: kept.join(" ").trim(), dropped: kept.length < sentences.length };
}

/**
 * Citations limited to chunks we sent. A verdict with no real citation is not grounded, so it becomes "unclear".
 * A fee is only stated if a cited chunk states it; otherwise the sentence goes and "fees vary" is said instead.
 */
export function normalizeClassification(raw: Classification, chunks: { id: string; content: string }[]): Classification {
  const citedChunkIds = keepCited(raw.citedChunkIds, chunks.map((c) => c.id));
  if (raw.category !== "unclear" && citedChunkIds.length === 0) return UNCLEAR;
  const sources = chunks.filter((c) => citedChunkIds.includes(String(c.id))).map((c) => c.content).join("\n");
  const reasoning = dropUnsourcedFees(stripChunkRefs(raw.reasoning), sources);
  const howToPresent = raw.howToPresent == null ? null : dropUnsourcedFees(stripChunkRefs(raw.howToPresent), sources);
  return {
    ...raw,
    reasoning: reasoning.dropped || howToPresent?.dropped ? `${reasoning.text} ${FEES_VARY}`.trim() : reasoning.text,
    howToPresent: howToPresent ? howToPresent.text || null : null,
    citedChunkIds,
  };
}
