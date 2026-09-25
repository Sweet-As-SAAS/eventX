// Steps 1-3: crawl seeds politely and save raw files to data/raw/<council>/. Run: npm run ingest:crawl -- ccc
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import * as cheerio from "cheerio";
import { SEEDS, KEYWORDS, USER_AGENT, councilArg } from "./seeds";

const council = councilArg();
const { domain, urls } = SEEDS[council];
const MAX_DEPTH = 2;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function disallowed(): Promise<string[]> {
  const res = await fetch(`${new URL(urls[0]).origin}/robots.txt`, { headers: { "User-Agent": USER_AGENT } }).catch(() => null);
  if (!res?.ok) return [];
  const out: string[] = [];
  let applies = false;
  for (const l of (await res.text()).split("\n").map((x) => x.trim())) {
    if (/^user-agent:/i.test(l)) applies = /\*|hostready/i.test(l);
    else if (applies && /^disallow:/i.test(l)) { const p = l.slice(l.indexOf(":") + 1).trim(); if (p) out.push(p); }
  }
  return out;
}

const typeOf = (url: string, ct: string) =>
  ct.includes("pdf") || url.endsWith(".pdf") ? "pdf" : ct.includes("word") || url.endsWith(".docx") ? "docx" : "html";

async function main() {
  if (USER_AGENT.includes("[YOUR EMAIL]")) throw new Error("Put your contact email in USER_AGENT in scripts/ingest/seeds.ts first");
  const blocked = await disallowed();
  const seen = new Set<string>();
  const queue: { url: string; depth: number }[] = urls.map((u) => ({ url: u, depth: 0 }));
  const manifest: { url: string; type: string; sha256: string; file: string; fetchedAt: string }[] = [];
  await mkdir(`data/raw/${council}`, { recursive: true });

  while (queue.length) {
    const { url, depth } = queue.shift()!;
    const clean = url.split("#")[0];
    if (seen.has(clean)) continue;
    seen.add(clean);
    if (blocked.some((b) => new URL(clean).pathname.startsWith(b))) { console.log("robots skip", clean); continue; }

    await sleep(1000); // 1 request per second
    const res = await fetch(clean, { headers: { "User-Agent": USER_AGENT } }).catch(() => null);
    if (!res?.ok) { console.log("fail", res?.status, clean); continue; }
    const type = typeOf(clean, res.headers.get("content-type") ?? "");
    const buf = Buffer.from(await res.arrayBuffer());
    const sha = createHash("sha256").update(buf).digest("hex");
    const file = `data/raw/${council}/${sha}.${type}`;
    await writeFile(file, buf);
    manifest.push({ url: clean, type, sha256: sha, file, fetchedAt: new Date().toISOString() });
    console.log("saved", type, clean);

    if (type === "html" && depth < MAX_DEPTH) {
      const $ = cheerio.load(buf.toString("utf8"));
      $("main a[href], #maincontent a[href], article a[href]").each((_, a) => {
        try {
          const next = new URL($(a).attr("href")!, clean);
          if (!next.hostname.endsWith(domain)) return;
          if (!KEYWORDS.some((k) => next.pathname.toLowerCase().includes(k))) return;
          queue.push({ url: next.toString(), depth: depth + 1 });
        } catch { /* bad href */ }
      });
    }
  }
  await writeFile(`data/raw/${council}/manifest.json`, JSON.stringify(manifest, null, 2));
  console.log(`done: ${manifest.length} files for ${council}`);
}
main();
