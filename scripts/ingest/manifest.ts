// Manual alternative to crawl.ts for sites that block bots: save pages by hand into data/raw/<council>/,
// list them in data/raw/<council>/sources.txt as "<filename> <source url>" (one per line, # comments ok),
// then run: npx tsx scripts/ingest/manifest.ts ccc   → writes manifest.json for extract/load.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { councilArg } from "./seeds";

const council = councilArg();
const dir = `data/raw/${council}`;

async function main() {
  const lines = (await readFile(`${dir}/sources.txt`, "utf8")).split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const manifest = [];
  for (const line of lines) {
    const i = line.lastIndexOf(" ");
    const [name, url] = [line.slice(0, i).trim(), line.slice(i + 1)];
    if (!name || !/^https:\/\//.test(url)) throw new Error(`Bad line (want "<filename> <https url>"): ${line}`);
    const file = `${dir}/${name}`;
    const buf = await readFile(file);
    const ext = name.toLowerCase().split(".").pop();
    const type = ext === "pdf" ? "pdf" : ext === "docx" ? "docx" : "html";
    const sha256 = createHash("sha256").update(buf).digest("hex");
    manifest.push({ url, type, sha256, file, fetchedAt: new Date().toISOString() });
    console.log(type, url);
  }
  await writeFile(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2));
  console.log(`manifest: ${manifest.length} files for ${council}. Next: npm run ingest:extract -- ${council}`);
}
main();
