// Step 4: raw files to clean markdown-ish text with headings. Run: npm run ingest:extract -- ccc
import { readFile, writeFile, mkdir } from "node:fs/promises";
import * as cheerio from "cheerio";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { councilArg } from "./seeds";

const council = councilArg();

function htmlToText(html: string) {
  const $ = cheerio.load(html);
  const main = $("#maincontent, main, article").first();
  const root = main.length ? main : $("body");
  root.find("nav, footer, script, style, header, form").remove();
  const out: string[] = [];
  root.find("h1, h2, h3, h4, p, li, td").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (!t) return;
    const tag = el.tagName;
    out.push(tag.startsWith("h") ? `${"#".repeat(+tag[1])} ${t}` : tag === "li" ? `- ${t}` : t);
  });
  return out.join("\n");
}

async function pdfToText(buf: Buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try { return (await parser.getText()).text; } finally { await parser.destroy(); }
}

async function main() {
  const manifest = JSON.parse(await readFile(`data/raw/${council}/manifest.json`, "utf8"));
  await mkdir(`data/text/${council}`, { recursive: true });
  for (const m of manifest) {
    const buf = await readFile(m.file);
    const text = m.type === "pdf" ? await pdfToText(buf)
      : m.type === "docx" ? (await mammoth.extractRawText({ buffer: buf })).value
      : htmlToText(buf.toString("utf8"));
    await writeFile(`data/text/${council}/${m.sha256}.md`, `<!-- source: ${m.url} -->\n${text}`);
    console.log("extracted", m.url, text.length, "chars");
  }
}
main();
