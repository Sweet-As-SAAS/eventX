// Step 8: push reviewed items into runtime tables. Only items (or whole files) marked "verified": true are published.
// Run: npm run ingest:publish -- ccc
import { readdir, readFile } from "node:fs/promises";
import { db } from "../../lib/supabase/admin";
import { DocumentType } from "../../lib/schemas";
import { nzToday } from "../../lib/deadlines";
import { councilArg } from "./seeds";

const council = councilArg();
const sb = db();
const today = nzToday();

async function main() {
  const { data: co, error } = await sb.from("councils").select("id").eq("slug", council).single();
  if (error) throw new Error(`councils: ${error.message}`);
  let n = 0;
  const check = (what: string, e: { message: string } | null) => { if (e) throw new Error(`${what}: ${e.message}`); n++; };

  for (const f of await readdir(`data/normalised/${council}`)) {
    const doc = JSON.parse(await readFile(`data/normalised/${council}/${f}`, "utf8"));
    const ok = (item: any) => (doc.verified === true || item.verified === true) && DocumentType.safeParse(item.documentType).success;

    for (const r of doc.rules.filter(ok)) {
      let condition;
      try { condition = JSON.parse(r.conditionJson); } catch { console.warn("skip rule with bad conditionJson", r.id); continue; }
      const { error } = await sb.from("rules").upsert({ id: `${council}-${r.id}`, council_id: co.id, condition,
        outcome: { documentType: r.documentType, reason: r.reason }, source_url: doc.url, source_quote: r.sourceQuote,
        verified: true, last_checked: today });
      check(`rule ${r.id}`, error);
    }
    for (const c of doc.checklists.filter(ok)) {
      const { error } = await sb.from("checklists").upsert({ council_id: co.id, document_type: c.documentType, items: c.items,
        source_url: doc.url, verified: true, last_checked: today }, { onConflict: "council_id,document_type" });
      check(`checklist ${c.documentType}`, error);
    }
    for (const t of doc.templates.filter(ok)) {
      const { error } = await sb.from("templates").upsert({ council_id: co.id, document_type: t.documentType, sections: t.sections,
        source_url: doc.url }, { onConflict: "council_id,document_type" });
      check(`template ${t.documentType}`, error);
    }
  }
  console.log(`published ${n} verified items for ${council}. Now run npm test: the demo event's requirements must still match the fixture.`);
}
main();
