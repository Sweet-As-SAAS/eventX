// Step 8: push reviewed items into runtime tables. Only items (or whole files) marked "verified": true are published.
// Reads data/normalised/<council> (AI candidates you reviewed) then scripts/ingest/verified/<council> (hand-written,
// committed, wins on conflict). Every rule and checklist quote must appear in data/text/<council>, or it is skipped.
// Run: npm run ingest:publish -- ccc          Check only, no database: npm run ingest:publish -- ccc --check
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { db } from "../../lib/supabase/admin";
import { DocumentType } from "../../lib/schemas";
import { nzToday } from "../../lib/deadlines";
import { councilArg } from "./seeds";

const council = councilArg();
const checkOnly = process.argv.includes("--check");
const today = nzToday();
const DIRS = [`data/normalised/${council}`, `scripts/ingest/verified/${council}`];
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

async function loadDocs() {
  const docs: any[] = [];
  for (const dir of DIRS.filter(existsSync))
    for (const f of (await readdir(dir)).filter((f) => f.endsWith(".json")))
      docs.push({ file: `${dir}/${f}`, ...JSON.parse(await readFile(`${dir}/${f}`, "utf8")) });
  return docs;
}

async function loadSources() {
  const byUrl = new Map<string, string>();
  const dir = `data/text/${council}`;
  if (existsSync(dir))
    for (const f of await readdir(dir)) {
      const t = await readFile(`${dir}/${f}`, "utf8");
      const url = t.match(/<!-- source: (.*) -->/)?.[1];
      if (url) byUrl.set(url, norm(t));
    }
  return byUrl;
}

async function main() {
  const docs = await loadDocs();
  const sources = await loadSources();
  const problems: string[] = [];
  const quoted = (doc: any, quote: string, what: string) => {
    const text = sources.get(doc.url);
    const ok = !!text && norm(quote).split(" ... ").every((part) => text.includes(part));
    if (!ok) problems.push(`${doc.file}: ${what} quote not found in ${doc.url}${text ? "" : " (no extracted text for this url)"}`);
    return ok;
  };

  const rules: any[] = [], checklists: any[] = [], templates: any[] = [];
  for (const doc of docs) {
    const ok = (item: any) => (doc.verified === true || item.verified === true) && DocumentType.safeParse(item.documentType).success;
    for (const r of (doc.rules ?? []).filter(ok)) {
      let condition;
      try { condition = JSON.parse(r.conditionJson); } catch { problems.push(`${doc.file}: rule ${r.id} bad conditionJson`); continue; }
      if (quoted(doc, r.sourceQuote, `rule ${r.id}`)) rules.push({ doc, r, condition });
    }
    for (const c of (doc.checklists ?? []).filter(ok))
      if (c.items.every((i: any) => quoted(doc, i.sourceQuote, `checklist ${c.documentType}/${i.id}`))) checklists.push({ doc, c });
    for (const t of (doc.templates ?? []).filter(ok)) templates.push({ doc, t });
  }

  problems.forEach((p) => console.warn("SKIP", p));
  console.log(`${rules.length} rules, ${checklists.length} checklists, ${templates.length} templates ready for ${council}`);
  if (checkOnly) { if (problems.length) process.exitCode = 1; return; }

  const sb = db();
  const { data: co, error } = await sb.from("councils").select("id").eq("slug", council).single();
  if (error) throw new Error(`councils: ${error.message}`);
  const check = (what: string, e: { message: string } | null) => { if (e) throw new Error(`${what}: ${e.message}`); };

  for (const { doc, r, condition } of rules)
    check(`rule ${r.id}`, (await sb.from("rules").upsert({ id: `${council}-${r.id}`, council_id: co.id, condition,
      outcome: { documentType: r.documentType, reason: r.reason }, source_url: doc.url, source_quote: r.sourceQuote,
      verified: true, last_checked: today })).error);
  for (const { doc, c } of checklists)
    check(`checklist ${c.documentType}`, (await sb.from("checklists").upsert({ council_id: co.id, document_type: c.documentType,
      items: c.items, source_url: doc.url, verified: true, last_checked: today }, { onConflict: "council_id,document_type" })).error);
  for (const { doc, t } of templates)
    check(`template ${t.documentType}`, (await sb.from("templates").upsert({ council_id: co.id, document_type: t.documentType,
      sections: t.sections, source_url: doc.url }, { onConflict: "council_id,document_type" })).error);

  console.log(`published for ${council}. Now run npm test: the demo event's requirements must still match the fixture.`);
}
main();
