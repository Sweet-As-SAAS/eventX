// Lane A, task 10: collect real AI outputs from the live runs in data/scenarios/ into tests/recordings/ai-outputs.json,
// which tests/ai-schema.test.ts parses in CI without calling OpenAI. Re-run after any prompt or model change, naming
// only runs made with the current prompts (older runs reflect older behaviour).
//   npx tsx scripts/record-ai-outputs.ts <run1.json> <run2.json>      files in data/scenarios/
import { mkdir, readFile, writeFile } from "node:fs/promises";

const MAX_PER_KIND = 40;

async function main() {
  const files = process.argv.slice(2).map((f) => f.split(/[\\/]/).pop()!);
  if (!files.length) throw new Error("Name the data/scenarios runs to record, made with the current prompts and models");
  const out = { profiles: [] as unknown[], questions: [] as unknown[], classifications: [] as unknown[], drafts: [] as unknown[], checks: [] as unknown[] };
  const seen = new Set<string>();
  const add = (kind: keyof typeof out, v: unknown) => {
    const key = kind + JSON.stringify(v);
    if (v == null || seen.has(key) || out[kind].length >= MAX_PER_KIND) return;
    seen.add(key);
    out[kind].push(v);
  };
  for (const f of files) {
    const run = JSON.parse(await readFile(`data/scenarios/${f}`, "utf8"));
    for (const r of run.runs ?? []) {
      add("profiles", r.profile);
      add("questions", r.questions);
      add("classifications", r.classification);
      for (const d of r.documents ?? []) {
        add("drafts", d.draft);
        add("drafts", d.final);
        add("checks", d.firstCheck);
        add("checks", d.finalCheck);
      }
    }
  }
  await mkdir("tests/recordings", { recursive: true });
  await writeFile("tests/recordings/ai-outputs.json", JSON.stringify({ recordedFrom: files, ...out }, null, 1) + "\n");
  console.log(Object.entries(out).map(([k, v]) => `${k} ${v.length}`).join(", "), `from ${files.length} runs`);
}

main().catch((e) => { console.error(e); process.exit(1); });
