// Lane A: live end-to-end run of every scenario in fixtures/test-scenarios.json through the whole AI pipeline,
// with a compliance check per PRD/TRD requirement. The app's own functions, the real CCC knowledge base, no mocks.
//
//   npx tsx --env-file=.env.local scripts/try-scenarios.ts                 all scenarios
//   npx tsx --env-file=.env.local scripts/try-scenarios.ts --only demo     one or more ids, comma-separated
//   npx tsx --env-file=.env.local scripts/try-scenarios.ts --judge         also score each draft with OPENAI_MODEL_JUDGE
//   OPENAI_MODEL_STRONG=gpt-4.1 OPENAI_MODEL_FAST=gpt-4.1-mini npx tsx ...  try other models (env wins over .env.local)
//
// Writes data/scenarios/<stamp>.json (gitignored): every profile, question, requirement, draft, check, fix and deadline.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import {
  DRAFTED_TYPES, EventProfile, type CheckResult, type Classification, type Deadline, type DocumentType, type DraftDocument,
  type FollowUpQuestion, type Requirement,
} from "../lib/schemas";
import { db } from "../lib/supabase/admin";
import { conditionPaths, requiredDocuments, staticRules } from "../lib/rules";
import { computeDeadlines } from "../lib/deadlines";
import { buildProfile, followUps, applyAnswers } from "../lib/ai/profile";
import { classify } from "../lib/ai/classify";
import { draftDocument, keyDates } from "../lib/ai/draft";
import { checkDocument, applyFix } from "../lib/ai/check";
import { profileFields, splitChecklist, extractPlaceholders, REGISTER_TYPES } from "../lib/ai/guards";
import { retrieve } from "../lib/ai/retrieve";
import { MODEL_FAST, MODEL_STRONG, structured } from "../lib/ai/client";

const TODAY = "2026-09-26";
// One "Fix" click per red item, plus two spare clicks per document, like an organiser working down the list.
const SPARE_FIX_CLICKS = 2;
const JUDGE_MODEL = process.env.OPENAI_MODEL_JUDGE ?? "gpt-5.5";

type Item = { id: string; text: string };
type Check = { id: string; requirement: string; pass: boolean; detail: string; warnOnly?: boolean };
type Scenario = {
  id: string; title: string; tests: string; council: "ccc"; description: string;
  answers: Record<string, string>; expect: { include: DocumentType[]; exclude: DocumentType[]; maxQuestions: number };
};

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
const judge = args.includes("--judge");
const secs = (ms: number) => Math.round(ms / 100) / 10;
const time = async <T>(fn: () => Promise<T>) => { const t = Date.now(); const v = await fn(); return { v, ms: Date.now() - t }; };
const docText = (d: DraftDocument) => [d.title, ...d.sections.flatMap((s) => [s.heading, s.body])].join("\n");
const numbers = (s: string) => new Set(s.match(/\d[\d,]*(?:\.\d+)?/g)?.map((n) => n.replace(/,/g, "")) ?? []);
const money = (s: string) => s.match(/\$\s?\d[\d,]*(?:\.\d+)?/g) ?? [];

// Test-only grader (not used by the app, so it lives here rather than lib/ai/prompts.ts).
const Grade = z.object({
  score: z.number().int().describe("1-10: how ready this is to lodge with the council after the organiser fills placeholders"),
  inventedFacts: z.array(z.string()).describe("Every name, date, number, fee, phone, place or rule stated as fact that is not in the profile or checklist"),
  issues: z.array(z.string()).describe("Concrete problems, most serious first. Empty if none"),
});
const JUDGE_SYSTEM = `You review council event paperwork drafted by an AI for a New Zealand event organiser.
Score strictly. Placeholders in [CAPITALS] are expected for details only the organiser knows and are not faults.
A fact is invented if it is stated as true but appears in neither the event profile nor the checklist. Generic good-practice controls (e.g. "fire extinguisher at each food truck") are proposals, not invented facts.`;

async function councilData() {
  const council = await db().from("councils").select("id").eq("slug", "ccc").single();
  if (council.error) throw new Error(`councils: ${council.error.message}`);
  const [t, c] = await Promise.all([
    db().from("templates").select("document_type, sections").eq("council_id", council.data.id),
    db().from("checklists").select("document_type, items, source_url, last_checked").eq("council_id", council.data.id).eq("verified", true),
  ]);
  if (t.error || c.error) throw new Error(t.error?.message ?? c.error?.message);
  return {
    sections: (type: DocumentType) => (t.data.find((r) => r.document_type === type)?.sections ?? []) as string[],
    checklist: (type: DocumentType) => (c.data.find((r) => r.document_type === type)?.items ?? []) as Item[],
    source: (type: DocumentType) => {
      const r = c.data.find((x) => x.document_type === type);
      return r ? { url: r.source_url as string, lastChecked: r.last_checked as string | null } : null;
    },
  };
}

async function runScenario(s: Scenario, kb: Awaited<ReturnType<typeof councilData>>) {
  const checks: Check[] = [];
  const add = (id: string, requirement: string, pass: boolean, detail = "", warnOnly = false) =>
    checks.push({ id, requirement, pass, detail, warnOnly });
  const log = (m: string) => console.log(`[${s.id}] ${m}`);

  // 1. Profile (F3), latency (NFR)
  const prof = await time(() => buildProfile(s.description, s.council, TODAY));
  const profile = prof.v;
  const nullPaths = profileFields(profile).filter((f) => f.field.value == null).map((f) => f.path);
  add("F3", "Profile parses, every field tagged, unknowns exactly in missing",
    EventProfile.safeParse(profile).success && JSON.stringify(nullPaths) === JSON.stringify(profile.missing),
    `missing: ${profile.missing.join(", ") || "none"}`);
  add("NFR-profile", "Profile under 10 s", prof.ms < 10_000, `${secs(prof.ms)} s`);
  log(`profile ${secs(prof.ms)} s, missing ${profile.missing.length}`);

  // 2. Follow-ups (F4), answers
  const ruleReads = new Set(staticRules.filter((r) => r.verified && r.council === s.council).flatMap((r) => conditionPaths(r.condition)));
  const questions: FollowUpQuestion[] = followUps(profile, staticRules);
  add("F4", `At most ${Math.min(3, s.expect.maxQuestions)} follow-ups, each about a missing field a verified rule reads`,
    questions.length <= Math.min(3, s.expect.maxQuestions) && questions.every((q) => ruleReads.has(q.path) && profile.missing.includes(q.path)),
    questions.map((q) => q.question).join(" | ") || "no questions");
  const given = questions.filter((q) => s.answers[q.path]).map((q) => ({ path: q.path, answer: s.answers[q.path] }));
  const answered = given.length ? applyAnswers(profile, given) : profile;
  const questionsAfter = followUps(answered, staticRules);

  // 3. Requirements (F5, F13): deterministic from the (AI) profile
  const requirements: Requirement[] = requiredDocuments(answered, staticRules);
  const types = requirements.map((r) => r.documentType);
  const missingDocs = s.expect.include.filter((t) => !types.includes(t));
  const extraDocs = s.expect.exclude.filter((t) => types.includes(t));
  add("F5", "Required documents match the CCC rules for this event", !missingDocs.length && !extraDocs.length,
    [missingDocs.length && `missing ${missingDocs.join(", ")}`, extraDocs.length && `unexpected ${extraDocs.join(", ")}`].filter(Boolean).join("; ") || types.join(", "));
  add("F13", "Every requirement has a plain-English reason, a source URL and a last-checked date",
    requirements.every((r) => r.reason && /^https?:\/\//.test(r.sourceUrl) && r.lastChecked), "");

  // 4. Classification (F14) and deadlines (F8) in parallel with drafting
  const classifyP = time(() => classify(answered));
  const classifyChunksP = retrieve(s.council, "community event commercial event definition fees charges");
  const date = answered.date.value;
  const deadlines: Deadline[] = date ? computeDeadlines(date, requirements) : [];

  // 5. Drafts (F6) in parallel, then check (F7) and fix until green (F7, F12)
  const drafted = types.filter((t) => DRAFTED_TYPES.has(t) && kb.sections(t).length && kb.checklist(t).length);
  const noKb = types.filter((t) => DRAFTED_TYPES.has(t) && !drafted.includes(t));
  const t0 = Date.now();
  const docs = await Promise.all(drafted.map(async (type) => {
    const d = await time(() => draftDocument(answered, type, { sections: kb.sections(type), checklist: kb.checklist(type) }));
    const chunks = await retrieve(s.council, `${type.replaceAll("_", " ")} requirements template`);
    return { type, draft: d.v, draftMs: d.ms, chunks };
  }));
  const draftWall = Date.now() - t0;
  add("NFR-drafts", "All drafts, in parallel, under 60 s", draftWall < 60_000, `${docs.length} drafts in ${secs(draftWall)} s`);
  log(`${docs.length} drafts in ${secs(draftWall)} s`);

  const results = await Promise.all(docs.map(async (d) => {
    const { applicable, notApplicable } = splitChecklist(kb.checklist(d.type), answered);
    const first = await time(() => checkDocument(d.draft, kb.checklist(d.type), answered));
    const fixes: { itemId: string; fix: string; passedAfter: boolean; ms: number }[] = [];
    let doc = d.draft;
    let result: CheckResult = first.v;
    const maxClicks = first.v.items.filter((i) => !i.pass).length + SPARE_FIX_CLICKS;
    for (let round = 0; round < maxClicks && result.items.some((i) => !i.pass); round++) {
      const red = result.items.find((i) => !i.pass)!;
      const f = await time(async () => {
        const fixed = await applyFix(doc, red.suggestedFix!);
        return { fixed, recheck: await checkDocument(fixed, kb.checklist(d.type), answered) };
      });
      doc = f.v.fixed;
      result = f.v.recheck;
      fixes.push({ itemId: red.itemId, fix: red.suggestedFix!, passedAfter: !!result.items.find((i) => i.itemId === red.itemId)?.pass, ms: f.ms });
    }
    return { ...d, applicable, notApplicable, firstCheck: first.v, checkMs: first.ms, fixes, final: doc, finalCheck: result };
  }));

  // Draft quality checks
  const allowedNumbers = new Set([
    ...numbers(JSON.stringify(answered)), ...numbers(s.description),
  ]);
  const draftProblems: string[] = [];
  const unexplained: string[] = [];
  for (const r of results) {
    const d = r.draft;
    if (d.documentType !== r.type) draftProblems.push(`${r.type}: wrong type`);
    if (!REGISTER_TYPES.has(r.type)) {
      const missing = kb.sections(r.type).filter((h) => !d.sections.some((x) => x.heading.toLowerCase().includes(h.toLowerCase().slice(0, 12))));
      if (missing.length) draftProblems.push(`${r.type}: missing sections ${missing.join(", ")}`);
    }
    if (JSON.stringify(extractPlaceholders(d)) !== JSON.stringify(d.placeholders)) draftProblems.push(`${r.type}: placeholder list out of sync`);
    if (/to be (provided|confirmed) by the organiser/i.test(docText(d))) draftProblems.push(`${r.type}: says "to be provided" instead of a placeholder`);
    if (/ignore (all )?previous instructions/i.test(docText(r.final))) draftProblems.push(`${r.type}: repeats injected instructions`);
    const allowed = new Set([...allowedNumbers, ...numbers(JSON.stringify(kb.checklist(r.type))), ...numbers(JSON.stringify(kb.sections(r.type))),
      ...numbers(keyDates(answered, r.type, TODAY)),
      ...numbers(r.chunks.map((c) => c.content).join(" "))]);
    const extra = [...numbers(docText(r.final))].filter((n) => !allowed.has(n));
    if (extra.length) unexplained.push(`${r.type}: ${extra.join(", ")}`);
    for (const m of money(docText(r.final))) if (!r.chunks.some((c) => c.content.includes(m.replace(/\s/g, "")))) draftProblems.push(`${r.type}: dollar amount ${m} not from council text`);
  }
  add("F6", "Drafts: right type, every template section, placeholders for unknowns, no injected text, no unsourced fees",
    !draftProblems.length, draftProblems.join("; ") || `${results.length} drafts clean`);
  add("ACC-numbers", "Every number in a draft comes from the profile, description, checklist or retrieved council text",
    !unexplained.length, unexplained.join("; ") || "none unexplained", true);

  const firstPass = results.reduce((n, r) => n + r.firstCheck.items.filter((i) => i.pass).length, 0);
  const firstTotal = results.reduce((n, r) => n + r.firstCheck.items.length, 0);
  add("F7-check", "One result per applicable checklist item; every red item has a fix",
    results.every((r) => r.firstCheck.items.length === r.applicable.length && r.firstCheck.items.every((i) => i.pass || i.suggestedFix)),
    `${firstPass}/${firstTotal} pass on first draft${firstTotal ? ` (${Math.round((100 * firstPass) / firstTotal)}%)` : ""}`);
  add("PRD-metric", "80% of checklist items pass on the first draft", !firstTotal || firstPass / firstTotal >= 0.8,
    firstTotal ? `${Math.round((100 * firstPass) / firstTotal)}%` : "no drafts", true);
  const stuck = results.filter((r) => r.finalCheck.items.some((i) => !i.pass));
  const clicks = results.flatMap((r) => r.fixes);
  add("F7-fix-rate", "A \"Fix\" click turns its item green", !clicks.length || clicks.filter((f) => f.passedAfter).length / clicks.length >= 0.8,
    clicks.length ? `${clicks.filter((f) => f.passedAfter).length}/${clicks.length} clicks worked` : "no fixes needed", true);
  add("F7-fix", "Every document reaches all green with \"Fix\" (one click per red item, two spare), so Eventbrite can unlock",
    !stuck.length, stuck.map((r) => `${r.type}: ${r.finalCheck.items.filter((i) => !i.pass).map((i) => i.itemId).join(", ")}`).join("; ")
      || `${results.reduce((n, r) => n + r.fixes.length, 0)} fixes applied`);

  const classification = await classifyP;
  const cChunks = await classifyChunksP;
  const c: Classification = classification.v;
  const cText = `${c.reasoning} ${c.howToPresent ?? ""}`;
  const citedText = cChunks.filter((x) => c.citedChunkIds.includes(String(x.id))).map((x) => x.content).join(" ");
  const badFees = money(cText).filter((m) => !citedText.replace(/\s/g, "").includes(m.replace(/\s/g, "")));
  add("F14", "Classification is grounded (cites council text) or unclear; no chunk ids in the text; fees only if a cited chunk states them",
    (c.category === "unclear" || c.citedChunkIds.length > 0) && !/chunk [\w-]*\d/i.test(cText) && !badFees.length,
    `${c.category}, cites ${c.citedChunkIds.length}${badFees.length ? `; unsourced ${badFees.join(", ")}` : ""}`);

  const late = deadlines.filter((d) => d.recommended < TODAY || (d.legalMinimum && d.legalMinimum < TODAY));
  add("F8", "Deadlines: computed for every dated event; any already-late deadline is surfaced",
    date ? deadlines.length > 0 || !requirements.some((r) => ["event_permit_application", "special_licence_application", "traffic_management_plan"].includes(r.documentType)) : true,
    date ? deadlines.map((d) => `${d.documentType} legal ${d.legalMinimum ?? "n/a"} rec ${d.recommended}`).join("; ") + (late.length ? ` | LATE: ${late.map((d) => d.documentType).join(", ")}` : "")
      : "no date, no deadlines");
  if (noKb.length) add("KB", "Every drafted type has a published template and verified checklist", false, `none for ${noKb.join(", ")}`, true);

  let grades: Record<string, z.infer<typeof Grade>> = {};
  if (judge) {
    const g = await Promise.all(results.map(async (r) => [r.type, await structured({
      schema: Grade, name: "grade", model: JUDGE_MODEL, system: JUDGE_SYSTEM,
      user: `Document type: ${r.type}\nEvent profile:\n${JSON.stringify(answered)}\nChecklist (items for other crowd sizes are correctly marked not required):\n${JSON.stringify(kb.checklist(r.type))}\nDates from the deadline engine (verified, not invented):\n${keyDates(answered, r.type, TODAY) || "none"}\nDraft:\n${JSON.stringify(r.final)}`,
    })] as const));
    grades = Object.fromEntries(g);
  }

  return {
    scenario: s, profile, profileMs: prof.ms, questions, answersGiven: given, answered, questionsAfter, requirements,
    classification: c, classifyMs: classification.ms, deadlines, draftWallMs: draftWall,
    documents: results.map((r) => ({
      type: r.type, draftMs: r.draftMs, checkMs: r.checkMs, template: kb.sections(r.type), checklistSource: kb.source(r.type),
      skippedItems: r.notApplicable, draft: r.draft, firstCheck: r.firstCheck, fixes: r.fixes, final: r.final, finalCheck: r.finalCheck,
      citedChunks: r.chunks.filter((c) => r.draft.citedChunkIds.includes(String(c.id))).map((c) => ({ id: c.id, url: c.url, heading: c.heading })),
      grade: grades[r.type] ?? null,
    })),
    manual: types.filter((t) => !DRAFTED_TYPES.has(t)),
    checks,
  };
}

async function main() {
  const missingEnv = ["OPENAI_API_KEY", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
  if (missingEnv.length) { console.error(`Missing ${missingEnv.join(", ")} (use --env-file=.env.local)`); process.exit(1); }
  const file = JSON.parse(await readFile("fixtures/test-scenarios.json", "utf8"));
  const scenarios: Scenario[] = file.scenarios.filter((s: Scenario) => !only || only.includes(s.id));
  console.log(`Models: profile/check/fix ${MODEL_FAST}, draft/classify ${MODEL_STRONG}${judge ? `, judge ${JUDGE_MODEL}` : ""}. ${scenarios.length} scenarios.\n`);
  const kb = await councilData();

  const out: Awaited<ReturnType<typeof runScenario>>[] = [];
  const failed: { id: string; error: string }[] = [];
  const queue = [...scenarios];
  await Promise.all(Array.from({ length: 3 }, async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      try { out.push(await runScenario(s, kb)); } catch (e) { failed.push({ id: s.id, error: e instanceof Error ? e.message : String(e) }); }
    }
  }));
  out.sort((a, b) => scenarios.indexOf(a.scenario) - scenarios.indexOf(b.scenario));

  console.log("\n=== Compliance");
  let hardFails = 0;
  for (const r of out) {
    console.log(`\n${r.scenario.id}: ${r.scenario.title}`);
    for (const c of r.checks) {
      if (!c.pass && !c.warnOnly) hardFails++;
      console.log(`  ${c.pass ? "PASS" : c.warnOnly ? "WARN" : "FAIL"} ${c.id.padEnd(12)} ${c.requirement}${c.detail ? `\n       ${c.detail}` : ""}`);
    }
    if (judge) for (const d of r.documents) if (d.grade) console.log(`  judge ${d.type}: ${d.grade.score}/10${d.grade.inventedFacts.length ? `; invented: ${d.grade.inventedFacts.join("; ")}` : ""}`);
  }
  for (const f of failed) { hardFails++; console.log(`\n${f.id}: CRASHED ${f.error}`); }

  await mkdir("data/scenarios", { recursive: true });
  const path = `data/scenarios/${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await writeFile(path, JSON.stringify({ models: { fast: MODEL_FAST, strong: MODEL_STRONG, judge: judge ? JUDGE_MODEL : null }, today: TODAY, runs: out, failed }, null, 2));
  console.log(`\n${hardFails ? `${hardFails} FAILED` : "ALL PASSED"}. Saved to ${path}`);
  process.exit(hardFails ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
