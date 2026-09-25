// Step 5: upload sources, chunk by heading, embed, insert into Supabase. Run: npm run ingest:load -- ccc
import { readFile } from "node:fs/promises";
import { db } from "../../lib/supabase/admin";
import { embed } from "../../lib/ai/client";
import { councilArg } from "./seeds";

const council = councilArg();
const sb = db();

/** Split by heading, then into ~800-token (~3200 char) pieces. */
function chunk(text: string, maxChars = 3200) {
  const parts: { heading: string; content: string }[] = [];
  let heading = "Overview";
  let buf: string[] = [];
  const flush = () => {
    const c = buf.join("\n").trim();
    for (let i = 0; i < c.length; i += maxChars) parts.push({ heading, content: c.slice(i, i + maxChars) });
    buf = [];
  };
  for (const line of text.split("\n")) {
    if (/^#{1,4} /.test(line)) { flush(); heading = line.replace(/^#+ /, ""); } else buf.push(line);
  }
  flush();
  return parts;
}

async function main() {
  const { data: co, error } = await sb.from("councils").select("id").eq("slug", council).single();
  if (error) throw new Error(`councils: ${error.message}. Did you run supabase/migrations/0001_init.sql?`);
  const manifest = JSON.parse(await readFile(`data/raw/${council}/manifest.json`, "utf8"));
  for (const m of manifest) {
    const storagePath = `raw/${council}/${m.sha256}.${m.type}`;
    const up = await sb.storage.from("kb").upload(storagePath, await readFile(m.file), { upsert: true });
    if (up.error) throw new Error(`storage: ${up.error.message}`);
    const { data: src, error: srcErr } = await sb.from("kb_sources").upsert({ council_id: co.id, url: m.url, type: m.type,
      sha256: m.sha256, storage_path: storagePath, fetched_at: m.fetchedAt }, { onConflict: "council_id,url" }).select("id").single();
    if (srcErr) throw new Error(`kb_sources: ${srcErr.message}`);
    await sb.from("kb_chunks").delete().eq("source_id", src.id);
    const parts = chunk(await readFile(`data/text/${council}/${m.sha256}.md`, "utf8"));
    for (let i = 0; i < parts.length; i += 100) {
      const batch = parts.slice(i, i + 100);
      const vectors = await embed(batch.map((p) => `${p.heading}\n${p.content}`));
      const ins = await sb.from("kb_chunks").insert(batch.map((p, j) => ({ source_id: src.id, heading: p.heading, content: p.content, embedding: vectors[j] })));
      if (ins.error) throw new Error(`kb_chunks: ${ins.error.message}`);
    }
    console.log("loaded", parts.length, "chunks from", m.url);
  }
}
main();
