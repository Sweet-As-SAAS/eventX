// Lane A, task 3: run buildProfile on the demo fixture's description several times and diff each run against
// fixture.profile. Gate: every run parses, every structured field the fixture marks "stated" matches, under 10 s each.
//
//   npx tsx --env-file=.env.local scripts/try-profile.ts          5 live runs (needs OPENAI_API_KEY)
//   npx tsx --env-file=.env.local scripts/try-profile.ts 10       10 live runs
//   npx tsx scripts/try-profile.ts --dry                          no key: "runs" are the fixture itself, to check the table
//
// Outputs are saved to data/try-profile/ (gitignored) for the recorded schema tests (task 10).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { EventProfile } from "../lib/schemas";
import { buildProfile } from "../lib/ai/profile";
import { profileFields } from "../lib/ai/guards";
import { MODEL_FAST } from "../lib/ai/client";

const TODAY = "2026-09-26";
const COUNCIL = "ccc" as const;
const LATENCY_MS = 10_000;
/** Free text: wording varies run to run, so shown but not gated. */
const FREE_TEXT = new Set(["name", "venue.name", "alcohol.area"]);

const dry = process.argv.includes("--dry");
const runsArg = process.argv.slice(2).find((a) => /^\d+$/.test(a));
const RUNS = runsArg ? Number(runsArg) : 5;

type Run = { profile: EventProfile; ms: number } | { error: string; ms: number };

const short = { stated: "s", inferred: "i", answered: "a" } as const;
const cell = (f: { value: unknown; source: keyof typeof short | null }) =>
  f.value == null ? "—" : `${String(f.value)}${f.source ? ` (${short[f.source]})` : ""}`;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const esc = (s: string) => s.replaceAll("|", "\\|");

async function main() {
  if (!dry && !process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set. Add it to .env.local and run:\n  npx tsx --env-file=.env.local scripts/try-profile.ts\n(or add --dry to check the table without a key)");
    process.exit(1);
  }
  const fixture = JSON.parse(await readFile("fixtures/demo-event.json", "utf8"));
  const expected = EventProfile.parse(fixture.profile);
  console.log(`buildProfile × ${RUNS}, council ${COUNCIL}, reference date ${TODAY}, model ${dry ? "(dry run)" : MODEL_FAST}\n`);

  const runs: Run[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = Date.now();
    try {
      const out = dry ? structuredClone(expected) : await buildProfile(fixture.description, COUNCIL, TODAY);
      runs.push({ profile: EventProfile.parse(out), ms: Date.now() - t0 });
    } catch (e) {
      runs.push({ error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 });
    }
    const r = runs.at(-1)!;
    console.log(`run ${i + 1}: ${"error" in r ? `FAILED ${r.error}` : "parsed"} in ${(r.ms / 1000).toFixed(1)} s`);
  }

  // Diff table: one row per field. ✗ = value differs from the fixture, ≈ = free text differs, ~ = same value, different source.
  const header = ["field", "fixture", ...runs.map((_, i) => `run ${i + 1}`)];
  const rows: string[][] = [];
  const statedFailures = runs.map(() => [] as string[]);
  for (const { path, field: want } of profileFields(expected)) {
    const row = [path, cell(want)];
    runs.forEach((r, i) => {
      if ("error" in r) return row.push("error");
      const got = profileFields(r.profile).find((f) => f.path === path)!.field;
      let mark = "";
      if (!same(got.value, want.value)) {
        mark = FREE_TEXT.has(path) ? " ≈" : " ✗";
        if (want.source === "stated" && !FREE_TEXT.has(path)) statedFailures[i].push(path);
      } else if (got.source !== want.source) mark = " ~";
      row.push(cell(got) + mark);
    });
    rows.push(row);
  }
  rows.push(["missing", expected.missing.join(", ") || "—",
    ...runs.map((r) => ("error" in r ? "error" : r.profile.missing.join(", ") || "—"))]);

  console.log(`\n| ${header.join(" | ")} |\n| ${header.map(() => "---").join(" | ")} |`);
  for (const r of rows) console.log(`| ${r.map(esc).join(" | ")} |`);
  console.log("\ns stated · i inferred · a answered (fixture only: a fresh run has no answers yet, so those fields should come back unknown)");
  console.log("✗ value differs · ≈ free text differs (not gated) · ~ same value, different source");

  // Gate
  console.log("\nGate");
  let pass = true;
  runs.forEach((r, i) => {
    const problems = "error" in r ? [`did not parse: ${r.error}`] : [
      ...statedFailures[i].map((p) => `stated field ${p} differs`),
      ...(r.ms > LATENCY_MS ? [`took ${(r.ms / 1000).toFixed(1)} s (limit ${LATENCY_MS / 1000} s)`] : []),
    ];
    if (problems.length) pass = false;
    console.log(`  run ${i + 1}: ${problems.length ? `FAIL: ${problems.join("; ")}` : "PASS"}`);
  });
  const unstable = rows.filter((r) => new Set(r.slice(2).map((c) => c.replace(/ [✗≈~]$/, ""))).size > 1).map((r) => r[0]);
  console.log(`  consistent across runs: ${unstable.length ? `no, varies on ${unstable.join(", ")}` : "yes"}`);
  console.log(pass ? "\nGATE PASSED" : "\nGATE FAILED");

  if (!dry) {
    await mkdir("data/try-profile", { recursive: true });
    const file = `data/try-profile/${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    await writeFile(file, JSON.stringify({ model: MODEL_FAST, today: TODAY, description: fixture.description, runs }, null, 2));
    console.log(`Saved to ${file}`);
  }
  process.exit(pass ? 0 : 1);
}

main();
