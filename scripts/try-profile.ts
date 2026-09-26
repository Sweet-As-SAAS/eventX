import { mkdir, writeFile } from "node:fs/promises";
import { buildProfile } from "../lib/ai/profile";
import { EventProfile } from "../lib/schemas";
import fixture from "../fixtures/demo-event.json";

const expected = EventProfile.parse(fixture.profile);
const runs = Number(process.argv[2] ?? 5);
if (!Number.isInteger(runs) || runs < 1) throw new Error("Run count must be a positive integer");

function statedFields(value: unknown, prefix = ""): [string, unknown][] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  if ("value" in value && "source" in value) {
    return (value as { source: string }).source === "stated"
      ? [[prefix, (value as { value: unknown }).value]] : [];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    statedFields(child, prefix ? `${prefix}.${key}` : key));
}

function atPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) =>
    current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined, value);
}

async function main() {
  const fields = statedFields(expected);
  const results: { run: number; milliseconds: number; profile: EventProfile }[] = [];
  for (let run = 1; run <= runs; run++) {
    const start = performance.now();
    const profile = EventProfile.parse(await buildProfile(fixture.description, "ccc", "2026-09-26"));
    results.push({ run, milliseconds: Math.round(performance.now() - start), profile });
    console.log(`Run ${run}/${runs}: ${results.at(-1)!.milliseconds} ms, ${profile.missing.length} missing fields`);
  }

  const rows: Record<string, string>[] = fields.map(([path, value]) => ({
    path,
    expected: JSON.stringify(value) ?? "undefined",
    ...Object.fromEntries(results.map(({ run, profile }) => {
      const field = atPath(profile, path) as { value: unknown; source: string } | undefined;
      return [`run${run}`, field?.source === "stated" && JSON.stringify(field.value) === JSON.stringify(value)
        ? "✓" : `${JSON.stringify(field?.value)} (${field?.source})`];
    })),
  }));
  console.table(rows);

  await mkdir("data/ai-live", { recursive: true });
  await writeFile("data/ai-live/profile-runs.json", JSON.stringify(results, null, 2));
  const mismatches = rows.flatMap((row) => results.filter(({ run }) => row[`run${run}`] !== "✓"));
  if (mismatches.length || results.some((r) => r.milliseconds >= 10_000)) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
