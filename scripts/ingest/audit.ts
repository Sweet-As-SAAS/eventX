// Task 8 source audit: every source link the app can show, with the exact text to find on it.
// Writes data/audit/<council>.md. Open each link in a browser, Ctrl+F the quote, tick the box.
// Run: npx tsx scripts/ingest/audit.ts ccc
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { staticRules } from "../../lib/rules";
import { councilArg } from "./seeds";

const council = councilArg();
const byUrl = new Map<string, string[]>();
const add = (url: string, line: string) => byUrl.set(url, [...(byUrl.get(url) ?? []), line]);

async function main() {
  for (const r of staticRules.filter((r) => r.council === council && r.verified))
    add(r.sourceUrl, `Rule \`${r.id}\` → ${r.outcome.documentType}: "${r.sourceQuote}"`);

  const dir = `scripts/ingest/verified/${council}`;
  for (const f of existsSync(dir) ? await readdir(dir) : []) {
    const doc = JSON.parse(await readFile(`${dir}/${f}`, "utf8"));
    for (const c of doc.checklists ?? []) for (const i of c.items) add(doc.url, `Checklist ${c.documentType}/${i.id}: "${i.sourceQuote}"`);
    for (const t of doc.templates ?? []) add(doc.url, `Template ${t.documentType}: page is the council's own source for these sections`);
  }

  const out = [`# Source audit: ${council}`, "",
    "For each link: open it in a browser, check it is the right page, Ctrl+F each quote (a few words is enough), tick the box.",
    "Anything missing or changed: tell lane B to fix the quote or set verified: false. Also click every link the live app shows (requirements, checklists, deadlines) and make sure it appears below.", ""];
  for (const [url, lines] of byUrl) {
    out.push(`## ${url}`, "", `- [ ] Link opens the right page`, ...lines.map((l) => `- [ ] ${l}`), "");
  }
  await mkdir("data/audit", { recursive: true });
  await writeFile(`data/audit/${council}.md`, out.join("\n"));
  console.log(`data/audit/${council}.md: ${byUrl.size} links, ${[...byUrl.values()].flat().length} quotes to check`);
}
main();
