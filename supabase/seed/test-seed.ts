// TESTING ONLY. Seeds a "[TEST]" org with the fixture's demo event (profile, requirements, documents, deadlines)
// and two licences with fictional holder names, so the dashboard and event screens have real rows.
// Re-running replaces the previous test org. Nothing outside the "[TEST]" org is touched.
//   Seed:          npx tsx --env-file=.env.local supabase/seed/test-seed.ts [your-login-email]
//   Remove:        npx tsx --env-file=.env.local supabase/seed/test-seed.ts --remove
// With an email (you must have signed in to the app once), you are added as a member so you can see it.
import fixture from "../../fixtures/demo-event.json";
import { db } from "../../lib/supabase/admin";

const ORG_NAME = "[TEST] EvntX seed org";
const FICTIONAL_HOLDERS = ["Sample Sports Club Inc", "Jordan Example"]; // brief: fictional names only
const sb = db();

type Res<T> = { data: T; error: { message: string } | null };
/** For reads that must return rows. */
const must = <T>(r: Res<T>, what: string): NonNullable<T> => {
  if (r.error || r.data == null) throw new Error(`${what}: ${r.error?.message ?? "no data"}`);
  return r.data;
};
/** For writes, which return no rows. */
const ok = (r: { error: { message: string } | null }, what: string) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); };

async function removeTestOrgs() {
  const orgs = must(await sb.from("organisations").select("id").eq("name", ORG_NAME), "find test org");
  for (const o of orgs) ok(await sb.from("organisations").delete().eq("id", o.id), "delete test org"); // cascades
  return orgs.length;
}

async function findUserId(email: string) {
  const { data, error } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`list users: ${error.message}`);
  const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`No user ${email}: sign in to the app once first`);
  return user.id;
}

async function main() {
  const email = process.argv.find((a, i) => i > 1 && a.includes("@"));
  const userId = email ? await findUserId(email) : null; // before any write, so a bad email leaves nothing behind
  const removed = await removeTestOrgs();
  if (process.argv.includes("--remove")) return console.log(`removed ${removed} test org(s)`);

  const council = must(await sb.from("councils").select("id").eq("slug", fixture.profile.councilSlug).single(), "council");
  const org = must(await sb.from("organisations").insert({ name: ORG_NAME, council_id: council.id }).select("id").single(), "org");
  if (userId) ok(await sb.from("memberships").insert({ org_id: org.id, user_id: userId }), "membership");

  const ev = must(await sb.from("events").insert({ org_id: org.id, council_id: council.id, description: fixture.description,
    profile: fixture.profile, classification: fixture.classification }).select("id").single(), "event");

  ok(await sb.from("requirements").insert(fixture.requirements.map((r) => ({ event_id: ev.id, rule_id: r.ruleId,
    document_type: r.documentType, reason: r.reason, source_url: r.sourceUrl, last_checked: r.lastChecked }))), "requirements");
  ok(await sb.from("documents").insert(fixture.documents.map((d) => ({ event_id: ev.id, document_type: d.documentType,
    status: d.status, content: d.content, check_results: d.checkResults }))), "documents");
  ok(await sb.from("deadlines").insert(fixture.deadlines.map((d) => ({ event_id: ev.id, document_type: d.documentType,
    label: d.label, legal_minimum: d.legalMinimum, recommended: d.recommended }))), "deadlines");
  ok(await sb.from("licences").insert(fixture.licences.map((l, i) => ({ org_id: org.id, type: l.type,
    holder_name: FICTIONAL_HOLDERS[i] ?? "Sample Holder", expires_on: l.expiresOn }))), "licences");

  console.log(`seeded ${ORG_NAME}: event ${ev.id}, ${fixture.requirements.length} requirements, ${fixture.documents.length} documents,`,
    `${fixture.deadlines.length} deadlines, ${fixture.licences.length} licences${email ? `, member ${email}` : " (no member: pass your email to see it)"}`);
}
main();
