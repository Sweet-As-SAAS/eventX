// Recomputes the deterministic parts of fixtures/demo-event.json (questions, requirements, deadlines) from its profile,
// using the same code the app runs. Run after changing the demo scenario: npm run fixture
import { readFile, writeFile } from "node:fs/promises";
import { EventProfile, DRAFTED_TYPES } from "../lib/schemas";
import { requiredDocuments, staticRules } from "../lib/rules";
import { followUps } from "../lib/ai/profile";
import { computeDeadlines } from "../lib/deadlines";

const PATH = "fixtures/demo-event.json";

async function main() {
  const fixture = JSON.parse(await readFile(PATH, "utf8"));
  const profile = EventProfile.parse(fixture.profile);
  fixture.questions = followUps(profile, staticRules);
  fixture.requirements = requiredDocuments(profile, staticRules);
  fixture.deadlines = profile.date.value ? computeDeadlines(profile.date.value, fixture.requirements) : [];
  await writeFile(PATH, JSON.stringify(fixture, null, 2) + "\n");

  const needed: string[] = fixture.requirements.map((r: any) => r.documentType);
  const have: string[] = fixture.documents.map((d: any) => d.documentType);
  console.log(`questions ${fixture.questions.length}, requirements ${needed.length}, deadlines ${fixture.deadlines.length} written`);
  for (const t of needed.filter((t) => !have.includes(t)))
    console.log(`documents: add ${t} (${DRAFTED_TYPES.has(t as any) ? "with a draft and checkResults" : 'status "manual", content null'})`);
  for (const t of have.filter((t) => !needed.includes(t))) console.log(`documents: remove ${t}`);
  console.log("Then keep documents in requirement order and run npm test.");
}
main();
