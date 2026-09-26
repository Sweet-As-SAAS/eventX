// The council's own Safety Risk Assessment Form (CCC's event hazard template), filled in from the hazard register draft.
// CCC publishes it as a Word file (kb/forms/ccc/Risk-Assessment-template.doc); this is the same form as a PDF.
// It has no form fields, so answers are written onto the page. Positions were measured on a 1170px-wide render.
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { DraftDocument, EventProfile } from "../schemas";

const FORM = path.join(process.cwd(), "lib/pdf/forms/ccc-risk-assessment.pdf");
const H = 595.25;
const x = (px: number) => px / (1170 / 842);
const y = (px: number) => H - px / (1170 / 842);
// Column edges: activity, hazards, persons at risk, S, L, SxL, controls, S, L, SxL, additional controls, owner.
const COLS = [60, 200, 303, 396, 444, 494, 533, 809, 858, 907, 946, 1037, 1110].map(x);
const PAGE1_ROWS: [number, number][] = [[y(330), y(362)], [y(362), y(395)]];
const HEAD = ["Activity", "Hazards", "Persons at risk", "Severity", "Likeli- hood", "SxL", "Controls", "Severity", "Likeli- hood", "SxL", "Additional controls", "Owner"];

type Row = { cells: string[]; before: number | null; after: number | null };

const LABELS = ["Persons at risk", "Risk", "Proposed controls", "Controls", "Before controls", "After controls", "Residual risk", "Additional controls", "Owner"];
/** "Persons at risk: … Risk: … Controls: … Before controls: severity 4, likelihood 3. …" -> one table row. */
export function hazardRow(heading: string, body: string): Row {
  const text = body.replace(/\s*\((?:fictional|demo)[^)]*\)/gi, "");
  const found = [...text.matchAll(new RegExp(`(${LABELS.join("|")}):`, "g"))];
  const part: Record<string, string> = {};
  found.forEach((m, i) => { part[m[1]] = text.slice(m.index! + m[0].length, found[i + 1]?.index ?? text.length).trim().replace(/\.$/, ""); });
  const score = (s?: string) => { const m = s?.match(/severity (\d), likelihood (\d)/i); return m ? [Number(m[1]), Number(m[2])] : [null, null]; };
  const [s1, l1] = score(part["Before controls"]);
  const [s2, l2] = score(part["After controls"]);
  const residual = part["Residual risk"];
  const additional = part["Additional controls"] ?? (residual && !/^low$/i.test(residual) ? residual.charAt(0).toUpperCase() + residual.slice(1) : "Check on the day; review after the event");
  const n = (v: number | null) => (v == null ? "" : String(v));
  const cap = (t = "") => t.charAt(0).toUpperCase() + t.slice(1);
  return {
    cells: [heading, cap(part["Risk"]), cap(part["Persons at risk"]), n(s1), n(l1), s1 && l1 ? String(s1 * l1) : "",
      cap(part["Controls"] ?? part["Proposed controls"]), n(s2), n(l2), s2 && l2 ? String(s2 * l2) : "", additional, part["Owner"] ?? ""],
    before: s1 && l1 ? s1 * l1 : null, after: s2 && l2 ? s2 * l2 : null,
  };
}

/** CCC's risk rating colours: 10 to 25 unacceptable, 6 to 9 tolerable, 1 to 5 acceptable. */
const rating = (v: number | null) => v == null ? null : v >= 10 ? rgb(1, 0.72, 0.72) : v >= 6 ? rgb(1, 0.85, 0.55) : rgb(0.72, 0.9, 0.62);

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

/** Text in a cell, shrunk until it fits the cell's height. */
function cell(page: PDFPage, text: string, x0: number, x1: number, top: number, bottom: number, font: PDFFont, max = 7, center = false) {
  if (!text) return;
  const w = x1 - x0 - 4, h = top - bottom - 3;
  let size = max, lines = wrap(text, font, size, w);
  while (size > 3.6 && lines.length * size * 1.15 > h) { size -= 0.2; lines = wrap(text, font, size, w); }
  lines.forEach((l, i) => page.drawText(l, {
    x: center ? x0 + (x1 - x0 - font.widthOfTextAtSize(l, size)) / 2 : x0 + 2, y: top - 2 - size * (i + 1) * 1.1 + size * 0.15, size, font, color: rgb(0.08, 0.08, 0.1),
  }));
}

const rowHeight = (r: Row, font: PDFFont, size: number) =>
  Math.max(22, ...r.cells.map((t, i) => wrap(t, font, size, COLS[i + 1] - COLS[i] - 4).length * size * 1.15 + 5));

function drawRow(page: PDFPage, r: Row, top: number, bottom: number, font: PDFFont, grid: boolean) {
  for (const [i, v] of [[5, r.before], [9, r.after]] as const) {
    const fill = rating(v);
    if (fill) page.drawRectangle({ x: COLS[i] + 0.5, y: bottom + 0.5, width: COLS[i + 1] - COLS[i] - 1, height: top - bottom - 1, color: fill });
  }
  if (grid) COLS.slice(0, -1).forEach((c, i) => page.drawRectangle({ x: c, y: bottom, width: COLS[i + 1] - c, height: top - bottom, borderColor: rgb(0, 0, 0), borderWidth: 0.5 }));
  r.cells.forEach((t, i) => cell(page, t, COLS[i], COLS[i + 1], top, bottom, font, 7, i >= 3 && i <= 5 || i >= 7 && i <= 9));
}

/** Over CCC's red "Company or Project Name" placeholder. */
function title(page: PDFPage, text: string, bold: PDFFont) {
  page.drawRectangle({ x: x(700), y: y(84), width: x(1100) - x(700), height: y(46) - y(84), color: rgb(1, 1, 1) });
  const size = Math.min(16, (x(1075) - x(700)) / bold.widthOfTextAtSize(text, 1));
  page.drawText(text, { x: x(1075) - bold.widthOfTextAtSize(text, size), y: y(74), size, font: bold, color: rgb(0.08, 0.08, 0.1) });
}

export async function fillRiskAssessment(p: EventProfile, draft: DraftDocument, today: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(await fs.readFile(FORM));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [page1, page2] = pdf.getPages();
  const name = p.name.value ?? "Event";
  const [person, ...org] = (p.people.organiser.value ?? "").split(",").map((s) => s.trim());
  const rows = draft.sections.map((s) => hazardRow(s.heading, s.body));

  for (const page of [page1, page2]) title(page, name, bold);
  cell(page1, [name, p.venue.name.value, p.date.value && new Date(`${p.date.value}T00:00:00Z`).toLocaleDateString("en-NZ", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })].filter(Boolean).join(", "),
    x(200), x(1110), y(178), y(207), font, 9);
  cell(page1, new Date(`${today}T00:00:00Z`).toLocaleDateString("en-NZ", { timeZone: "UTC" }), x(200), x(303), y(209), y(235), font, 9);
  cell(page1, person || "Event organiser", x(396), x(809), y(209), y(235), font, 9);
  page1.drawRectangle({ x: x(949), y: y(234), width: x(1108) - x(949), height: y(211) - y(234), color: rgb(1, 1, 1) }); // red "Company name"
  cell(page1, org.join(", ") || "Event organiser", x(947), x(1110), y(209), y(235), font, 8);

  rows.slice(0, 2).forEach((r, i) => drawRow(page1, r, PAGE1_ROWS[i][0], PAGE1_ROWS[i][1], font, false));

  // The rest continue in the same table, in page 2's empty space and then on new pages.
  let page = page2, top = y(290);
  const head = (pg: PDFPage, t: number) => {
    pg.drawText("Safety Risk Assessment Form, continued", { x: COLS[0], y: t + 6, size: 9, font: bold });
    COLS.slice(0, -1).forEach((c, i) => {
      pg.drawRectangle({ x: c, y: t - 24, width: COLS[i + 1] - c, height: 24, color: rgb(0.84, 0.84, 0.84), borderColor: rgb(0, 0, 0), borderWidth: 0.5 });
      cell(pg, HEAD[i], c, COLS[i + 1], t - 2, t - 24, bold, 6, true);
    });
    return t - 24;
  };
  if (rows.length > 2) top = head(page, top);
  for (const r of rows.slice(2)) {
    const h = rowHeight(r, font, 6.5);
    if (top - h < 50) { page = pdf.addPage([842, H]); title(page, name, bold); top = head(page, H - 60); }
    drawRow(page, r, top, top - h, font, true);
    top -= h;
  }
  return pdf.save();
}
